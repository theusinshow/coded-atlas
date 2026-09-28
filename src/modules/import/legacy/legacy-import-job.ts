import { createHash } from "node:crypto";
import { z } from "zod";
import { createAsset } from "../../../core/assets/asset";
import type { AssetStorage } from "../../../core/assets/asset-storage";
import { createCapture } from "../../../core/assets/capture";
import { createOutput } from "../../../core/assets/output";
import type { AssetRepository, CaptureRepository, OutputRepository } from "../../../core/assets/repositories";
import { contentStorageKey } from "../../../core/assets/storage-key";
import { createJob, type Job } from "../../../core/jobs/job";
import type { JobRepository } from "../../../core/jobs/repository";
import { createProject, type Project } from "../../../core/projects/project";
import type { ProjectRepository, SourceRepository } from "../../../core/projects/repositories";
import { createSource } from "../../../core/projects/source";
import { isDomainError } from "../../../shared/errors";
import { JobIdSchema, type AssetId } from "../../../shared/id";
import { parseOrThrow } from "../../../shared/validation";
import type { JobContext, JobHandler } from "../../../workers/job-worker";
import type { MediaProbe } from "../media-probe";
import type { LegacyImportLedger } from "./legacy-ledger";
import type { LegacyStore } from "./legacy-store";
import type { LegacyFileDescriptor } from "./map-catalog";
import { scanLegacyLibrary, type LegacyScannedProject } from "./scan-legacy-library";

export const LegacyImportPayloadSchema = z.strictObject({
  /** Vazio = todas as pastas que precisam de importação/atualização. */
  slugs: z.array(z.string().max(80)).max(500).optional(),
});

export interface LegacyImportDeps {
  store: LegacyStore;
  ledger: LegacyImportLedger;
  projects: ProjectRepository;
  sources: SourceRepository;
  captures: CaptureRepository;
  assets: AssetRepository;
  outputs: OutputRepository;
  jobs: JobRepository;
  storage: AssetStorage;
  probe: MediaProbe;
}

type Plan = { project: LegacyScannedProject; mode: "create" | "refresh" };

/** O que precisa ser feito com a biblioteca v1 agora (sem efeitos colaterais). */
export async function planLegacyImport(deps: Pick<LegacyImportDeps, "store" | "ledger">, slugs?: readonly string[]): Promise<Plan[]> {
  const report = await scanLegacyLibrary(deps.store);
  const plans: Plan[] = [];
  for (const project of report.projects) {
    if (slugs && !slugs.includes(project.slug)) continue;
    const entry = await deps.ledger.get(project.slug);
    const changed = entry?.catalogCreatedAt !== project.capturedAt;
    // Falha só é retentada se o catálogo mudou ou se o slug foi pedido explicitamente.
    if (!entry || (entry.status === "failed" && (changed || slugs?.includes(project.slug)))) {
      plans.push({ project, mode: "create" });
    }
    else if (entry.status === "imported" && entry.projectId && changed) {
      plans.push({ project, mode: "refresh" }); // recapturado no v1 depois da importação
    }
  }
  return plans;
}

/**
 * Enfileira a importação se houver algo a importar e nenhuma importação pendente.
 * Chamado na inicialização do worker e pelo botão "Sincronizar biblioteca v1".
 */
export async function ensureLegacyImportQueued(deps: LegacyImportDeps, slugs?: readonly string[]): Promise<Job | null> {
  const pending = (await deps.jobs.listRecent({ types: ["import"], statuses: ["queued", "preparing", "running"], limit: 1 }))[0];
  if (pending) return null;
  if ((await planLegacyImport(deps, slugs)).length === 0) return null;
  return deps.jobs.create(createJob({ type: "import", payload: slugs ? { slugs: [...slugs] } : {} }));
}

/**
 * Handler do job `import`: traz projetos da biblioteca v1 para o modelo novo,
 * sem tocar em public/generated. Por projeto: bytes → staging → commit →
 * registros (Project/Source/Capture/Assets/Outputs). Falha de um projeto fica
 * registrada no ledger e não derruba os outros.
 */
export function createLegacyImportJobHandler(deps: LegacyImportDeps): JobHandler {
  return {
    timeoutMs: 60 * 60_000,
    run: async (ctx) => {
      const payload = parseOrThrow(LegacyImportPayloadSchema, ctx.job.payload, "Payload da importação v1");
      const plans = await planLegacyImport(deps, payload.slugs);
      const summary = { created: 0, refreshed: 0, failed: 0, filesImported: 0, filesMissing: 0, errors: [] as string[] };

      for (const [index, plan] of plans.entries()) {
        ctx.throwIfAborted();
        await ctx.progress(Math.round((index / Math.max(plans.length, 1)) * 100), `Importando ${plan.project.slug}…`);
        try {
          const counts = await importOne(deps, ctx, plan);
          summary[plan.mode === "create" ? "created" : "refreshed"]++;
          summary.filesImported += counts.imported;
          summary.filesMissing += counts.missing;
        } catch (err) {
          if (ctx.signal.aborted) throw err;
          summary.failed++;
          const message = err instanceof Error ? err.message : String(err);
          summary.errors.push(`${plan.project.slug}: ${message}`.slice(0, 300));
          await deps.ledger.record({
            slug: plan.project.slug,
            projectId: null,
            status: "failed",
            catalogCreatedAt: plan.project.capturedAt,
            error: message.slice(0, 1000),
          });
          ctx.logger.warn("importação v1 falhou", { slug: plan.project.slug, error: err });
        }
      }
      return summary;
    },
  };
}

async function importOne(deps: LegacyImportDeps, ctx: JobContext, plan: Plan): Promise<{ imported: number; missing: number }> {
  const snapshot = plan.project;

  // 1. Bytes: lê, identifica e prepara tudo antes de gravar qualquer registro.
  const staging = await deps.storage.beginStaging();
  const prepared: { file: LegacyFileDescriptor; key: ReturnType<typeof contentStorageKey>; sha256: string; byteSize: number; width: number | null; height: number | null; mimeType: string }[] = [];
  let missing = 0;
  try {
    for (const file of snapshot.files) {
      ctx.throwIfAborted();
      const bytes = await deps.store.readPublicFile(file.publicPath);
      if (!bytes) {
        missing++;
        continue;
      }
      const probed = await deps.probe.probe(bytes);
      if (!probed) {
        missing++;
        continue;
      }
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const key = contentStorageKey(file.target === "output" ? "outputs" : "assets", sha256, probed.extension);
      const stored = await staging.put(key, bytes);
      prepared.push({ file, key, sha256, byteSize: stored.byteSize, width: probed.width, height: probed.height, mimeType: probed.mimeType });
    }
    await staging.commit();
  } catch (err) {
    await staging.discard();
    throw err;
  }

  // 2. Registros.
  const project = plan.mode === "create" ? await createLegacyProject(deps, snapshot) : await existingProject(deps, snapshot.slug);
  const sources = await deps.sources.listByProject(project.id);
  const source =
    sources.find((s) => s.type === "url" && s.locator === snapshot.source.locator) ??
    (await deps.sources.create(createSource({ projectId: project.id, type: "url", locator: snapshot.source.locator })));

  let capture = await deps.captures.create(
    createCapture({
      projectId: project.id,
      sourceId: source.id,
      jobId: JobIdSchema.parse(ctx.job.id),
      type: "device",
      params: { url: snapshot.source.locator },
    })
  );
  // A data do catálogo pode vir com offset (editado à mão); o domínio guarda UTC ISO.
  const parsedAt = Date.parse(snapshot.capturedAt);
  const capturedAt = Number.isNaN(parsedAt) ? capture.createdAt : new Date(parsedAt).toISOString();
  capture = await deps.captures.update({ ...capture, status: "completed", startedAt: capturedAt, completedAt: capturedAt });

  const idByPath = new Map<string, AssetId>();
  let cover: AssetId | null = null;
  let desktopViewport: AssetId | null = null;
  // Originais antes dos derivados, para a linhagem (thumbnail/capa → screenshot) resolver.
  const ordered = [...prepared].sort((a, b) => Number(Boolean(a.file.derivedFrom)) - Number(Boolean(b.file.derivedFrom)));
  for (const item of ordered) {
    const { file } = item;
    if (file.target === "output") {
      await deps.outputs.create(
        createOutput({
          projectId: project.id,
          format: file.format,
          mimeType: item.mimeType,
          storageKey: item.key,
          sha256: item.sha256,
          byteSize: item.byteSize,
          width: item.width,
          height: item.height,
          label: file.label,
          sourceAssetIds: [],
        })
      );
      continue;
    }
    const asset = await deps.assets.create(
      createAsset({
        projectId: project.id,
        captureId: capture.id,
        kind: file.kind,
        storageKey: item.key,
        sha256: item.sha256,
        mimeType: item.mimeType,
        byteSize: item.byteSize,
        width: item.width,
        height: item.height,
        label: file.label,
        parentAssetId: file.derivedFrom ? (idByPath.get(file.derivedFrom) ?? null) : null,
        metadata: {
          origin: "legacy",
          role: file.role,
          legacyPath: file.publicPath,
          ...(file.device ? { device: file.device } : {}),
          ...(file.role === "section" && file.label ? { sectionName: file.label } : {}),
          ...(file.role.startsWith("page-") && file.label ? { pagePath: file.label } : {}),
          ...(file.role === "state" && file.label ? { stateName: file.label } : {}),
        },
      })
    );
    idByPath.set(file.publicPath, asset.id);
    if (file.role === "cover") cover = asset.id;
    if (file.role === "viewport" && file.device === "desktop") desktopViewport = asset.id;
  }

  const coverAssetId = cover ?? desktopViewport;
  if (coverAssetId && (plan.mode === "create" || project.coverAssetId === null)) {
    await deps.projects.update({ ...project, coverAssetId });
  }
  await deps.ledger.record({
    slug: snapshot.slug,
    projectId: project.id,
    status: "imported",
    catalogCreatedAt: snapshot.capturedAt,
    error: null,
  });
  return { imported: prepared.length, missing };
}

async function createLegacyProject(deps: LegacyImportDeps, snapshot: LegacyScannedProject): Promise<Project> {
  try {
    return await deps.projects.create(
      createProject({ ...snapshot.project, description: snapshot.unmapped.description, origin: "legacy" })
    );
  } catch (err) {
    if (isDomainError(err, "CONFLICT")) {
      throw new Error(`o slug "${snapshot.slug}" já é usado por um projeto do Atlas 2.x`);
    }
    throw err;
  }
}

async function existingProject(deps: LegacyImportDeps, slug: string): Promise<Project> {
  const entry = await deps.ledger.get(slug);
  const project = entry?.projectId ? await deps.projects.getById(entry.projectId) : null;
  if (!project) throw new Error("projeto importado anteriormente não existe mais");
  return project;
}

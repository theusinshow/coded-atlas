import { createHash } from "node:crypto";
import { z } from "zod";
import { createAsset, type Asset } from "../../core/assets/asset";
import type { AssetStorage, StagingArea } from "../../core/assets/asset-storage";
import { createCapture, type Capture } from "../../core/assets/capture";
import { CapturePlanSchema, resolvePageUrl, type CaptureDevice, type CapturePlan } from "../../core/assets/capture-plan";
import type { AssetRepository, CaptureRepository } from "../../core/assets/repositories";
import { contentStorageKey } from "../../core/assets/storage-key";
import { createVisualProfile, type VisualProfileRepository } from "../../core/creative/visual-profile";
import type { Project } from "../../core/projects/project";
import type { ProjectRepository, SourceRepository } from "../../core/projects/repositories";
import type { Source } from "../../core/projects/source";
import { DomainError, isDomainError } from "../../shared/errors";
import { JobIdSchema, SourceIdSchema } from "../../shared/id";
import { nowIso, parseOrThrow } from "../../shared/validation";
import type { JobContext, JobHandler } from "../../workers/job-worker";
import type { ImageTransformer } from "../assets/image-transformer";
import type { CaptureEngine, CapturedMedia, CaptureWarning, ViewportSpec } from "./capture-engine";

export const CaptureJobPayloadSchema = z.strictObject({
  sourceId: SourceIdSchema,
  /** Sem plano = só o viewport desktop (fatia mínima); com plano = captura completa. */
  plan: CapturePlanSchema.optional(),
});
export type CaptureJobPayload = z.infer<typeof CaptureJobPayloadSchema>;

export interface CaptureJobDeps {
  projects: ProjectRepository;
  sources: SourceRepository;
  captures: CaptureRepository;
  assets: AssetRepository;
  visualProfiles: VisualProfileRepository;
  storage: AssetStorage;
  engine: CaptureEngine;
  images: ImageTransformer;
  /** Dimensões de cada device nesta instalação (lib/config.ts). */
  viewports: Record<CaptureDevice, ViewportSpec>;
  timeoutMs: number;
  assertUrlAllowed?: (url: string) => Promise<void>;
}

/** Capa derivada: 1.91:1 (padrão Open Graph), boa para portfólio e redes. */
export const COVER_SIZE = { width: 1200, height: 630 } as const;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

interface Staged {
  media: CapturedMedia;
  key: ReturnType<typeof contentStorageKey>;
  sha256: string;
  byteSize: number;
}

/**
 * Handler do job `capture`.
 *
 * Transacional: todos os bytes (screenshots, seções, vídeos, capa derivada) vão
 * para a staging do AssetStorage, são validados e publicados de uma vez; só
 * depois vêm os registros (Assets, Capture concluída, capa, VisualProfile).
 * Cancelamento, timeout ou erro descartam a staging — nenhum byte ou Asset parcial.
 */
export function createCaptureJobHandler(deps: CaptureJobDeps): JobHandler {
  return {
    timeoutMs: deps.timeoutMs,
    run: async (ctx) => {
      const payload = parseOrThrow(CaptureJobPayloadSchema, ctx.job.payload, "Payload do job de captura");
      const source = await deps.sources.getById(payload.sourceId);
      if (!source) throw new DomainError("NOT_FOUND", `Source ${payload.sourceId} não existe.`);
      if (source.type !== "url" && source.type !== "local") {
        throw new DomainError("VALIDATION", "A captura exige uma Source de URL (ou servidor de dev local).");
      }
      const project = await deps.projects.getById(source.projectId);
      if (!project) throw new DomainError("NOT_FOUND", `Projeto ${source.projectId} não existe.`);

      const plan = payload.plan;
      let capture = await deps.captures.create(
        createCapture({
          projectId: project.id,
          sourceId: source.id,
          jobId: JobIdSchema.parse(ctx.job.id),
          type: plan ? "page" : "device",
          params: plan ? { url: source.locator, plan } : { url: source.locator, viewport: deps.viewports.desktop, fullPage: false },
        })
      );
      capture = await deps.captures.update({ ...capture, status: "running", startedAt: nowIso() });

      const staging = await deps.storage.beginStaging();
      try {
        const result = plan
          ? await captureFull(deps, ctx, project, source, capture, staging, plan)
          : await captureViewportOnly(deps, ctx, project, source, capture, staging);
        capture = await deps.captures.update({ ...capture, status: "completed", completedAt: nowIso() });
        return { captureId: capture.id, ...result };
      } catch (err) {
        await staging.discard();
        // Registrar a falha não pode mascarar o erro original.
        await finishCapture(deps.captures, capture, ctx, err).catch((recordErr: unknown) =>
          ctx.logger.error("falha ao registrar o fim da captura", { error: recordErr })
        );
        throw err;
      }
    },
  };
}

async function captureViewportOnly(
  deps: CaptureJobDeps,
  ctx: JobContext,
  project: Project,
  source: Source,
  capture: Capture,
  staging: StagingArea
): Promise<Record<string, unknown>> {
  const vp = deps.viewports.desktop;
  await ctx.progress(10, `Capturando ${vp.label} (${vp.width}×${vp.height})…`);
  const shot = await deps.engine.captureViewport({ url: source.locator, viewport: vp, signal: ctx.signal });
  ctx.throwIfAborted();
  await ctx.progress(70, "Validando e guardando…");
  if (!PNG_SIGNATURE.every((byte, i) => shot.png[i] === byte)) {
    throw new DomainError("VALIDATION", "A engine devolveu bytes que não são PNG.");
  }
  const staged = await stage(staging, {
    bytes: shot.png,
    mimeType: "image/png",
    extension: "png",
    kind: "screenshot",
    width: shot.width,
    height: shot.height,
    label: `${vp.label} ${vp.width}×${vp.height}`,
    metadata: { origin: "capture", role: "viewport", device: "desktop", viewport: `${vp.width}x${vp.height}` },
  });
  ctx.throwIfAborted(); // última chance de desistir antes de publicar
  await staging.commit();
  const [asset] = await persistAssets(deps, project, capture, [staged]);
  if (project.coverAssetId === null) await deps.projects.update({ ...project, coverAssetId: asset.id });
  return { assetIds: [asset.id], finalUrl: shot.finalUrl, warnings: [] };
}

async function captureFull(
  deps: CaptureJobDeps,
  ctx: JobContext,
  project: Project,
  source: Source,
  capture: Capture,
  staging: StagingArea,
  plan: CapturePlan
): Promise<Record<string, unknown>> {
  const pages: string[] = [];
  const warnings: CaptureWarning[] = [];
  for (const entry of plan.pages) {
    try {
      const url = resolvePageUrl(entry, source.locator);
      await deps.assertUrlAllowed?.(url);
      if (!pages.includes(url) && url !== source.locator) pages.push(url);
    } catch (err) {
      warnings.push({ code: "PAGE_CAPTURE_FAILED", message: `Página "${entry}" ignorada: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  await ctx.progress(3, "Abrindo o navegador…");
  const result = await deps.engine.captureSite({
    url: source.locator,
    viewports: plan.devices.map((d) => deps.viewports[d]),
    fullPage: plan.fullPage,
    sections: plan.sections,
    video: plan.video,
    inspect: plan.inspect,
    pages,
    states: plan.states,
    signal: ctx.signal,
    onProgress: (fraction, message) => {
      ctx.progress(5 + Math.round(fraction * 80), message).catch((err: unknown) => ctx.logger.warn("progresso não registrado", { error: err }));
    },
  });
  ctx.throwIfAborted();
  warnings.push(...result.warnings);
  if (result.media.length === 0) throw new DomainError("VALIDATION", "A captura não produziu nenhuma imagem.");

  await ctx.progress(88, `Guardando ${result.media.length} arquivos…`);
  const staged: Staged[] = [];
  for (const media of result.media) staged.push(await stage(staging, media));

  // Capa derivada do viewport desktop (ou do primeiro screenshot disponível).
  const coverSource =
    staged.find((s) => s.media.metadata.role === "viewport" && s.media.metadata.device === "desktop") ??
    staged.find((s) => s.media.kind === "screenshot");
  let coverStaged: Staged | null = null;
  if (coverSource) {
    const cover = await deps.images.coverCrop(coverSource.media.bytes, COVER_SIZE.width, COVER_SIZE.height);
    coverStaged = await stage(staging, {
      bytes: cover.bytes,
      mimeType: cover.mimeType,
      extension: cover.extension,
      kind: "screenshot",
      width: cover.width,
      height: cover.height,
      label: "Capa 1.91:1",
      metadata: { origin: "derived", role: "cover", ...(coverSource.media.metadata.device ? { device: coverSource.media.metadata.device } : {}) },
    });
  }
  ctx.throwIfAborted(); // última chance de desistir antes de publicar
  await staging.commit();

  await ctx.progress(95, "Registrando assets…");
  const assets = await persistAssets(deps, project, capture, staged);
  let coverAsset: Asset | null = null;
  if (coverStaged && coverSource) {
    const parent = assets[staged.indexOf(coverSource)];
    [coverAsset] = await persistAssets(deps, project, capture, [coverStaged], parent.id);
  }
  if (project.coverAssetId === null && coverAsset) await deps.projects.update({ ...project, coverAssetId: coverAsset.id });

  let visualProfileRevision: number | null = null;
  if (result.inspection) {
    const previous = await deps.visualProfiles.latest(project.id);
    const profile = await deps.visualProfiles.create(
      createVisualProfile({
        projectId: project.id,
        revision: (previous?.revision ?? 0) + 1,
        palette: result.inspection.colors,
        fonts: result.inspection.fonts,
        techStack: result.inspection.techStack,
        ogImageUrl: result.inspection.ogImage ?? null,
        source: "inspection",
        captureId: capture.id,
      })
    );
    visualProfileRevision = profile.revision;
  }

  return {
    assetIds: [...assets, ...(coverAsset ? [coverAsset] : [])].map((a) => a.id),
    assets: assets.length + (coverAsset ? 1 : 0),
    finalUrl: result.finalUrl,
    visualProfileRevision,
    warnings,
  };
}

async function stage(staging: StagingArea, media: CapturedMedia): Promise<Staged> {
  const sha256 = createHash("sha256").update(media.bytes).digest("hex");
  const key = contentStorageKey(media.kind === "video" ? "videos" : "captures", sha256, media.extension);
  const stored = await staging.put(key, media.bytes);
  return { media, key, sha256, byteSize: stored.byteSize };
}

async function persistAssets(
  deps: CaptureJobDeps,
  project: Project,
  capture: Capture,
  staged: Staged[],
  parentAssetId: Asset["id"] | null = null
): Promise<Asset[]> {
  const created: Asset[] = [];
  for (const item of staged) {
    created.push(
      await deps.assets.create(
        createAsset({
          projectId: project.id,
          captureId: capture.id,
          parentAssetId,
          kind: item.media.kind,
          storageKey: item.key,
          sha256: item.sha256,
          mimeType: item.media.mimeType,
          byteSize: item.byteSize,
          width: item.media.width,
          height: item.media.height,
          label: item.media.label.slice(0, 200),
          metadata: item.media.metadata,
        })
      )
    );
  }
  return created;
}

async function finishCapture(captures: CaptureRepository, capture: Capture, ctx: JobContext, err: unknown): Promise<void> {
  const cancelled = ctx.signal.aborted && isDomainError(ctx.signal.reason, "CANCELLED");
  const error = isDomainError(err)
    ? { code: err.code, message: err.message.slice(0, 2000) }
    : { code: "CAPTURE_FAILED", message: (err instanceof Error ? err.message : String(err)).slice(0, 2000) };
  await captures.update({
    ...capture,
    status: cancelled ? "cancelled" : "failed",
    error,
    completedAt: nowIso(),
  });
}

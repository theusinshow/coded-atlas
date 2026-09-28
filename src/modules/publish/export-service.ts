import { createHash } from "node:crypto";
import { z } from "zod";
import type { AssetStorage } from "../../core/assets/asset-storage";
import type { Output } from "../../core/assets/output";
import type { AssetRepository, OutputRepository } from "../../core/assets/repositories";
import { contentStorageKey } from "../../core/assets/storage-key";
import type { VisualProfileRepository } from "../../core/creative/visual-profile";
import { createJob, type Job } from "../../core/jobs/job";
import type { JobRepository } from "../../core/jobs/repository";
import type { Project } from "../../core/projects/project";
import type { ProjectRepository, SourceRepository } from "../../core/projects/repositories";
import {
  ExportIdSchema,
  buildPackageManifest,
  buildPortfolioEntry,
  createExport,
  packagePaths,
  type ExportDestination,
  type ExportRecord,
  type ExportRepository,
  type PortfolioEntry,
} from "../../core/publish/export";
import { DomainError } from "../../shared/errors";
import type { ProjectId } from "../../shared/id";
import { nowIso, parseOrThrow } from "../../shared/validation";
import type { JobHandler } from "../../workers/job-worker";
import type { DeliveryFile, FolderDestination, GithubDestination } from "./destinations";

/**
 * Publish (docs/ROADMAP.md 2.14): pacotes organizados e portfólio. Toda entrega
 * nasce de um clique do Matheus (AI-GUARDRAILS → User approval): o pedido cria um
 * registro de Export + um job `export`; o job lê Outputs imutáveis e entrega no
 * destino escolhido. Nada é apagado nem sobrescrito na pasta local; no GitHub,
 * cada entrega é um commit novo sobre o branch configurado.
 */
export interface ExportDeps {
  projects: ProjectRepository;
  sources: SourceRepository;
  assets: AssetRepository;
  outputs: OutputRepository;
  visualProfiles: VisualProfileRepository;
  exports: ExportRepository;
  jobs: JobRepository;
  storage: AssetStorage;
  folder: FolderDestination;
  github: GithubDestination;
  /** Monta o ZIP (infra: archiver) — o módulo só entrega a lista de arquivos. */
  zip: (files: readonly DeliveryFile[]) => Promise<Uint8Array>;
}

export type ExportRequestDeps = Pick<ExportDeps, "projects" | "outputs" | "exports" | "jobs" | "github">;

export const ExportJobPayloadSchema = z.strictObject({ exportId: ExportIdSchema });

const MAX_OUTPUTS = 500;

export function destinationStatus(deps: Pick<ExportDeps, "folder" | "github">): Record<ExportDestination, { available: boolean; label: string }> {
  return {
    download: { available: true, label: "ZIP para baixar" },
    folder: { available: deps.folder.configured, label: deps.folder.label },
    github: { available: deps.github.configured, label: deps.github.label },
  };
}

function assertDestination(deps: Pick<ExportDeps, "github">, destination: ExportDestination): void {
  if (destination === "github" && !deps.github.configured) {
    throw new DomainError("VALIDATION", "GitHub não configurado — defina ATLAS_GITHUB_TOKEN e ATLAS_GITHUB_REPO para publicar no repositório do portfólio.");
  }
}

function uniqueIds(ids: readonly string[]): string[] {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) throw new DomainError("VALIDATION", "Escolha ao menos uma peça.");
  if (unique.length > MAX_OUTPUTS) throw new DomainError("VALIDATION", `No máximo ${MAX_OUTPUTS} peças por exportação.`);
  return unique;
}

async function enqueue(deps: ExportRequestDeps, record: ExportRecord): Promise<{ record: ExportRecord; job: Job }> {
  const created = await deps.exports.create(record);
  const job = await deps.jobs.create(createJob({ type: "export", projectId: created.projectId, payload: { exportId: created.id } }));
  const withJob = await deps.exports.update({ ...created, jobId: job.id });
  return { record: withJob, job };
}

/** Pacote de UM projeto: peças escolhidas em Publicar, pastas por tipo + manifest.json. */
export async function requestPackage(
  deps: ExportRequestDeps,
  input: { projectId: ProjectId; outputIds: readonly string[]; destination: ExportDestination; name?: string }
): Promise<{ record: ExportRecord; job: Job }> {
  const project = await deps.projects.getById(input.projectId);
  if (!project) throw new DomainError("NOT_FOUND", "Projeto não encontrado.");
  assertDestination(deps, input.destination);
  const ids = uniqueIds(input.outputIds);
  const mine = new Set((await deps.outputs.listByProject(project.id)).map((o) => o.id as string));
  const foreign = ids.filter((id) => !mine.has(id));
  if (foreign.length > 0) throw new DomainError("VALIDATION", "Há peças que não pertencem a este projeto.");
  const name = input.name?.trim() || `${project.name} · pacote`;
  return enqueue(deps, createExport({ projectId: project.id, kind: "package", name: name.slice(0, 120), destination: input.destination, outputIds: ids }));
}

/** Portfólio: peças de vários projetos + portfolio.json compatível com o manifesto do v1. */
export async function requestPortfolio(
  deps: ExportRequestDeps,
  input: { outputIds: readonly string[]; destination: ExportDestination; name?: string }
): Promise<{ record: ExportRecord; job: Job }> {
  assertDestination(deps, input.destination);
  const ids = uniqueIds(input.outputIds);
  const projects = new Set<string>();
  for (const id of ids) {
    const output = await deps.outputs.getById(id as Output["id"]);
    if (!output) throw new DomainError("NOT_FOUND", "Uma das peças escolhidas não existe mais.");
    projects.add(output.projectId);
  }
  const name = input.name?.trim() || `Portfólio · ${projects.size} ${projects.size === 1 ? "projeto" : "projetos"}`;
  return enqueue(deps, createExport({ projectId: null, kind: "portfolio", name: name.slice(0, 120), destination: input.destination, outputIds: ids }));
}

// ── Montagem dos arquivos ───────────────────────────────────────────────────

const json = (value: unknown): Uint8Array => new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);

async function projectUrl(deps: Pick<ExportDeps, "sources">, projectId: ProjectId): Promise<string | null> {
  return (await deps.sources.listByProject(projectId)).find((s) => s.type === "url")?.locator ?? null;
}

async function loadOutputs(deps: Pick<ExportDeps, "outputs">, ids: readonly string[]): Promise<Output[]> {
  const outputs: Output[] = [];
  for (const id of ids) {
    const output = await deps.outputs.getById(id as Output["id"]);
    if (!output) throw new DomainError("NOT_FOUND", `A peça ${id} não existe mais — refaça a seleção.`);
    outputs.push(output);
  }
  return outputs;
}

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

async function portfolioProject(deps: ExportDeps, project: Project, outputs: Output[], files: DeliveryFile[]): Promise<PortfolioEntry> {
  const prefix = `${project.slug}/`;
  const paths = packagePaths(outputs, prefix);
  for (const o of outputs) files.push({ path: paths.get(o.id)!, bytes: await deps.storage.get(o.storageKey) });
  let cover: string | null = null;
  const coverAsset = project.coverAssetId ? await deps.assets.getById(project.coverAssetId) : null;
  if (coverAsset && EXT[coverAsset.mimeType]) {
    cover = `${prefix}capa.${EXT[coverAsset.mimeType]}`;
    files.push({ path: cover, bytes: await deps.storage.get(coverAsset.storageKey) });
  }
  const images = outputs.filter((o) => o.mimeType.startsWith("image/") && o.width && o.height);
  const landscape = images.find((o) => o.width! >= o.height!);
  const portrait = images.find((o) => o.height! > o.width!);
  return buildPortfolioEntry({
    project,
    url: await projectUrl(deps, project.id),
    profile: await deps.visualProfiles.latest(project.id),
    outputs,
    paths,
    cover,
    thumbnail: landscape ? paths.get(landscape.id)! : null,
    thumbnailMobile: portrait ? paths.get(portrait.id)! : null,
  });
}

/** Lista final de arquivos (caminhos relativos seguros) e o nome-base da entrega. */
export async function buildDelivery(deps: ExportDeps, record: ExportRecord): Promise<{ base: string; files: DeliveryFile[] }> {
  const outputs = await loadOutputs(deps, record.outputIds);
  const files: DeliveryFile[] = [];
  if (record.kind === "package") {
    const project = record.projectId ? await deps.projects.getById(record.projectId) : null;
    if (!project) throw new DomainError("NOT_FOUND", "Projeto do pacote não encontrado.");
    const paths = packagePaths(outputs);
    for (const o of outputs) files.push({ path: paths.get(o.id)!, bytes: await deps.storage.get(o.storageKey) });
    files.push({ path: "manifest.json", bytes: json(buildPackageManifest(project, await projectUrl(deps, project.id), outputs, paths)) });
    return { base: project.slug, files };
  }
  const byProject = new Map<string, Output[]>();
  for (const o of outputs) byProject.set(o.projectId, [...(byProject.get(o.projectId) ?? []), o]);
  const entries: PortfolioEntry[] = [];
  for (const [projectId, mine] of byProject) {
    const project = await deps.projects.getById(projectId as ProjectId);
    if (!project) throw new DomainError("NOT_FOUND", "Um dos projetos do portfólio não existe mais.");
    entries.push(await portfolioProject(deps, project, mine, files));
  }
  files.push({ path: "portfolio.json", bytes: json({ generator: "Coded Atlas", version: 2, createdAt: nowIso(), projects: entries }) });
  return { base: "portfolio", files };
}

/**
 * Carimbo da pasta de entrega no horário LOCAL da máquina (o nome que o Matheus vê
 * no explorador de arquivos): `2026-09-28-140509`. Seguro em qualquer sistema de arquivos.
 */
export function deliveryStamp(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function createExportJobHandler(deps: ExportDeps): JobHandler {
  return {
    timeoutMs: 15 * 60_000,
    run: async (ctx) => {
      const { exportId } = parseOrThrow(ExportJobPayloadSchema, ctx.job.payload, "Payload da exportação");
      const initial = await deps.exports.getById(exportId);
      if (!initial) throw new DomainError("NOT_FOUND", "Exportação não encontrada.");
      let record = await deps.exports.update({ ...initial, status: "running", result: {} });
      try {
        await ctx.progress(10, "Reunindo as peças…");
        const { base, files } = await buildDelivery(deps, record);
        ctx.throwIfAborted();
        await ctx.progress(60, "Entregando…");
        let result: ExportRecord["result"];
        if (record.destination === "download") {
          const bytes = await deps.zip(files);
          const sha256 = createHash("sha256").update(bytes).digest("hex");
          const storageKey = contentStorageKey("exports", sha256, "zip");
          const staging = await deps.storage.beginStaging();
          try {
            await staging.put(storageKey, bytes);
            ctx.throwIfAborted();
            await staging.commit();
          } catch (err) {
            await staging.discard();
            throw err;
          }
          result = { archive: { storageKey, sha256, byteSize: bytes.byteLength }, files: files.length };
        } else if (record.destination === "folder") {
          const delivered = await deps.folder.deliver(`${base}-${deliveryStamp(record.createdAt)}`, files);
          result = { folder: delivered.folder, files: delivered.files };
        } else {
          const delivered = await deps.github.deliver(base, files, `Coded Atlas: ${record.name}`);
          result = { commitUrl: delivered.commitUrl, files: delivered.files };
        }
        record = await deps.exports.update({ ...record, status: "delivered", result });
        return { exportId: record.id, destination: record.destination, files: result.files ?? 0 };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await deps.exports.update({ ...record, status: "failed", result: { error: message.slice(0, 500) } });
        throw err;
      }
    },
  };
}

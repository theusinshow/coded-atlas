import type { ExportRepository } from "../../core/publish/export";
import type { AssetStorage } from "../../core/assets/asset-storage";
import type { AssetRepository, OutputRepository } from "../../core/assets/repositories";
import type { StorageKey } from "../../core/assets/storage-key";
import { CAPTURE_PROFILES, CapturePlanSchema, type CapturePlan } from "../../core/assets/capture-plan";
import { parseOrThrow } from "../../shared/validation";
import { ACTIVE_JOB_STATUSES, createJob, type Job, type JobStatus } from "../../core/jobs/job";
import type { JobRepository } from "../../core/jobs/repository";
import {
  createProject,
  editProject,
  setProjectStatus,
  SlugSchema,
  type Project,
  type ProjectPatch,
} from "../../core/projects/project";
import type { ProjectRepository, SourceRepository } from "../../core/projects/repositories";
import { createSource, type Source, type SourceType } from "../../core/projects/source";
import { DomainError } from "../../shared/errors";
import type { AssetId, ProjectId, SourceId } from "../../shared/id";
import type { CaptureJobPayload } from "../capture/capture-job";
import type { LegacyImportLedger } from "../import/legacy/legacy-ledger";

export interface ProjectServiceDeps {
  projects: ProjectRepository;
  sources: SourceRepository;
  assets: AssetRepository;
  outputs: OutputRepository;
  jobs: JobRepository;
  storage: AssetStorage;
  legacyImports: LegacyImportLedger;
  assertUrlAllowed?: (url: string) => Promise<void>;
  /** Chaves de cache derivadas de um objeto (ex.: miniaturas) — apagadas junto com os bytes. */
  derivedCacheKeys?: (key: StorageKey, sha256: string) => StorageKey[];
  /** Pacotes gerados (2.14): o ZIP de cada exportação do projeto sai junto. */
  exports?: Pick<ExportRepository, "listByProject">;
}

/** Slug a partir do nome (mesmo algoritmo do v1), garantindo unicidade com sufixo. */
export function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72)
    .replace(/-$/, "");
}

async function uniqueSlug(projects: ProjectRepository, base: string): Promise<string> {
  const root = base || "projeto";
  for (let i = 1; i < 1000; i++) {
    const candidate = i === 1 ? root : `${root}-${i}`;
    if (!(await projects.getBySlug(candidate))) return candidate;
  }
  throw new DomainError("CONFLICT", "Não foi possível gerar um slug livre.");
}

export interface NewProjectRequest {
  name: string;
  category: string;
  slug?: string;
  client?: string;
  description?: string;
  url?: string;
  captureNow?: boolean;
}

/**
 * Cria um projeto (+ source URL opcional e, se pedido, o job de captura).
 * Slug explícito em uso → CONFLICT; slug derivado do nome ganha sufixo livre.
 */
export async function createNewProject(
  deps: ProjectServiceDeps,
  request: NewProjectRequest
): Promise<{ project: Project; source: Source | null; job: Job | null }> {
  const url = request.url?.trim();
  if (url) await validateLocator(deps, "url", url);
  const slug = request.slug?.trim()
    ? request.slug.trim()
    : await uniqueSlug(deps.projects, slugFromName(request.name));

  const project = await deps.projects.create(
    createProject({
      slug,
      name: request.name,
      category: request.category,
      client: request.client,
      description: request.description,
    })
  );
  const source = url ? await deps.sources.create(createSource({ projectId: project.id, type: "url", locator: url })) : null;
  const job =
    source && request.captureNow ? await enqueueCapture(deps, project.id, source.id) : null;
  return { project, source, job };
}

/** Enfileira uma captura. Sem plano explícito usa o perfil "rápido" (matéria-prima completa sem vídeo). */
export async function enqueueCapture(
  deps: Pick<ProjectServiceDeps, "jobs" | "sources">,
  projectId: ProjectId,
  sourceId: SourceId,
  plan: CapturePlan = CAPTURE_PROFILES.quick
): Promise<Job> {
  const source = await deps.sources.getById(sourceId);
  if (!source || source.projectId !== projectId) throw new DomainError("NOT_FOUND", "Source não encontrada neste projeto.");
  if (source.type !== "url" && source.type !== "local") {
    throw new DomainError("VALIDATION", "Só sources de URL (ou dev local) podem ser capturadas.");
  }
  const payload: CaptureJobPayload = { sourceId, plan: parseOrThrow(CapturePlanSchema, plan, "Plano de captura") };
  return deps.jobs.create(createJob({ type: "capture", projectId, payload }));
}

/** Define a capa do projeto (asset de imagem do próprio projeto). */
export async function setProjectCover(deps: Pick<ProjectServiceDeps, "projects" | "assets">, projectId: ProjectId, assetId: AssetId): Promise<Project> {
  const project = await requireProject(deps.projects, projectId);
  const asset = await deps.assets.getById(assetId);
  if (!asset || asset.projectId !== projectId) throw new DomainError("NOT_FOUND", "Asset não encontrado neste projeto.");
  if (!asset.mimeType.startsWith("image/")) throw new DomainError("VALIDATION", "A capa precisa ser uma imagem.");
  return deps.projects.update({ ...project, coverAssetId: asset.id });
}

/**
 * Remove um asset ENVIADO manualmente (capturas são histórico e ficam). Apaga os
 * bytes se nenhum outro registro os usar. Se era a capa, o projeto fica sem capa.
 */
export async function deleteUploadedAsset(deps: ProjectServiceDeps, projectId: ProjectId, assetId: AssetId): Promise<void> {
  const project = await requireProject(deps.projects, projectId);
  const asset = await deps.assets.getById(assetId);
  if (!asset || asset.projectId !== projectId) throw new DomainError("NOT_FOUND", "Asset não encontrado neste projeto.");
  if (asset.metadata.origin !== "upload") throw new DomainError("VALIDATION", "Só arquivos enviados manualmente podem ser removidos.");
  await deps.assets.delete(asset.id);
  if (project.coverAssetId === asset.id) await deps.projects.update({ ...project, coverAssetId: null });
  const stillUsed = (await deps.assets.countByStorageKey(asset.storageKey)) + (await deps.outputs.countByStorageKey(asset.storageKey));
  if (stillUsed === 0) {
    await deps.storage.delete(asset.storageKey);
    for (const derived of deps.derivedCacheKeys?.(asset.storageKey, asset.sha256) ?? []) await deps.storage.delete(derived);
  }
}

export async function updateProjectDetails(deps: Pick<ProjectServiceDeps, "projects">, projectId: ProjectId, patch: ProjectPatch): Promise<Project> {
  const project = await requireProject(deps.projects, projectId);
  return deps.projects.update(editProject(project, patch));
}

export async function changeProjectStatus(
  deps: Pick<ProjectServiceDeps, "projects">,
  projectId: ProjectId,
  status: Project["status"]
): Promise<Project> {
  const project = await requireProject(deps.projects, projectId);
  return deps.projects.update(setProjectStatus(project, status));
}

/**
 * Exclusão definitiva. Exige a confirmação digitada do slug e nenhum job ativo.
 * Remove registros (cascata) e os bytes que não são mais referenciados por nenhum
 * outro Asset/Output. Projetos importados do v1 ficam marcados como dispensados
 * (não voltam na próxima sincronização) — a pasta v1 não é tocada.
 */
export async function deleteProjectPermanently(
  deps: ProjectServiceDeps,
  projectId: ProjectId,
  confirmation: string
): Promise<{ bytesRemoved: number }> {
  const project = await requireProject(deps.projects, projectId);
  if (confirmation.trim() !== project.slug) {
    throw new DomainError("VALIDATION", "Digite o slug do projeto para confirmar a exclusão.");
  }
  const active = (await deps.jobs.listByProject(projectId)).filter((j) =>
    (ACTIVE_JOB_STATUSES as readonly JobStatus[]).includes(j.status) || j.status === "queued"
  );
  if (active.length > 0) {
    throw new DomainError("CONFLICT", "Há jobs em andamento neste projeto. Cancele-os antes de excluir.");
  }

  const [assets, outputs] = await Promise.all([deps.assets.listByProject(projectId), deps.outputs.listByProject(projectId)]);
  const candidates = new Map<StorageKey, string>();
  for (const item of [...assets, ...outputs]) candidates.set(item.storageKey, item.sha256);
  const archives = new Set<StorageKey>();
  for (const record of (await deps.exports?.listByProject(projectId)) ?? []) if (record.result.archive) archives.add(record.result.archive.storageKey);

  await deps.projects.delete(projectId);
  if (project.origin === "legacy") {
    await deps.legacyImports.record({
      slug: project.slug,
      projectId: null,
      status: "dismissed",
      catalogCreatedAt: (await deps.legacyImports.get(project.slug))?.catalogCreatedAt ?? null,
      error: null,
    });
  }

  let bytesRemoved = 0;
  for (const [key, sha256] of candidates) {
    const stillUsed = (await deps.assets.countByStorageKey(key)) + (await deps.outputs.countByStorageKey(key));
    if (stillUsed > 0) continue; // bytes compartilhados com outro projeto (dedupe)
    await deps.storage.delete(key);
    for (const derived of deps.derivedCacheKeys?.(key, sha256) ?? []) await deps.storage.delete(derived);
    bytesRemoved++;
  }
  for (const key of archives) {
    if (candidates.has(key)) continue;
    await deps.storage.delete(key);
    bytesRemoved++;
  }
  return { bytesRemoved };
}

const GITHUB_REPO = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;

/** Normaliza e valida o locator conforme o tipo. Devolve o locator canônico. */
async function validateLocator(deps: Pick<ProjectServiceDeps, "assertUrlAllowed">, type: SourceType, raw: string): Promise<string> {
  const value = raw.trim();
  switch (type) {
    case "url":
    case "local": {
      await deps.assertUrlAllowed?.(value);
      return value;
    }
    case "github": {
      // Aceita "owner/repo" ou a URL do GitHub; guarda sempre "owner/repo".
      const fromUrl = /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+\/[^/\s#?]+?)(?:\.git)?\/?(?:[#?].*)?$/.exec(value);
      const repo = fromUrl ? fromUrl[1] : value;
      if (!GITHUB_REPO.test(repo)) throw new DomainError("VALIDATION", "Repositório GitHub inválido. Use owner/repo.");
      return repo;
    }
    case "upload":
      throw new DomainError("VALIDATION", "Sources de upload são criadas pelo envio de arquivos.");
  }
}

export async function addSource(
  deps: Pick<ProjectServiceDeps, "projects" | "sources" | "assertUrlAllowed">,
  projectId: ProjectId,
  input: { type: SourceType; locator: string; label?: string }
): Promise<Source> {
  await requireProject(deps.projects, projectId);
  const locator = await validateLocator(deps, input.type, input.locator);
  const existing = (await deps.sources.listByProject(projectId)).find((s) => s.type === input.type && s.locator === locator);
  if (existing) throw new DomainError("CONFLICT", "Esta source já está no projeto.");
  return deps.sources.create(createSource({ projectId, type: input.type, locator, label: input.label?.trim() || null }));
}

export async function removeSource(
  deps: Pick<ProjectServiceDeps, "sources" | "jobs">,
  projectId: ProjectId,
  sourceId: SourceId
): Promise<void> {
  const source = await deps.sources.getById(sourceId);
  if (!source || source.projectId !== projectId) throw new DomainError("NOT_FOUND", "Source não encontrada neste projeto.");
  const busy = (await deps.jobs.listByProject(projectId)).some(
    (j) => (j.status === "queued" || (ACTIVE_JOB_STATUSES as readonly JobStatus[]).includes(j.status)) && j.payload.sourceId === sourceId
  );
  if (busy) throw new DomainError("CONFLICT", "Há uma captura em andamento desta source.");
  await deps.sources.delete(sourceId);
}

export async function requireProject(projects: ProjectRepository, id: ProjectId): Promise<Project> {
  const project = await projects.getById(id);
  if (!project) throw new DomainError("NOT_FOUND", "Projeto não encontrado.");
  return project;
}

export async function requireProjectBySlug(projects: ProjectRepository, slug: string): Promise<Project> {
  const parsed = SlugSchema.safeParse(slug);
  const project = parsed.success ? await projects.getBySlug(parsed.data) : null;
  if (!project) throw new DomainError("NOT_FOUND", "Projeto não encontrado.");
  return project;
}

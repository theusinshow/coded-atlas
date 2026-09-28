import type { AssetRepository } from "../../core/assets/repositories";
import type { CreativePlanId, CreativePlanRepository } from "../../core/brain/plan";
import type { CompositionInstanceId, CompositionInstanceRepository } from "../../core/creative/composition";
import { getComposition } from "../../core/creative/compositions";
import { FORMATS, formatSize, type FormatId } from "../../core/creative/formats";
import { buildArtboard } from "../../core/creative/instance-artboard";
import type { StyleMode } from "../../core/creative/tokens";
import type { VisualProfileRepository } from "../../core/creative/visual-profile";
import {
  CanvasContentSchema,
  CarouselContentSchema,
  DocumentContentSchema,
  contentAssetIds,
  contentPages,
  isMotion,
  CreativeDocumentSchema,
  type DocumentContent,
  type CommitResult,
  type CreativeDocument,
  type CreativeDocumentId,
  type CreativeDocumentRepository,
} from "../../core/documents/creative-document";
import { createJob, type Job } from "../../core/jobs/job";
import type { JobRepository } from "../../core/jobs/repository";
import { MotionContentSchema, motionFromArtboards, websiteScrollScene } from "../../core/motion/motion";
import { buildRecipe, getRecipe } from "../../core/motion/recipes";
import type { ProjectRepository, SourceRepository } from "../../core/projects/repositories";
import { DomainError } from "../../shared/errors";
import { newId, type ProjectId } from "../../shared/id";
import { nowIso, parseOrThrow } from "../../shared/validation";
import type { RenderJobPayload } from "../render/render-job";
import type { RenderFormat } from "../render/render-job";
import type { VideoQuality } from "../render/motion-renderer";

export interface DocumentDeps {
  projects: ProjectRepository;
  assets: AssetRepository;
  visualProfiles: VisualProfileRepository;
  compositionInstances: CompositionInstanceRepository;
  documents: CreativeDocumentRepository;
  jobs: JobRepository;
}

async function requireDocument(deps: DocumentDeps, id: CreativeDocumentId): Promise<CreativeDocument> {
  const document = await deps.documents.getById(id);
  if (!document) throw new DomainError("NOT_FOUND", "Documento não encontrado.");
  return document;
}

/** Todo asset usado no documento precisa existir e ser do mesmo projeto. */
async function checkContent(deps: DocumentDeps, projectId: ProjectId, raw: unknown): Promise<DocumentContent> {
  const content = parseOrThrow(DocumentContentSchema, raw, "Conteúdo do documento");
  const motion = isMotion(content);
  for (const id of contentAssetIds(content)) {
    const asset = await deps.assets.getById(id as Parameters<AssetRepository["getById"]>[0]);
    if (!asset || asset.projectId !== projectId) throw new DomainError("VALIDATION", "O documento usa uma imagem que não é deste projeto.");
    // Vídeo (movimento capturado) só dentro de documentos de motion.
    if (!asset.mimeType.startsWith("image/") && !(motion && asset.mimeType.startsWith("video/"))) {
      throw new DomainError("VALIDATION", motion ? "Molduras aceitam imagem ou vídeo do projeto." : "Só imagens podem ser usadas no canvas.");
    }
  }
  if (motion && content.audio) {
    const audio = await deps.assets.getById(content.audio.assetId as Parameters<AssetRepository["getById"]>[0]);
    if (!audio || audio.projectId !== projectId || !audio.mimeType.startsWith("audio/")) throw new DomainError("VALIDATION", "A trilha precisa ser um áudio deste projeto.");
  }
  return content;
}

function newDocument(projectId: ProjectId, name: string, source: CreativeDocument["source"], kind: CreativeDocument["kind"] = "canvas"): CreativeDocument {
  const now = nowIso();
  return parseOrThrow(CreativeDocumentSchema, { id: newId(), projectId, kind, name, source, headRevision: 1, createdAt: now, updatedAt: now }, "Documento");
}

/** Carrossel em branco: N páginas vazias do formato, com a identidade atual. */
export async function createBlankCarousel(deps: DocumentDeps, projectId: ProjectId, input: { formatId: FormatId; pages?: number; name?: string }): Promise<CommitResult> {
  const project = await deps.projects.getById(projectId);
  if (!project) throw new DomainError("NOT_FOUND", "Projeto não encontrado.");
  const profile = await deps.visualProfiles.latest(projectId);
  const { width, height } = formatSize(input.formatId);
  const count = Math.min(Math.max(input.pages ?? 3, 1), 20);
  const content = parseOrThrow(
    CarouselContentSchema,
    {
      pages: Array.from({ length: count }, () => ({ id: newId(), artboard: { width, height, background: { fill: "background", pattern: "none" }, layers: [] } })),
      style: { mode: "hybrid", profileRevision: profile?.revision ?? null },
      formatId: input.formatId,
    },
    "Conteúdo do carrossel"
  );
  return deps.documents.create(newDocument(projectId, input.name?.trim() || `Carrossel ${FORMATS[input.formatId].label}`, {}, "carousel"), content, "create");
}

/**
 * Plano → carrossel: cada peça do plano vira uma página, na ordem, todas no mesmo
 * formato (o da primeira peça, ou o pedido) e com a direção do plano.
 */
export async function materializePlanAsCarousel(deps: DocumentDeps & { plans: CreativePlanRepository }, planId: CreativePlanId, formatId?: FormatId): Promise<CommitResult> {
  const plan = await deps.plans.getById(planId);
  if (!plan) throw new DomainError("NOT_FOUND", "Plano não encontrado.");
  const format = formatId ?? plan.items[0].formatId;
  const profile = (plan.visualProfileRevision ? await deps.visualProfiles.getRevision(plan.projectId, plan.visualProfileRevision) : null) ?? (await deps.visualProfiles.latest(plan.projectId));
  const assets = new Map((await deps.assets.listByProject(plan.projectId)).map((a) => [a.id as string, a]));
  const pages = plan.items.flatMap((item) => {
    const definition = getComposition(item.compositionId);
    if (!definition) return [];
    return [{ id: newId(), title: definition.name.slice(0, 80), artboard: buildArtboard(definition, { formatId: format, variant: item.variant, bindings: item.bindings }, assets, profile) }];
  });
  if (pages.length === 0) throw new DomainError("VALIDATION", "Nenhuma peça do plano pôde virar página.");
  const content = parseOrThrow(
    CarouselContentSchema,
    { pages, style: { mode: plan.direction.styleMode, ...(plan.direction.accent ? { primary: plan.direction.accent } : {}), profileRevision: profile?.revision ?? null }, formatId: format },
    "Conteúdo do carrossel"
  );
  const project = await deps.projects.getById(plan.projectId);
  return deps.documents.create(newDocument(plan.projectId, `Carrossel · ${project?.name ?? "projeto"}`.slice(0, 120), {}, "carousel"), content, "create");
}

/** Canvas em branco num formato, com a identidade mais recente do projeto. */
export async function createBlankCanvas(deps: DocumentDeps, projectId: ProjectId, input: { formatId: FormatId; name?: string; styleMode?: StyleMode }): Promise<CommitResult> {
  const project = await deps.projects.getById(projectId);
  if (!project) throw new DomainError("NOT_FOUND", "Projeto não encontrado.");
  const profile = await deps.visualProfiles.latest(projectId);
  const { width, height } = formatSize(input.formatId);
  const content = parseOrThrow(
    CanvasContentSchema,
    {
      artboard: { width, height, background: { fill: "background", pattern: "none" }, layers: [] },
      style: { mode: input.styleMode ?? "hybrid", profileRevision: profile?.revision ?? null },
      formatId: input.formatId,
    },
    "Conteúdo do documento"
  );
  const name = input.name?.trim() || `Canvas ${FORMATS[input.formatId].label}`;
  return deps.documents.create(newDocument(projectId, name, {}), content, "create");
}

/**
 * Composição → Canvas: congela o artboard montado pela receita (mesma revisão da
 * identidade que a instância usa) num documento livre para editar.
 */
export async function materializeInstance(deps: DocumentDeps, instanceId: CompositionInstanceId): Promise<CommitResult> {
  const instance = await deps.compositionInstances.getById(instanceId);
  if (!instance) throw new DomainError("NOT_FOUND", "Composição não encontrada.");
  const definition = getComposition(instance.compositionId);
  if (!definition) throw new DomainError("NOT_FOUND", `Receita "${instance.compositionId}" não existe mais.`);
  const profile =
    (instance.visualProfileRevision ? await deps.visualProfiles.getRevision(instance.projectId, instance.visualProfileRevision) : null) ??
    (await deps.visualProfiles.latest(instance.projectId));
  const assets = await deps.assets.listByProject(instance.projectId);
  const artboard = buildArtboard(definition, instance, new Map(assets.map((a) => [a.id as string, a])), profile);
  const content = parseOrThrow(
    CanvasContentSchema,
    {
      artboard,
      style: { mode: instance.styleMode, ...(instance.overrides.primary ? { primary: instance.overrides.primary } : {}), profileRevision: profile?.revision ?? null },
      formatId: instance.formatId,
    },
    "Conteúdo do documento"
  );
  return deps.documents.create(
    newDocument(instance.projectId, instance.name, { instanceId: instance.id, compositionId: definition.id, compositionVersion: definition.version }),
    content,
    "create"
  );
}

/** Autosave/salvar: concorrência otimista sobre `baseRevision`. */
export async function saveCanvas(deps: DocumentDeps, id: CreativeDocumentId, baseRevision: number, content: unknown): Promise<CommitResult> {
  const document = await requireDocument(deps, id);
  return deps.documents.commit(document.id, baseRevision, await checkContent(deps, document.projectId, content), "edit");
}

/** Voltar a uma revisão = revisão NOVA com aquele conteúdo (o histórico nunca é reescrito para trás). */
export async function restoreRevision(deps: DocumentDeps, id: CreativeDocumentId, revision: number): Promise<CommitResult> {
  const document = await requireDocument(deps, id);
  const old = await deps.documents.getRevision(document.id, revision);
  if (!old) throw new DomainError("NOT_FOUND", `Revisão ${revision} não existe.`);
  return deps.documents.commit(document.id, document.headRevision, await checkContent(deps, document.projectId, old.content), "restore");
}

export async function renameDocument(deps: DocumentDeps, id: CreativeDocumentId, name: string): Promise<CreativeDocument> {
  const document = await requireDocument(deps, id);
  return deps.documents.rename(document.id, name);
}

/** Remove o documento e suas revisões; Outputs já renderizados continuam (imutáveis). */
export async function deleteDocument(deps: DocumentDeps, id: CreativeDocumentId): Promise<CreativeDocument> {
  const document = await requireDocument(deps, id);
  await deps.documents.delete(document.id);
  return document;
}

/** Renderiza uma revisão concreta: ela é fixada para nunca mais ser reescrita pelo autosave. */
export async function enqueueDocumentRender(deps: DocumentDeps, id: CreativeDocumentId, revision: number, formats: readonly RenderFormat[], quality: VideoQuality = "final"): Promise<Job> {
  const document = await requireDocument(deps, id);
  if (!(await deps.documents.getRevision(document.id, revision))) throw new DomainError("NOT_FOUND", `Revisão ${revision} não existe.`);
  await deps.documents.pin(document.id, revision);
  const wantsVideo = formats.some((f) => f === "mp4" || f === "webm");
  if (wantsVideo && document.kind !== "motion") throw new DomainError("VALIDATION", "Vídeo só sai de documentos de motion — use Animar primeiro.");
  const payload: RenderJobPayload = { target: { kind: "document", documentId: document.id, revision }, formats: [...new Set(formats)], ...(wantsVideo ? { quality } : {}) };
  return deps.jobs.create(createJob({ type: "render", projectId: document.projectId, payload }));
}

// ── Motion (2.9) ─────────────────────────────────────────────────────────────

async function assetDims(deps: DocumentDeps, projectId: ProjectId): Promise<Map<string, { width: number | null; height: number | null }>> {
  return new Map((await deps.assets.listByProject(projectId)).map((a) => [a.id as string, { width: a.width, height: a.height }]));
}

/**
 * "Animar": canvas ou carrossel → documento de motion (cada página vira uma cena,
 * animada automaticamente por presets). O original não muda.
 */
export async function animateDocument(deps: DocumentDeps, id: CreativeDocumentId): Promise<CommitResult> {
  const document = await requireDocument(deps, id);
  if (document.kind === "motion") throw new DomainError("VALIDATION", "Este documento já é um vídeo.");
  const head = await deps.documents.getRevision(document.id, document.headRevision);
  if (!head) throw new DomainError("NOT_FOUND", "Revisão atual do documento não encontrada.");
  const content = motionFromArtboards({
    artboards: contentPages(head.content),
    style: head.content.style,
    formatId: head.content.formatId,
    assets: await assetDims(deps, document.projectId),
  });
  return deps.documents.create(newDocument(document.projectId, `${document.name} · vídeo`.slice(0, 120), { ...document.source }, "motion"), content, "create");
}

/** Composição → vídeo de uma cena (a peça montada pela receita, animada). */
export async function animateInstance(deps: DocumentDeps, instanceId: CompositionInstanceId): Promise<CommitResult> {
  const { document } = await materializeInstance(deps, instanceId);
  const result = await animateDocument(deps, document.id);
  await deps.documents.delete(document.id); // o canvas intermediário não precisa existir
  return result;
}

/** Vídeo em branco: uma cena vazia do formato. */
export async function createBlankMotion(deps: DocumentDeps, projectId: ProjectId, input: { formatId: FormatId; name?: string }): Promise<CommitResult> {
  if (!(await deps.projects.getById(projectId))) throw new DomainError("NOT_FOUND", "Projeto não encontrado.");
  const profile = await deps.visualProfiles.latest(projectId);
  const { width, height } = formatSize(input.formatId);
  const content = motionFromArtboards({
    artboards: [{ artboard: { width, height, background: { fill: "background", pattern: "none" }, layers: [] } }],
    style: { mode: "hybrid", profileRevision: profile?.revision ?? null },
    formatId: input.formatId,
  });
  return deps.documents.create(newDocument(projectId, input.name?.trim() || `Vídeo ${FORMATS[input.formatId].label}`, {}, "motion"), content, "create");
}

/** "Website Scroll": a página inteira capturada rolando numa janela de navegador. */
export async function createWebsiteScroll(deps: DocumentDeps & { sources: SourceRepository }, projectId: ProjectId, input: { assetId: string; formatId: FormatId }): Promise<CommitResult> {
  const project = await deps.projects.getById(projectId);
  if (!project) throw new DomainError("NOT_FOUND", "Projeto não encontrado.");
  const asset = await deps.assets.getById(input.assetId as Parameters<AssetRepository["getById"]>[0]);
  if (!asset || asset.projectId !== projectId || !asset.mimeType.startsWith("image/")) throw new DomainError("VALIDATION", "Escolha uma imagem deste projeto (de preferência a página inteira).");
  const profile = await deps.visualProfiles.latest(projectId);
  const url = (await deps.sources.listByProject(projectId)).find((s) => s.type === "url")?.locator;
  const { width, height } = formatSize(input.formatId);
  let host: string | undefined;
  try {
    host = url ? new URL(url).host.replace(/^www\./, "") : undefined;
  } catch {
    host = undefined;
  }
  const content = MotionContentSchema.parse({
    fps: 30,
    scenes: [websiteScrollScene({ width, height, asset, url: host })],
    style: { mode: "hybrid", profileRevision: profile?.revision ?? null },
    formatId: input.formatId,
  });
  return deps.documents.create(newDocument(projectId, `Website Scroll · ${project.name}`.slice(0, 120), {}, "motion"), content, "create");
}

/** Vídeo por receita (VideoRecipe): cenas montadas com composições curadas + Website Scroll. */
export async function createVideoFromRecipe(
  deps: DocumentDeps & { sources: SourceRepository },
  projectId: ProjectId,
  input: { recipeId: string; formatId: FormatId }
): Promise<CommitResult & { skipped: string[] }> {
  const project = await deps.projects.getById(projectId);
  if (!project) throw new DomainError("NOT_FOUND", "Projeto não encontrado.");
  const recipe = getRecipe(input.recipeId);
  if (!recipe) throw new DomainError("NOT_FOUND", "Receita de vídeo não existe.");
  const [assets, profile, sources] = await Promise.all([deps.assets.listByProject(projectId), deps.visualProfiles.latest(projectId), deps.sources.listByProject(projectId)]);
  let built: ReturnType<typeof buildRecipe>;
  try {
    built = buildRecipe(recipe, {
      project,
      assets,
      url: sources.find((s) => s.type === "url")?.locator ?? null,
      profile,
      formatId: input.formatId,
      style: { mode: (profile?.palette.length ?? 0) >= 2 ? "hybrid" : "atlas", profileRevision: profile?.revision ?? null },
    });
  } catch (err) {
    throw new DomainError("VALIDATION", err instanceof Error ? err.message : "Sem material para esta receita.");
  }
  const result = await deps.documents.create(newDocument(projectId, `${recipe.name} · ${project.name}`.slice(0, 120), {}, "motion"), built.content, "create");
  return { ...result, skipped: built.skipped };
}

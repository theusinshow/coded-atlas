import { buildShortlist } from "../../core/brain/context";
import { deterministicPlan, type CreativeDirection } from "../../core/brain/plan";
import { autoBind, missingSlots } from "../../core/creative/auto-bind";
import { getComposition, COMPOSITIONS } from "../../core/creative/compositions";
import { CreativeDirectionIdSchema, type CreativeDirectionRepository } from "../../core/creative/direction";
import { resolvePreferences, type CreativeMemoryRepository } from "../../core/creative/memory";
import { createJob, isTerminal, type Job } from "../../core/jobs/job";
import type { JobRepository } from "../../core/jobs/repository";
import { createMediaKit, getKitPreset, type KitItem, type MediaKit, type MediaKitId, type MediaKitRepository } from "../../core/kits/media-kit";
import type { SourceRepository } from "../../core/projects/repositories";
import { DomainError } from "../../shared/errors";
import { JobIdSchema, newId, type ProjectId } from "../../shared/id";
import { createInstance, type CompositionDeps } from "../create/composition-service";
import { createCarouselFromItems, createVideoFromRecipe, type DocumentDeps } from "../create/document-service";
import type { RenderJobPayload } from "../render/render-job";
import type { VideoQuality } from "../render/motion-renderer";

export interface KitDeps extends DocumentDeps {
  sources: SourceRepository;
  kits: MediaKitRepository;
  memory: CreativeMemoryRepository;
  directions: CreativeDirectionRepository;
  composition: CompositionDeps;
  jobs: JobRepository;
}

/**
 * Gerar Media Kit (docs/PRODUCT.md → experiência principal): preset + UMA direção
 * criativa → cada item vira rascunho real e editável (instância, carrossel ou
 * vídeo), todos com o mesmo estilo e destaque. Memória criativa pode vetar a
 * composição preferida de um item; a alternativa usada fica anotada.
 */
export async function generateMediaKit(deps: KitDeps, projectId: ProjectId, input: { presetId: string; directionId?: string | null; name?: string }): Promise<MediaKit> {
  const project = await deps.projects.getById(projectId);
  if (!project) throw new DomainError("NOT_FOUND", "Projeto não encontrado.");
  const preset = getKitPreset(input.presetId);
  if (!preset) throw new DomainError("NOT_FOUND", "Preset de kit não existe.");
  const [assets, profile, sources, memories] = await Promise.all([
    deps.assets.listByProject(projectId),
    deps.visualProfiles.latest(projectId),
    deps.sources.listByProject(projectId),
    deps.memory.listFor(projectId),
  ]);
  if (!assets.some((a) => a.mimeType.startsWith("image/"))) throw new DomainError("VALIDATION", "Capture o site ou envie imagens antes de gerar um kit.");
  const preferences = resolvePreferences(memories);

  let direction: CreativeDirection = {
    tone: `Técnico e direto, adequado a ${project.category.toLowerCase()}`,
    emphasis: "O site real em primeiro plano",
    styleMode: preferences.styleMode ?? ((profile?.palette.length ?? 0) >= 2 ? "hybrid" : "atlas"),
    accent: null,
  };
  let directionId: string | null = null;
  if (input.directionId) {
    const saved = await deps.directions.getById(CreativeDirectionIdSchema.parse(input.directionId));
    if (!saved || saved.projectId !== projectId) throw new DomainError("NOT_FOUND", "Direção criativa não encontrada.");
    direction = { tone: saved.tone, emphasis: saved.emphasis, styleMode: saved.styleMode, accent: saved.accent };
    directionId = saved.id;
  }

  const kitName = input.name?.trim() || `${preset.name} · ${project.name}`;
  const url = sources.find((s) => s.type === "url")?.locator ?? null;
  const bindingContext = { project, assets, url };
  const items: KitItem[] = [];

  for (const presetItem of preset.items) {
    const base: KitItem = { id: newId(), presetItemId: presetItem.id, label: presetItem.label, kind: presetItem.kind, formatId: presetItem.formatId, instanceId: null, documentId: null, note: null };
    const itemName = `${kitName} · ${presetItem.label}`.slice(0, 120);
    try {
      if (presetItem.kind === "composition") {
        const candidates = presetItem.compositions ?? [];
        const usable = candidates.find((id) => {
          const definition = getComposition(id);
          return definition && !preferences.avoidCompositions.has(id) && definition.formats.includes(presetItem.formatId) && missingSlots(definition, autoBind(definition, bindingContext)).length === 0;
        });
        if (!usable) {
          items.push({ ...base, note: "Sem material para as composições deste item." });
          continue;
        }
        const instance = await createInstance(deps.composition, projectId, {
          compositionId: usable,
          formatId: presetItem.formatId,
          styleMode: direction.styleMode,
          name: itemName,
          overrides: direction.accent ? { primary: direction.accent } : {},
        });
        const vetoed = candidates.slice(0, candidates.indexOf(usable)).filter((id) => preferences.avoidCompositions.has(id));
        items.push({ ...base, instanceId: instance.id, note: vetoed.length ? `Alternativa: a memória pede para evitar ${vetoed.join(", ")}.` : null });
      } else if (presetItem.kind === "carousel") {
        const plan = deterministicPlan({
          request: { goal: "carousel", notes: "", formats: [presetItem.formatId], maxItems: presetItem.pages ?? 5 },
          compositions: COMPOSITIONS,
          bindingContext,
          shortlist: buildShortlist(assets),
          hasPalette: (profile?.palette.length ?? 0) >= 2,
          category: project.category,
          preferences,
        });
        const { document } = await createCarouselFromItems(deps, projectId, { items: plan.items, formatId: presetItem.formatId, direction, profileRevision: profile?.revision ?? null, name: itemName });
        items.push({ ...base, documentId: document.id });
      } else {
        const result = await createVideoFromRecipe(deps, projectId, {
          recipeId: presetItem.recipeId ?? "quick-showcase",
          formatId: presetItem.formatId,
          style: { mode: direction.styleMode, ...(direction.accent ? { primary: direction.accent } : {}) },
          name: itemName,
        });
        items.push({ ...base, documentId: result.document.id, note: result.skipped.length ? `Cenas puladas: ${result.skipped.join("; ")}`.slice(0, 300) : null });
      }
    } catch (err) {
      if (err instanceof DomainError && err.code === "VALIDATION") items.push({ ...base, note: err.message.slice(0, 300) });
      else throw err;
    }
  }
  if (!items.some((i) => i.instanceId || i.documentId)) throw new DomainError("VALIDATION", "Nenhum item do kit pôde ser gerado com o material atual.");
  return deps.kits.create(createMediaKit({ projectId, name: kitName, presetId: preset.id, direction, directionId, items, visualProfileRevision: profile?.revision ?? null }));
}

/** Renderiza o kit inteiro num job (imagens + vídeos), tudo marcado com o kit. */
export async function enqueueKitRender(deps: Pick<KitDeps, "kits" | "jobs">, kitId: MediaKitId, options: { image: "png" | "jpg"; video: boolean; quality: VideoQuality }): Promise<Job> {
  const kit = await deps.kits.getById(kitId);
  if (!kit) throw new DomainError("NOT_FOUND", "Media Kit não encontrado.");
  if (kit.status === "rendering" && kit.lastRenderJobId) {
    // Só bloqueia se o job anterior ainda estiver vivo (processo morto não prende o kit).
    const last = await deps.jobs.getById(JobIdSchema.parse(kit.lastRenderJobId));
    if (last && !isTerminal(last.status)) throw new DomainError("CONFLICT", "Este kit já está renderizando.");
  }
  const formats: RenderJobPayload["formats"] = [options.image, ...(options.video ? (["mp4"] as const) : [])];
  const job = await deps.jobs.create(createJob({ type: "render", projectId: kit.projectId, payload: { target: { kind: "kit", kitId: kit.id }, formats, quality: options.quality } satisfies RenderJobPayload }));
  await deps.kits.update({ ...kit, status: "rendering", lastRenderJobId: job.id });
  return job;
}

export async function deleteMediaKit(deps: Pick<KitDeps, "kits">, kitId: MediaKitId): Promise<MediaKit> {
  const kit = await deps.kits.getById(kitId);
  if (!kit) throw new DomainError("NOT_FOUND", "Media Kit não encontrado.");
  await deps.kits.delete(kit.id);
  return kit;
}

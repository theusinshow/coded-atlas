import type { AssetRepository } from "../../core/assets/repositories";
import { autoBind } from "../../core/creative/auto-bind";
import {
  BindingSchema,
  CompositionInstanceSchema,
  type Binding,
  type CompositionInstance,
  type CompositionInstanceId,
  type CompositionInstanceRepository,
} from "../../core/creative/composition";
import { getComposition } from "../../core/creative/compositions";
import { FormatIdSchema, type FormatId } from "../../core/creative/formats";
import { StyleModeSchema, type StyleMode } from "../../core/creative/tokens";
import type { VisualProfileRepository } from "../../core/creative/visual-profile";
import { createJob, type Job } from "../../core/jobs/job";
import type { JobRepository } from "../../core/jobs/repository";
import type { ProjectRepository, SourceRepository } from "../../core/projects/repositories";
import { DomainError } from "../../shared/errors";
import { newId, type ProjectId } from "../../shared/id";
import { nowIso, parseOrThrow } from "../../shared/validation";
import type { RasterFormat } from "../render/static-renderer";
import type { RenderJobPayload } from "../render/render-job";

export interface CompositionDeps {
  projects: ProjectRepository;
  sources: SourceRepository;
  assets: AssetRepository;
  visualProfiles: VisualProfileRepository;
  compositionInstances: CompositionInstanceRepository;
  jobs: JobRepository;
}

export interface InstanceInput {
  compositionId: string;
  formatId?: FormatId;
  variant?: string;
  styleMode?: StyleMode;
  name?: string;
  bindings?: Record<string, Binding>;
  overrides?: { primary?: string };
}

function definitionOf(id: string) {
  const definition = getComposition(id);
  if (!definition) throw new DomainError("NOT_FOUND", `Composição "${id}" não existe.`);
  return definition;
}

/** Garante que assets ligados pertencem ao projeto e que slots existem na receita. */
async function checkBindings(deps: CompositionDeps, projectId: ProjectId, compositionId: string, bindings: Record<string, Binding>): Promise<Record<string, Binding>> {
  const definition = definitionOf(compositionId);
  const clean: Record<string, Binding> = {};
  for (const slot of definition.slots) {
    const raw = bindings[slot.id];
    if (raw === undefined) continue;
    const binding = parseOrThrow(BindingSchema, raw, `Ligação do slot ${slot.label}`);
    if (slot.type === "asset") {
      if (!("assetId" in binding)) throw new DomainError("VALIDATION", `O slot "${slot.label}" espera uma imagem.`);
      if (binding.assetId) {
        const asset = await deps.assets.getById(binding.assetId);
        if (!asset || asset.projectId !== projectId) throw new DomainError("VALIDATION", `A imagem do slot "${slot.label}" não é deste projeto.`);
      }
    } else if (!("text" in binding)) {
      throw new DomainError("VALIDATION", `O slot "${slot.label}" espera um texto.`);
    } else {
      binding.text = binding.text.slice(0, slot.maxLength);
    }
    clean[slot.id] = binding;
  }
  return clean;
}

/** Ligações automáticas para uma receita (preview de galeria, nova instância). */
export async function suggestBindings(deps: CompositionDeps, projectId: ProjectId, compositionId: string): Promise<Record<string, Binding>> {
  const project = await deps.projects.getById(projectId);
  if (!project) throw new DomainError("NOT_FOUND", "Projeto não encontrado.");
  const [assets, sources] = await Promise.all([deps.assets.listByProject(projectId), deps.sources.listByProject(projectId)]);
  return autoBind(definitionOf(compositionId), { project, assets, url: sources.find((s) => s.type === "url")?.locator ?? null });
}

export async function createInstance(deps: CompositionDeps, projectId: ProjectId, input: InstanceInput): Promise<CompositionInstance> {
  const definition = definitionOf(input.compositionId);
  const formatId = FormatIdSchema.parse(input.formatId ?? definition.formats[0]);
  if (!definition.formats.includes(formatId)) throw new DomainError("VALIDATION", "Formato não suportado por esta composição.");
  const variant = input.variant ?? definition.variants[0].id;
  if (!definition.variants.some((v) => v.id === variant)) throw new DomainError("VALIDATION", "Variante inexistente.");
  const bindings = { ...(await suggestBindings(deps, projectId, input.compositionId)), ...(await checkBindings(deps, projectId, input.compositionId, input.bindings ?? {})) };
  const profile = await deps.visualProfiles.latest(projectId);
  const now = nowIso();
  return deps.compositionInstances.create(
    parseOrThrow(
      CompositionInstanceSchema,
      {
        id: newId(),
        projectId,
        name: input.name?.trim() || definition.name,
        compositionId: definition.id,
        compositionVersion: definition.version,
        variant,
        formatId,
        styleMode: StyleModeSchema.parse(input.styleMode ?? "hybrid"),
        bindings,
        overrides: input.overrides ?? {},
        visualProfileRevision: profile?.revision ?? null,
        createdAt: now,
        updatedAt: now,
      },
      "Composição"
    )
  );
}

export async function updateInstance(
  deps: CompositionDeps,
  instanceId: CompositionInstanceId,
  patch: Partial<Omit<InstanceInput, "compositionId">> & { refreshProfile?: boolean }
): Promise<CompositionInstance> {
  const instance = await deps.compositionInstances.getById(instanceId);
  if (!instance) throw new DomainError("NOT_FOUND", "Composição não encontrada.");
  const definition = definitionOf(instance.compositionId);
  const formatId = patch.formatId ? FormatIdSchema.parse(patch.formatId) : instance.formatId;
  if (!definition.formats.includes(formatId)) throw new DomainError("VALIDATION", "Formato não suportado por esta composição.");
  const variant = patch.variant ?? instance.variant;
  if (!definition.variants.some((v) => v.id === variant)) throw new DomainError("VALIDATION", "Variante inexistente.");
  const bindings = patch.bindings ? { ...instance.bindings, ...(await checkBindings(deps, instance.projectId, instance.compositionId, patch.bindings)) } : instance.bindings;
  const profileRevision = patch.refreshProfile ? ((await deps.visualProfiles.latest(instance.projectId))?.revision ?? null) : instance.visualProfileRevision;
  return deps.compositionInstances.update({
    ...instance,
    name: patch.name?.trim() || instance.name,
    formatId,
    variant,
    styleMode: patch.styleMode ? StyleModeSchema.parse(patch.styleMode) : instance.styleMode,
    bindings,
    overrides: patch.overrides ?? instance.overrides,
    compositionVersion: definition.version,
    visualProfileRevision: profileRevision,
  });
}

export async function enqueueRender(deps: CompositionDeps, instanceId: CompositionInstanceId, formats: readonly RasterFormat[]): Promise<Job> {
  const instance = await deps.compositionInstances.getById(instanceId);
  if (!instance) throw new DomainError("NOT_FOUND", "Composição não encontrada.");
  const payload: RenderJobPayload = { target: { kind: "composition", instanceId: instance.id }, formats: [...new Set(formats)] };
  return deps.jobs.create(createJob({ type: "render", projectId: instance.projectId, payload }));
}

/** Remove a instância; as peças já renderizadas (Outputs) são imutáveis e continuam na biblioteca. */
export async function deleteInstance(deps: CompositionDeps, instanceId: CompositionInstanceId): Promise<CompositionInstance> {
  const instance = await deps.compositionInstances.getById(instanceId);
  if (!instance) throw new DomainError("NOT_FOUND", "Composição não encontrada.");
  await deps.compositionInstances.delete(instance.id);
  return instance;
}

import type { CreativePlanId, CreativePlanRepository } from "../../core/brain/plan";
import { getComposition } from "../../core/creative/compositions";
import { createDirection, type CreativeDirectionId, type CreativeDirectionRepository, type SavedDirection } from "../../core/creative/direction";
import { createMemory, type CreativeMemory, type CreativeMemoryId, type CreativeMemoryRepository } from "../../core/creative/memory";
import { StyleModeSchema } from "../../core/creative/tokens";
import { createVisualProfile, type VisualProfile, type VisualProfileRepository } from "../../core/creative/visual-profile";
import type { ProjectRepository } from "../../core/projects/repositories";
import { DomainError } from "../../shared/errors";
import type { ProjectId } from "../../shared/id";

export interface CreativeDeps {
  projects: ProjectRepository;
  memory: CreativeMemoryRepository;
  directions: CreativeDirectionRepository;
  plans: CreativePlanRepository;
  visualProfiles: VisualProfileRepository;
}

export interface MemoryInput {
  projectId: ProjectId | null;
  polarity: CreativeMemory["polarity"];
  subject: CreativeMemory["subject"];
  value: string;
}

/** Memória escrita pelo Matheus (workspace quando projectId é null). */
export async function addMemory(deps: CreativeDeps, input: MemoryInput): Promise<CreativeMemory> {
  if (input.projectId && !(await deps.projects.getById(input.projectId))) throw new DomainError("NOT_FOUND", "Projeto não encontrado.");
  const value = input.value.trim();
  if (input.subject === "composition" && !getComposition(value)) throw new DomainError("VALIDATION", `Composição "${value}" não existe.`);
  if (input.subject === "style" && !StyleModeSchema.safeParse(value).success) throw new DomainError("VALIDATION", "Estilo deve ser project, atlas ou hybrid.");
  return deps.memory.create(createMemory({ scope: input.projectId ? "project" : "workspace", projectId: input.projectId, polarity: input.polarity, subject: input.subject, value }));
}

export async function removeMemory(deps: CreativeDeps, id: CreativeMemoryId): Promise<void> {
  await deps.memory.delete(id);
}

/**
 * Sinais aprendidos de decisões reais (padrões aprovados/rejeitados do projeto):
 * aplicar uma peça reforça a composição; descartar um plano sem aplicar nada
 * conta contra as composições propostas.
 */
export async function learnFromPlanDecision(deps: Pick<CreativeDeps, "memory" | "plans">, planId: CreativePlanId, decision: "applied" | "discarded", itemIndexes?: number[]): Promise<void> {
  const plan = await deps.plans.getById(planId);
  if (!plan) return;
  const items = decision === "applied" ? (itemIndexes ?? plan.items.map((_, i) => i)).map((i) => plan.items[i]).filter(Boolean) : plan.appliedInstanceIds.length === 0 ? plan.items : [];
  for (const compositionId of new Set(items.map((i) => i.compositionId))) {
    await deps.memory.bumpSignal({ scope: "project", projectId: plan.projectId, polarity: decision === "applied" ? "prefer" : "avoid", subject: "composition", value: compositionId });
  }
}

export async function saveDirectionFromPlan(deps: CreativeDeps, planId: CreativePlanId, name: string): Promise<SavedDirection> {
  const plan = await deps.plans.getById(planId);
  if (!plan) throw new DomainError("NOT_FOUND", "Plano não encontrado.");
  return deps.directions.create(
    createDirection({
      projectId: plan.projectId,
      name: name.trim() || `Direção de ${new Date(plan.createdAt).toLocaleDateString("pt-BR")}`,
      tone: plan.direction.tone,
      emphasis: plan.direction.emphasis,
      styleMode: plan.direction.styleMode,
      accent: plan.direction.accent,
      notes: plan.request.notes,
      planId: plan.id,
    })
  );
}

export async function createManualDirection(deps: CreativeDeps, projectId: ProjectId, input: Pick<SavedDirection, "name" | "tone" | "emphasis" | "styleMode" | "accent" | "notes">): Promise<SavedDirection> {
  if (!(await deps.projects.getById(projectId))) throw new DomainError("NOT_FOUND", "Projeto não encontrado.");
  return deps.directions.create(createDirection({ ...input, projectId, planId: null }));
}

export async function deleteDirection(deps: CreativeDeps, id: CreativeDirectionId): Promise<void> {
  await deps.directions.delete(id);
}

/**
 * Evolução do VisualProfile: correção manual da identidade (paleta/fontes) vira
 * uma revisão NOVA — decisões antigas continuam presas à revisão que usaram.
 */
export async function reviseVisualProfile(deps: CreativeDeps, projectId: ProjectId, input: { palette: string[]; fonts: string[] }): Promise<VisualProfile> {
  if (!(await deps.projects.getById(projectId))) throw new DomainError("NOT_FOUND", "Projeto não encontrado.");
  const latest = await deps.visualProfiles.latest(projectId);
  const profile = createVisualProfile({
    projectId,
    revision: (latest?.revision ?? 0) + 1,
    palette: input.palette,
    fonts: input.fonts,
    techStack: latest?.techStack ?? [],
    ogImageUrl: latest?.ogImageUrl ?? null,
    logoAssetId: latest?.logoAssetId ?? null,
    source: "manual",
  });
  if (profile.palette.length === 0) throw new DomainError("VALIDATION", "Informe ao menos uma cor válida (#rrggbb).");
  return deps.visualProfiles.create(profile);
}

import { z } from "zod";
import type { AssetRepository } from "../../core/assets/repositories";
import { buildContextPack } from "../../core/brain/context";
import { ModelGatewayError, type ModelGateway, type ReasoningLevel, type StructuredResponse } from "../../core/brain/model-gateway";
import {
  CreativePlanIdSchema,
  CreativeRequestSchema,
  createPlan,
  deterministicPlan,
  validatePlanOutput,
  type CreativePlan,
  type CreativePlanId,
  type CreativePlanRepository,
  type CreativeRequestInput,
  type ValidatedPlan,
} from "../../core/brain/plan";
import { budgetState, createAiUsage, estimateCost, monthStart, type AiBudget, type AiUsageRepository, type ModelPricing } from "../../core/brain/usage";
import { COMPOSITIONS } from "../../core/creative/compositions";
import type { VisualProfileRepository } from "../../core/creative/visual-profile";
import { createJob, type Job } from "../../core/jobs/job";
import type { JobRepository } from "../../core/jobs/repository";
import type { ProjectRepository, SourceRepository } from "../../core/projects/repositories";
import { DomainError } from "../../shared/errors";
import type { ProjectId } from "../../shared/id";
import { parseOrThrow } from "../../shared/validation";
import type { JobHandler } from "../../workers/job-worker";
import { createInstance, type CompositionDeps } from "../create/composition-service";
import { buildPlanMessages, planJsonSchema, repairMessages } from "./prompts";

export interface BrainSettings {
  /** null = IA desligada (sem chave): tudo segue funcionando com regras determinísticas. */
  gateway: ModelGateway | null;
  pricing: ModelPricing | null;
  budget: AiBudget;
  /** Miniaturas mandadas ao modelo (multimodal). */
  imageCount: number;
}

export interface BrainDeps {
  projects: ProjectRepository;
  sources: SourceRepository;
  assets: AssetRepository;
  visualProfiles: VisualProfileRepository;
  plans: CreativePlanRepository;
  aiUsage: AiUsageRepository;
  jobs: JobRepository;
  brain: BrainSettings;
}

export const PlanJobPayloadSchema = z.strictObject({
  request: CreativeRequestSchema,
  parentId: CreativePlanIdSchema.nullable(),
});

/** Router de raciocínio (docs/ATLAS-BRAIN.md): nível conceitual por tarefa, esforço decidido no adapter. */
export function reasoningLevelFor(request: z.infer<typeof CreativeRequestSchema>, isRevision: boolean): ReasoningLevel {
  if (request.goal === "showcase-set" || request.goal === "custom" || isRevision) return "complex";
  return "creative";
}

export async function requestPlan(deps: Pick<BrainDeps, "projects" | "plans" | "jobs">, projectId: ProjectId, input: CreativeRequestInput, parentId?: string | null): Promise<Job> {
  const project = await deps.projects.getById(projectId);
  if (!project) throw new DomainError("NOT_FOUND", "Projeto não encontrado.");
  const request = parseOrThrow(CreativeRequestSchema, input, "Pedido criativo");
  let parent: CreativePlanId | null = null;
  if (parentId) {
    const found = await deps.plans.getById(CreativePlanIdSchema.parse(parentId));
    if (!found || found.projectId !== projectId) throw new DomainError("NOT_FOUND", "Plano anterior não encontrado.");
    parent = found.id;
  }
  return deps.jobs.create(createJob({ type: "plan", projectId, payload: { request, parentId: parent } }));
}

export interface BrainStatus {
  enabled: boolean;
  provider: string | null;
  model: string | null;
  budget: AiBudget;
  budgetState: "ok" | "warning" | "exceeded";
  monthSpentUsd: number;
}

export async function brainStatus(deps: Pick<BrainDeps, "aiUsage" | "brain">): Promise<BrainStatus> {
  const summary = await deps.aiUsage.summarizeSince(monthStart());
  return {
    enabled: deps.brain.gateway !== null,
    provider: deps.brain.gateway?.provider ?? null,
    model: deps.brain.gateway?.model ?? null,
    budget: deps.brain.budget,
    budgetState: budgetState(summary.estimatedCostUsd, deps.brain.budget),
    monthSpentUsd: summary.estimatedCostUsd,
  };
}

/**
 * Gera o plano: contexto determinístico → modelo (se disponível e dentro do
 * orçamento) → validação → 1 reparo → fallback determinístico. Cada chamada ao
 * modelo é registrada em ai_usage, inclusive as recusadas.
 */
export async function generatePlan(deps: BrainDeps, projectId: ProjectId, payload: z.infer<typeof PlanJobPayloadSchema>, signal: AbortSignal, onProgress?: (p: number, m: string) => Promise<void>): Promise<CreativePlan> {
  const project = await deps.projects.getById(projectId);
  if (!project) throw new DomainError("NOT_FOUND", "Projeto não encontrado.");
  const [assets, sources, profile] = await Promise.all([deps.assets.listByProject(projectId), deps.sources.listByProject(projectId), deps.visualProfiles.latest(projectId)]);
  const parent = payload.parentId ? await deps.plans.getById(payload.parentId) : null;
  const url = sources.find((s) => s.type === "url")?.locator ?? null;
  const context = buildContextPack({ project, url, profile, assets, compositions: COMPOSITIONS });
  if (context.shortlist.length === 0) throw new DomainError("VALIDATION", "O projeto ainda não tem imagens para planejar. Capture o site ou envie imagens.");
  const bindingContext = { project, assets, url };
  const validationContext = { compositions: COMPOSITIONS, shortlist: context.shortlist, bindingContext, request: payload.request };

  const warnings: string[] = [];
  let result: { plan: ValidatedPlan; model: string } | null = null;
  const gateway = deps.brain.gateway;

  const record = async (task: string, response: Pick<StructuredResponse, "model" | "effort" | "usage" | "latencyMs"> | null, status: "ok" | "invalid" | "error", latencyMs: number) => {
    if (!gateway) return;
    const usage = response?.usage ?? { inputTokens: 0, cachedTokens: 0, outputTokens: 0 };
    await deps.aiUsage.record(
      createAiUsage({
        projectId,
        task,
        provider: gateway.provider,
        model: (response?.model ?? gateway.model).slice(0, 80),
        effort: (response?.effort ?? "").slice(0, 20),
        ...usage,
        estimatedCostUsd: estimateCost(usage, deps.brain.pricing),
        latencyMs: Math.round(response?.latencyMs ?? latencyMs),
        status,
      })
    );
  };

  if (gateway) {
    const status = await brainStatus(deps);
    if (status.budgetState === "exceeded" && deps.brain.budget.mode === "block") {
      warnings.push("Orçamento mensal de IA atingido: plano gerado pelas regras do Atlas.");
    } else {
      const level = reasoningLevelFor(payload.request, parent !== null);
      const messages = buildPlanMessages({ context, request: payload.request, parent, imageCount: deps.brain.imageCount });
      const schema = { name: "creative_plan", jsonSchema: planJsonSchema() };
      await onProgress?.(20, "Atlas Brain analisando o projeto…");
      const started = Date.now();
      try {
        const first = await gateway.generateStructured({ task: "creative-plan", level, messages, schema }, signal);
        let validation = validatePlanOutput(first.output, validationContext);
        await record("creative-plan", first, validation.plan ? "ok" : "invalid", Date.now() - started);
        if (!validation.plan) {
          await onProgress?.(60, "Corrigindo o plano…");
          const repairStarted = Date.now();
          const second = await gateway.generateStructured({ task: "creative-plan-repair", level, messages: repairMessages(messages, first.output, validation.errors), schema }, signal);
          const retry = validatePlanOutput(second.output, validationContext);
          await record("creative-plan-repair", second, retry.plan ? "ok" : "invalid", Date.now() - repairStarted);
          if (!retry.plan && retry.partial) {
            // Aproveita o que passou na validação — e diz o que foi descartado.
            warnings.push(...retry.errors.slice(0, 8).map((e) => `Descartado: ${e}`));
            validation = { ...retry, plan: retry.partial };
          } else {
            validation = retry;
          }
          if (!validation.plan) warnings.push(`A resposta do modelo não passou na validação (${validation.errors.length} erro(s)): plano gerado pelas regras do Atlas.`);
        }
        if (validation.plan) {
          warnings.push(...validation.notes);
          result = { plan: validation.plan, model: first.model };
        }
      } catch (err) {
        if (signal.aborted) throw err;
        const usage = err instanceof ModelGatewayError ? err.usage : null;
        await record("creative-plan", usage ? { model: gateway.model, effort: "", usage, latencyMs: Date.now() - started } : null, "error", Date.now() - started);
        warnings.push(`Atlas Brain indisponível (${err instanceof Error ? err.message.slice(0, 160) : "erro"}): plano gerado pelas regras do Atlas.`);
      }
    }
  }

  await onProgress?.(85, "Salvando o plano…");
  const plan =
    result?.plan ??
    deterministicPlan({ request: payload.request, compositions: COMPOSITIONS, bindingContext, shortlist: context.shortlist, hasPalette: (profile?.palette.length ?? 0) >= 2, category: project.category });
  if (plan.items.length === 0) throw new DomainError("VALIDATION", "Não há material suficiente para nenhuma composição deste pedido.");
  return deps.plans.create(
    createPlan({
      projectId,
      parentId: parent?.id ?? null,
      request: payload.request,
      summary: plan.summary,
      direction: plan.direction,
      assetRanking: plan.assetRanking,
      items: plan.items,
      source: result ? "brain" : "fallback",
      model: result?.model ?? null,
      warnings: warnings.slice(0, 30).map((w) => w.slice(0, 300)),
      visualProfileRevision: profile?.revision ?? null,
    })
  );
}

export function createPlanJobHandler(deps: BrainDeps): JobHandler {
  return {
    timeoutMs: 5 * 60_000,
    run: async (ctx) => {
      const payload = parseOrThrow(PlanJobPayloadSchema, ctx.job.payload, "Payload do plano");
      if (!ctx.job.projectId) throw new DomainError("VALIDATION", "Plano sem projeto.");
      await ctx.progress(5, "Montando o contexto do projeto…");
      const plan = await generatePlan(deps, ctx.job.projectId, payload, ctx.signal, (p, m) => ctx.progress(p, m));
      return { planId: plan.id, source: plan.source, items: plan.items.length };
    },
  };
}

/** Aplica o plano: cada peça escolhida vira um rascunho (CompositionInstance). Ação explícita do usuário. */
export async function applyPlan(deps: Pick<BrainDeps, "plans"> & { composition: CompositionDeps }, planId: CreativePlanId, itemIndexes?: number[]): Promise<CreativePlan> {
  const plan = await deps.plans.getById(planId);
  if (!plan) throw new DomainError("NOT_FOUND", "Plano não encontrado.");
  if (plan.status === "discarded") throw new DomainError("INVALID_TRANSITION", "Este plano foi descartado.");
  const indexes = itemIndexes ?? plan.items.map((_, i) => i);
  const created: string[] = [];
  for (const index of indexes) {
    const item = plan.items[index];
    if (!item) throw new DomainError("VALIDATION", `Peça ${index + 1} não existe neste plano.`);
    const instance = await createInstance(deps.composition, plan.projectId, {
      compositionId: item.compositionId,
      formatId: item.formatId,
      variant: item.variant,
      styleMode: plan.direction.styleMode,
      bindings: item.bindings,
      overrides: plan.direction.accent ? { primary: plan.direction.accent } : {},
    });
    created.push(instance.id);
  }
  return deps.plans.setStatus(plan.id, "applied", [...plan.appliedInstanceIds, ...created].slice(0, 12));
}

export async function discardPlan(deps: Pick<BrainDeps, "plans">, planId: CreativePlanId): Promise<CreativePlan> {
  const plan = await deps.plans.getById(planId);
  if (!plan) throw new DomainError("NOT_FOUND", "Plano não encontrado.");
  return deps.plans.setStatus(plan.id, "discarded");
}

import { z } from "zod";
import { ProjectIdSchema, UlidSchema, newId } from "../../shared/id";
import { TimestampSchema, nowIso, parseOrThrow } from "../../shared/validation";
import type { ModelUsage } from "./model-gateway";

/** Registro de uma chamada de IA (docs/ATLAS-BRAIN.md → Cost tracking). */
export const AiUsageStatusSchema = z.enum(["ok", "invalid", "error"]);

export const AiUsageSchema = z.strictObject({
  id: UlidSchema,
  projectId: ProjectIdSchema.nullable(),
  task: z.string().min(1).max(60),
  provider: z.string().min(1).max(40),
  model: z.string().min(1).max(80),
  effort: z.string().max(20),
  inputTokens: z.number().int().nonnegative(),
  cachedTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  /** null quando os preços não estão configurados (nunca inventamos preço). */
  estimatedCostUsd: z.number().nonnegative().nullable(),
  latencyMs: z.number().int().nonnegative(),
  status: AiUsageStatusSchema,
  createdAt: TimestampSchema,
});
export type AiUsage = z.infer<typeof AiUsageSchema>;

/** Preços em USD por 1 milhão de tokens (configuráveis; sem valor padrão). */
export interface ModelPricing {
  inputPerMTok: number;
  cachedInputPerMTok: number;
  outputPerMTok: number;
}

export function estimateCost(usage: ModelUsage, pricing: ModelPricing | null): number | null {
  if (!pricing) return null;
  const uncached = Math.max(0, usage.inputTokens - usage.cachedTokens);
  const cost = (uncached * pricing.inputPerMTok + usage.cachedTokens * pricing.cachedInputPerMTok + usage.outputTokens * pricing.outputPerMTok) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export function createAiUsage(input: Omit<AiUsage, "id" | "createdAt">): AiUsage {
  return parseOrThrow(AiUsageSchema, { ...input, id: newId(), createdAt: nowIso() }, "Uso de IA");
}

export interface AiUsageSummary {
  calls: number;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  /** Soma só das chamadas com custo conhecido. */
  estimatedCostUsd: number;
  unpricedCalls: number;
}

export interface AiUsageRepository {
  record(usage: AiUsage): Promise<AiUsage>;
  summarizeSince(since: string): Promise<AiUsageSummary>;
  listRecent(limit: number): Promise<AiUsage[]>;
}

/** Orçamento mensal: `warn` só avisa; `block` desliga a IA (fallback determinístico) ao estourar. */
export interface AiBudget {
  monthlyLimitUsd: number | null;
  mode: "warn" | "block";
}

export function monthStart(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export function budgetState(spent: number, budget: AiBudget): "ok" | "warning" | "exceeded" {
  if (budget.monthlyLimitUsd === null) return "ok";
  if (spent >= budget.monthlyLimitUsd) return "exceeded";
  return spent >= budget.monthlyLimitUsd * 0.8 ? "warning" : "ok";
}


import type { AiBudget, ModelPricing } from "../../core/brain/usage";
import { AssetIdSchema } from "../../shared/id";
import type { BrainSettings } from "../../modules/brain/plan-service";
import type { Repositories } from "../db/repositories";
import type { ThumbnailService } from "../sharp/thumbnails";
import { OpenAIResponsesGateway } from "./openai/openai-responses-gateway";

/**
 * Configuração do Atlas Brain por ambiente. Sem `OPENAI_API_KEY` a IA fica
 * desligada e o Atlas usa regras determinísticas — nada depende de IA para funcionar.
 *
 * - OPENAI_API_KEY            chave da OpenAI (liga a IA)
 * - ATLAS_AI=off              desliga mesmo com chave
 * - ATLAS_AI_MODEL            modelo (padrão: gpt-6-luna — "GPT-6 Luna", docs/STACK.md)
 * - ATLAS_AI_PRICE_INPUT / ATLAS_AI_PRICE_CACHED_INPUT / ATLAS_AI_PRICE_OUTPUT
 *                             USD por 1M tokens (sem isso o custo aparece como "não configurado")
 * - ATLAS_AI_BUDGET_USD       orçamento mensal; ATLAS_AI_BUDGET_MODE=warn|block (padrão warn)
 * - ATLAS_AI_IMAGES           miniaturas enviadas ao modelo por plano (padrão 6, 0 = só texto)
 */
export const DEFAULT_AI_MODEL = "gpt-6-luna";

/** Só as variáveis lidas aqui (testes passam objetos parciais). */
type Env = Record<string, string | undefined>;

function numberEnv(env: Env, name: string): number | null {
  const raw = env[name]?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function resolvePricing(env: Env = process.env): ModelPricing | null {
  const input = numberEnv(env, "ATLAS_AI_PRICE_INPUT");
  const output = numberEnv(env, "ATLAS_AI_PRICE_OUTPUT");
  if (input === null || output === null) return null;
  return { inputPerMTok: input, cachedInputPerMTok: numberEnv(env, "ATLAS_AI_PRICE_CACHED_INPUT") ?? input, outputPerMTok: output };
}

export function resolveBudget(env: Env = process.env): AiBudget {
  return { monthlyLimitUsd: numberEnv(env, "ATLAS_AI_BUDGET_USD"), mode: env.ATLAS_AI_BUDGET_MODE === "block" ? "block" : "warn" };
}

export function createBrainSettings(deps: { repos: Repositories; thumbnails: ThumbnailService }, env: Env = process.env): BrainSettings {
  const apiKey = env.OPENAI_API_KEY?.trim();
  const enabled = !!apiKey && env.ATLAS_AI !== "off";
  const images = numberEnv(env, "ATLAS_AI_IMAGES");
  return {
    gateway: enabled
      ? new OpenAIResponsesGateway({
          apiKey: apiKey!,
          model: env.ATLAS_AI_MODEL?.trim() || DEFAULT_AI_MODEL,
          // Miniatura WebP de 640px (cacheada): barata em tokens e suficiente para julgar composição.
          loadImage: async (assetId) => {
            const parsed = AssetIdSchema.safeParse(assetId);
            const asset = parsed.success ? await deps.repos.assets.getById(parsed.data) : null;
            const bytes = asset ? await deps.thumbnails.get(asset, 640) : null;
            return bytes ? { mimeType: "image/webp", bytes } : null;
          },
        })
      : null,
    pricing: resolvePricing(env),
    budget: resolveBudget(env),
    imageCount: Math.min(images === null ? 6 : Math.floor(images), 12),
  };
}

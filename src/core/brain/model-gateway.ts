/**
 * ModelGateway (docs/ATLAS-BRAIN.md): o domínio fala com "um modelo", nunca com
 * o SDK da OpenAI. A implementação inicial é OpenAIResponsesGateway (infra).
 * Toda saída operacional é estruturada (JSON Schema) e validada depois por Zod
 * + regras de domínio — a resposta do modelo nunca vira estado sem validação.
 */

/** Níveis conceituais de raciocínio; o adapter mapeia para o esforço do modelo. */
export type ReasoningLevel = "routine" | "creative" | "complex";

export type ModelInputPart = { type: "text"; text: string } | { type: "image"; assetId: string; detail: "low" | "high" };

export interface ModelMessage {
  /** "developer" = regras estáveis (núcleo, produto, schemas); "user" = contexto e pedido. */
  role: "developer" | "user";
  content: ModelInputPart[];
}

export interface StructuredRequest {
  /** Nome da tarefa (para uso/custo): "creative-plan", "creative-plan-repair"… */
  task: string;
  level: ReasoningLevel;
  messages: ModelMessage[];
  schema: { name: string; jsonSchema: Record<string, unknown> };
}

export interface ModelUsage {
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
}

export interface StructuredResponse {
  /** JSON já parseado — AINDA não validado. */
  output: unknown;
  model: string;
  effort: string;
  usage: ModelUsage;
  latencyMs: number;
}

export interface ModelGateway {
  readonly provider: string;
  readonly model: string;
  generateStructured(request: StructuredRequest, signal: AbortSignal): Promise<StructuredResponse>;
}

/** Falha do provedor (rede, limite, resposta incompleta) — dispara o fallback determinístico. */
export class ModelGatewayError extends Error {
  constructor(
    message: string,
    readonly usage: ModelUsage | null = null,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "ModelGatewayError";
  }
}

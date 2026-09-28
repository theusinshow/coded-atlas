import OpenAI from "openai";
import type { Response as OpenAIResponse } from "openai/resources/responses/responses";
import {
  ModelGatewayError,
  type ModelGateway,
  type ModelInputPart,
  type ReasoningLevel,
  type StructuredRequest,
  type StructuredResponse,
} from "../../../core/brain/model-gateway";

/** Esforço de raciocínio por nível conceitual (router central — docs/ATLAS-BRAIN.md). */
export type Effort = "low" | "medium" | "high";
export const DEFAULT_EFFORT: Record<ReasoningLevel, Effort> = { routine: "low", creative: "medium", complex: "high" };

export interface OpenAIGatewayOptions {
  apiKey: string;
  model: string;
  effort?: Record<ReasoningLevel, Effort>;
  timeoutMs?: number;
  baseURL?: string;
  /** Miniatura de um asset para entrada multimodal (null = asset indisponível, a imagem é omitida). */
  loadImage?: (assetId: string) => Promise<{ mimeType: string; bytes: Uint8Array } | null>;
  /** Injeção para testes (a SDK aceita um fetch compatível). */
  fetch?: typeof fetch;
}

type InputContent = { type: "input_text"; text: string } | { type: "input_image"; image_url: string; detail: "low" | "high" };

/**
 * ModelGateway sobre a OpenAI Responses API com Structured Outputs (json_schema
 * estrito). Só esta classe conhece a SDK; o resto do Atlas fala com o port.
 */
export class OpenAIResponsesGateway implements ModelGateway {
  readonly provider = "openai";
  readonly model: string;
  private readonly client: OpenAI;
  private readonly effort: Record<ReasoningLevel, Effort>;

  constructor(private readonly options: OpenAIGatewayOptions) {
    this.model = options.model;
    this.effort = options.effort ?? DEFAULT_EFFORT;
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      timeout: options.timeoutMs ?? 120_000,
      maxRetries: 1,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  }

  private async toContent(parts: ModelInputPart[]): Promise<InputContent[]> {
    const out: InputContent[] = [];
    for (const part of parts) {
      if (part.type === "text") {
        out.push({ type: "input_text", text: part.text });
        continue;
      }
      const image = await this.options.loadImage?.(part.assetId);
      if (image) out.push({ type: "input_image", image_url: `data:${image.mimeType};base64,${Buffer.from(image.bytes).toString("base64")}`, detail: part.detail });
    }
    return out;
  }

  async generateStructured(request: StructuredRequest, signal: AbortSignal): Promise<StructuredResponse> {
    const effort = this.effort[request.level];
    const input = await Promise.all(request.messages.map(async (m) => ({ role: m.role, content: await this.toContent(m.content) })));
    const started = Date.now();
    let response: OpenAIResponse;
    try {
      response = await this.client.responses.create(
        {
          model: this.model,
          input,
          reasoning: { effort },
          text: { format: { type: "json_schema", name: request.schema.name, schema: request.schema.jsonSchema, strict: true } },
          store: false,
        },
        { signal }
      );
    } catch (err) {
      if (signal.aborted) throw signal.reason ?? err;
      throw new ModelGatewayError(err instanceof Error ? err.message : "Falha na chamada ao modelo.", null, { cause: err });
    }
    const latencyMs = Date.now() - started;
    const usage = {
      inputTokens: response.usage?.input_tokens ?? 0,
      cachedTokens: response.usage?.input_tokens_details?.cached_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    };
    if (response.status && response.status !== "completed") {
      throw new ModelGatewayError(`Resposta do modelo ${response.status === "incomplete" ? "incompleta" : response.status}.`, usage);
    }
    const text = response.output_text ?? "";
    let output: unknown;
    try {
      output = JSON.parse(text);
    } catch (err) {
      throw new ModelGatewayError("O modelo não devolveu JSON válido.", usage, { cause: err });
    }
    return { output, model: response.model ?? this.model, effort, usage, latencyMs };
  }
}

import { z } from "zod";
import type { ContextPack } from "../../core/brain/context";
import type { ModelMessage } from "../../core/brain/model-gateway";
import { CREATIVE_GOALS, PlanOutputSchema, type CreativePlan, type CreativeRequest } from "../../core/brain/plan";
import { FORMATS } from "../../core/creative/formats";

/**
 * Prompt em camadas estáveis → voláteis (docs/AI-GUARDRAILS.md → Prompt structure):
 * núcleo, regras de produto, schema, contexto do projeto e pedido atual. A parte
 * estável vem primeiro para aproveitar cache de prompt do provedor.
 */

const CORE = `Você é o Atlas Brain, diretor criativo da Coded by M, um estúdio que desenvolve sites.
Seu trabalho: decidir como apresentar um projeto de site em peças visuais (redes sociais, portfólio, apresentações)
usando SOMENTE composições curadas e o material real capturado do site. Você planeja; o sistema executa.`;

const RULES = `Regras obrigatórias:
- Escolha composições APENAS do catálogo fornecido, com formato e variante que a composição suporta.
- Use APENAS IDs de assets da lista curta fornecida. Nunca invente IDs. Use null para deixar um slot de imagem vazio.
- Textos em português do Brasil, curtos e específicos do projeto; respeite o máximo de caracteres de cada slot.
- Não invente métricas, números, depoimentos, prêmios ou clientes. Use só o que está no contexto.
- Estética Coded by M: técnica, escura e precisa. Nada de promessas genéricas de "SaaS", excesso de adjetivos ou emojis.
- Prefira o site real em destaque (primeira dobra, seções fortes); evite repetir a mesma imagem em peças do mesmo plano.
- styleMode: "hybrid" (sistema Coded by M + cor/tipografia do projeto) é o padrão; "project" quando a marca do cliente deve dominar; "atlas" quando o projeto não tem identidade clara.
- accent: null para usar a cor automática; só defina um hex (#rrggbb minúsculo) se a paleta do projeto justificar.
- assetRanking: até 8 assets mais fortes, score entre 0 e 1, com motivo curto.
- rationale de cada peça: uma frase sobre por que ela funciona para este projeto.`;

/** JSON Schema estrito para Structured Outputs (palavras-chave que nem todo provedor aceita são removidas; o Zod valida depois). */
export function planJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(PlanOutputSchema) as Record<string, unknown>;
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(node)) {
        if (["$schema", "maxLength", "minLength", "maxItems", "minItems", "pattern", "format"].includes(key)) continue;
        out[key] = strip(value);
      }
      return out;
    }
    return node;
  };
  return strip(schema) as Record<string, unknown>;
}

function describeRequest(request: CreativeRequest): string {
  const goal = CREATIVE_GOALS[request.goal];
  const formats = (request.formats.length > 0 ? request.formats : goal.defaultFormats).map((f) => `${f} (${FORMATS[f].label})`);
  return [
    `Objetivo: ${goal.label} — ${goal.hint}.`,
    `Formatos desejados: ${formats.join(", ")}.`,
    `Quantidade de peças: até ${request.maxItems ?? goal.items}.`,
    request.notes ? `Observações do Matheus: ${request.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export interface CreativeGuidance {
  /** Notas da memória em ordem de precedência (projeto antes de workspace). */
  memoryNotes: string[];
  avoidCompositions: string[];
  preferCompositions: string[];
  /** Direção salva que o plano deve seguir. */
  direction: { name: string; tone: string; emphasis: string; styleMode: string; accent: string | null; notes: string } | null;
}

export interface PromptInput {
  context: ContextPack;
  request: CreativeRequest;
  guidance?: CreativeGuidance;
  /** Plano anterior quando é uma revisão. */
  parent: CreativePlan | null;
  /** Quantas miniaturas da lista curta mandar como imagem. */
  imageCount: number;
}

function describeGuidance(g: CreativeGuidance | undefined): string {
  if (!g) return "";
  const lines: string[] = [];
  if (g.direction) {
    const d = g.direction;
    lines.push(`Direção criativa a seguir ("${d.name}"): tom ${d.tone}; ênfase ${d.emphasis}; styleMode ${d.styleMode}; accent ${d.accent ?? "automático"}.${d.notes ? ` Notas: ${d.notes}` : ""}`);
  }
  if (g.avoidCompositions.length) lines.push(`Composições a EVITAR neste projeto: ${g.avoidCompositions.join(", ")}.`);
  if (g.preferCompositions.length) lines.push(`Composições que já funcionaram (preferir quando couber): ${g.preferCompositions.join(", ")}.`);
  if (g.memoryNotes.length) lines.push(`Memória criativa (o pedido atual vence a memória; projeto vence Coded by M):\n${g.memoryNotes.map((n) => `- ${n}`).join("\n")}`);
  return lines.join("\n");
}

export function buildPlanMessages({ context, request, parent, imageCount, guidance }: PromptInput): ModelMessage[] {
  const guidanceText = describeGuidance(guidance);
  const contextJson = JSON.stringify({ project: context.project, visualIdentity: context.visual, shortlist: context.shortlist, catalog: context.catalog });
  const images = context.shortlist.slice(0, imageCount);
  const messages: ModelMessage[] = [
    { role: "developer", content: [{ type: "text", text: `${CORE}\n\n${RULES}` }] },
    {
      role: "user",
      content: [
        { type: "text", text: `Contexto do projeto (JSON):\n${contextJson}` },
        ...(images.length > 0 ? [{ type: "text" as const, text: `Miniaturas dos ${images.length} primeiros assets da lista curta, na ordem: ${images.map((i) => i.id).join(", ")}.` }] : []),
        ...images.map((i) => ({ type: "image" as const, assetId: i.id, detail: "low" as const })),
        ...(guidanceText ? [{ type: "text" as const, text: guidanceText }] : []),
        { type: "text", text: describeRequest(request) },
      ],
    },
  ];
  if (parent) {
    const previous = JSON.stringify({ summary: parent.summary, direction: parent.direction, items: parent.items.map((i) => ({ compositionId: i.compositionId, formatId: i.formatId, variant: i.variant, rationale: i.rationale })) });
    messages.push({
      role: "user",
      content: [{ type: "text", text: `Plano anterior (revise-o):\n${previous}\n\nPedido de revisão: ${request.feedback || "melhore o plano mantendo o objetivo."}` }],
    });
  }
  return messages;
}

export function repairMessages(original: ModelMessage[], previousOutput: unknown, errors: string[]): ModelMessage[] {
  return [
    ...original,
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Sua resposta anterior foi recusada pela validação:\n${errors.map((e) => `- ${e}`).join("\n")}\n\nResposta anterior:\n${JSON.stringify(previousOutput).slice(0, 6000)}\n\nDevolva o plano completo corrigido, seguindo o schema e as regras.`,
        },
      ],
    },
  ];
}

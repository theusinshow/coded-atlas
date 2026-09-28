import { z } from "zod";
import { isCase, type CreativeDocumentId, type CreativeDocumentRepository } from "../../core/documents/creative-document";
import { CreativeDocumentIdSchema } from "../../core/documents/creative-document";
import { createAiUsage, estimateCost } from "../../core/brain/usage";
import { ModelGatewayError, type ModelMessage } from "../../core/brain/model-gateway";
import { createJob, type Job } from "../../core/jobs/job";
import type { JobRepository } from "../../core/jobs/repository";
import { DomainError } from "../../shared/errors";
import { parseOrThrow } from "../../shared/validation";
import type { JobHandler } from "../../workers/job-worker";
import type { BrainDeps } from "./plan-service";

/**
 * Atlas Brain como redator do case: escreve SÓ os trechos de texto vazios, a partir
 * dos dados do projeto. Guardrails: nada de números/métricas que não estejam no
 * contexto, nada de clientes ou depoimentos inventados; texto já escrito pelo
 * Matheus nunca é sobrescrito. Sem IA configurada, a função não existe (UI esconde).
 */
export const CaseCopyOutputSchema = z.strictObject({
  sections: z.array(z.strictObject({ sectionId: z.string(), heading: z.string().max(120), body: z.string().max(1200) })).max(12),
});

export const CaseCopyPayloadSchema = z.strictObject({ documentId: CreativeDocumentIdSchema });

export interface CaseCopyDeps extends Pick<BrainDeps, "projects" | "sources" | "visualProfiles" | "aiUsage" | "brain"> {
  documents: CreativeDocumentRepository;
  jobs: JobRepository;
}

/** Números e símbolos de métrica no texto que NÃO aparecem no contexto = invenção. */
export function inventedFigures(text: string, context: string): string[] {
  const figures = text.match(/\d+(?:[.,]\d+)?\s*(?:%|x\b|mil\b|milhões?\b|k\b)|R\$\s*\d[\d.,]*|\b\d{2,}\b/gi) ?? [];
  return figures.filter((f) => !context.includes(f.replace(/\s+/g, " ").trim()));
}

export async function requestCaseCopy(deps: Pick<CaseCopyDeps, "documents" | "jobs" | "brain">, documentId: CreativeDocumentId): Promise<Job> {
  if (!deps.brain.gateway) throw new DomainError("VALIDATION", "Atlas Brain desligado — defina OPENAI_API_KEY para usar a redação assistida.");
  const document = await deps.documents.getById(documentId);
  if (!document || document.kind !== "case") throw new DomainError("NOT_FOUND", "Case não encontrado.");
  return deps.jobs.create(createJob({ type: "copy", projectId: document.projectId, payload: { documentId: document.id } }));
}

const SCHEMA = (() => {
  const schema = z.toJSONSchema(CaseCopyOutputSchema) as Record<string, unknown>;
  const strip = (n: unknown): unknown =>
    Array.isArray(n) ? n.map(strip) : n && typeof n === "object" ? Object.fromEntries(Object.entries(n).filter(([k]) => !["$schema", "maxLength", "maxItems", "minItems"].includes(k)).map(([k, v]) => [k, strip(v)])) : n;
  return strip(schema) as Record<string, unknown>;
})();

export function createCaseCopyJobHandler(deps: CaseCopyDeps): JobHandler {
  return {
    timeoutMs: 5 * 60_000,
    run: async (ctx) => {
      const { documentId } = parseOrThrow(CaseCopyPayloadSchema, ctx.job.payload, "Payload da redação");
      const gateway = deps.brain.gateway;
      if (!gateway) throw new DomainError("VALIDATION", "Atlas Brain desligado.");
      const document = await deps.documents.getById(documentId);
      if (!document) throw new DomainError("NOT_FOUND", "Case não encontrado.");
      const head = await deps.documents.getRevision(document.id, document.headRevision);
      if (!head || !isCase(head.content)) throw new DomainError("VALIDATION", "Documento não é um case.");
      const content = head.content;
      const empty = content.sections.filter((s): s is Extract<typeof s, { type: "text" }> => s.type === "text" && !s.body.trim());
      if (empty.length === 0) return { filled: 0, message: "Todos os trechos já têm texto." };
      const project = await deps.projects.getById(document.projectId);
      const profile = await deps.visualProfiles.latest(document.projectId);
      const sources = await deps.sources.listByProject(document.projectId);
      const facts = content.sections.flatMap((s) => (s.type === "facts" ? s.items.map((i) => `${i.label}: ${i.value}`) : []));
      const written = content.sections.flatMap((s) => (s.type === "text" && s.body.trim() ? [`${s.heading}: ${s.body}`] : []));
      const contextText = [project?.name, project?.category, project?.client, project?.description, sources.map((s) => s.locator).join(" "), facts.join("\n"), written.join("\n"), profile?.techStack.join(", ")].filter(Boolean).join("\n");
      const messages: ModelMessage[] = [
        {
          role: "developer",
          content: [
            {
              type: "text",
              text: `Você é o Atlas Brain, redator da Coded by M (estúdio que desenvolve sites). Escreva trechos de um estudo de caso em português do Brasil.
Regras: use SOMENTE fatos do contexto; não invente números, métricas, prazos, prêmios, clientes, depoimentos ou resultados; se faltar informação, escreva de forma qualitativa e honesta sobre o site e o trabalho (sem promessas).
Tom: técnico, direto, sóbrio, sem adjetivos vazios nem emojis. Cada trecho: 1 a 3 parágrafos curtos (até 900 caracteres), separados por linha em branco.
Devolva um item por sectionId pedido; mantenha o heading (pode ajustar levemente).`,
            },
          ],
        },
        { role: "user", content: [{ type: "text", text: `Contexto do projeto:\n${contextText}\n\nTrechos a escrever (sectionId → título):\n${empty.map((s) => `${s.id} → ${s.heading}`).join("\n")}` }] },
      ];
      await ctx.progress(20, "Atlas Brain escrevendo o case…");
      const started = Date.now();
      let response;
      try {
        response = await gateway.generateStructured({ task: "case-copy", level: "creative", messages, schema: { name: "case_copy", jsonSchema: SCHEMA } }, ctx.signal);
      } catch (err) {
        if (ctx.signal.aborted) throw err;
        const usage = err instanceof ModelGatewayError ? err.usage : null;
        await deps.aiUsage.record(createAiUsage({ projectId: document.projectId, task: "case-copy", provider: gateway.provider, model: gateway.model, effort: "", inputTokens: usage?.inputTokens ?? 0, cachedTokens: usage?.cachedTokens ?? 0, outputTokens: usage?.outputTokens ?? 0, estimatedCostUsd: usage ? estimateCost(usage, deps.brain.pricing) : null, latencyMs: Date.now() - started, status: "error" }));
        throw new DomainError("VALIDATION", `Atlas Brain indisponível: ${err instanceof Error ? err.message.slice(0, 160) : "erro"}`);
      }
      const parsed = CaseCopyOutputSchema.safeParse(response.output);
      const allowed = new Map(empty.map((s) => [s.id, s]));
      const accepted = parsed.success ? parsed.data.sections.filter((s) => allowed.has(s.sectionId) && s.body.trim() && inventedFigures(s.body, contextText).length === 0) : [];
      await deps.aiUsage.record(
        createAiUsage({
          projectId: document.projectId,
          task: "case-copy",
          provider: gateway.provider,
          model: response.model.slice(0, 80),
          effort: response.effort.slice(0, 20),
          ...response.usage,
          estimatedCostUsd: estimateCost(response.usage, deps.brain.pricing),
          latencyMs: response.latencyMs,
          status: parsed.success && accepted.length > 0 ? "ok" : "invalid",
        })
      );
      if (accepted.length === 0) throw new DomainError("VALIDATION", "A resposta do Atlas Brain não passou nos guardrails (nada foi alterado).");
      const byId = new Map(accepted.map((s) => [s.sectionId, s]));
      const next = {
        ...content,
        sections: content.sections.map((s) => (s.type === "text" && !s.body.trim() && byId.has(s.id) ? { ...s, heading: byId.get(s.id)!.heading.trim() || s.heading, body: byId.get(s.id)!.body.trim() } : s)),
      };
      await deps.documents.commit(document.id, document.headRevision, next, "edit");
      return { filled: accepted.length, rejected: (parsed.success ? parsed.data.sections.length : 0) - accepted.length };
    },
  };
}

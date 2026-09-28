import { z } from "zod";
import { autoBind, missingSlots, type BindingContext } from "../creative/auto-bind";
import { BindingSchema, type Binding, type CompositionDefinition } from "../creative/composition";
import { FORMATS, FormatIdSchema, type FormatId } from "../creative/formats";
import { StyleModeSchema } from "../creative/tokens";
import { AssetIdSchema, ProjectIdSchema, UlidSchema, newId } from "../../shared/id";
import { TimestampSchema, nowIso, parseOrThrow } from "../../shared/validation";
import type { ShortlistItem } from "./context";

/**
 * CreativePlan (docs/ATLAS-BRAIN.md): a decisão criativa estruturada — quais
 * composições curadas, em quais formatos, com qual material e por quê. O modelo
 * só ESCOLHE entre o que existe; o plano vira rascunhos (CompositionInstance)
 * apenas por ação explícita do usuário.
 */

export const CREATIVE_GOALS = {
  "launch-post": { label: "Post de lançamento", hint: "Anunciar o projeto no feed", defaultFormats: ["post-4x5"], items: 3 },
  "showcase-set": { label: "Conjunto vitrine", hint: "Peças em formatos variados para portfólio e redes", defaultFormats: ["landscape-16x9", "post-4x5", "story-9x16", "og-1.91x1"], items: 4 },
  story: { label: "Stories", hint: "Sequência vertical 9:16", defaultFormats: ["story-9x16"], items: 3 },
  cover: { label: "Capa / Open Graph", hint: "Imagem de compartilhamento 1.91:1", defaultFormats: ["og-1.91x1"], items: 2 },
  presentation: { label: "Slides de apresentação", hint: "Peças 16:9 para apresentar o projeto", defaultFormats: ["landscape-16x9"], items: 3 },
  custom: { label: "Livre", hint: "Descreva o que precisa nas observações", defaultFormats: ["post-4x5"], items: 3 },
} as const satisfies Record<string, { label: string; hint: string; defaultFormats: FormatId[]; items: number }>;
export type CreativeGoal = keyof typeof CREATIVE_GOALS;
export const CreativeGoalSchema = z.enum(Object.keys(CREATIVE_GOALS) as [CreativeGoal, ...CreativeGoal[]]);

export const CreativeRequestSchema = z.strictObject({
  goal: CreativeGoalSchema,
  notes: z.string().trim().max(600).default(""),
  formats: z.array(FormatIdSchema).max(5).default([]),
  maxItems: z.number().int().min(1).max(6).optional(),
  /** Pedido de revisão sobre um plano anterior. */
  feedback: z.string().trim().max(600).optional(),
});
export type CreativeRequest = z.infer<typeof CreativeRequestSchema>;
export type CreativeRequestInput = z.input<typeof CreativeRequestSchema>;

// ── Saída do MODELO (JSON Schema estrito: sem opcionais, sem records) ──────────

export const PlanOutputSchema = z.strictObject({
  summary: z.string().max(500),
  direction: z.strictObject({
    tone: z.string().max(160),
    emphasis: z.string().max(240),
    styleMode: StyleModeSchema,
    /** Hex #rrggbb para a cor de destaque, ou null para a automática. */
    accent: z.string().nullable(),
  }),
  assetRanking: z
    .array(z.strictObject({ assetId: z.string(), score: z.number(), reason: z.string().max(240) }))
    .max(12),
  items: z
    .array(
      z.strictObject({
        compositionId: z.string(),
        formatId: z.string(),
        variant: z.string(),
        assets: z.array(z.strictObject({ slotId: z.string(), assetId: z.string().nullable() })),
        texts: z.array(z.strictObject({ slotId: z.string(), text: z.string() })),
        rationale: z.string().max(400),
      })
    )
    .min(1)
    .max(6),
});
export type PlanOutput = z.infer<typeof PlanOutputSchema>;

// ── Plano persistido (domínio) ───────────────────────────────────────────────

export const PlanItemSchema = z.strictObject({
  compositionId: z.string().min(1).max(60),
  formatId: FormatIdSchema,
  variant: z.string().min(1).max(40),
  bindings: z.record(z.string().min(1).max(40), BindingSchema),
  rationale: z.string().max(400),
});
export type PlanItem = z.infer<typeof PlanItemSchema>;

export const CreativeDirectionSchema = z.strictObject({
  tone: z.string().max(160),
  emphasis: z.string().max(240),
  styleMode: StyleModeSchema,
  accent: z.string().regex(/^#[0-9a-f]{6}$/).nullable(),
});
export type CreativeDirection = z.infer<typeof CreativeDirectionSchema>;

export const CreativePlanIdSchema = UlidSchema.brand<"CreativePlanId">();
export type CreativePlanId = z.infer<typeof CreativePlanIdSchema>;

export const CreativePlanSchema = z.strictObject({
  id: CreativePlanIdSchema,
  projectId: ProjectIdSchema,
  /** Plano revisado a partir de outro (planos são imutáveis: revisar cria um novo). */
  parentId: CreativePlanIdSchema.nullable(),
  request: CreativeRequestSchema,
  summary: z.string().max(500),
  direction: CreativeDirectionSchema,
  assetRanking: z.array(z.strictObject({ assetId: AssetIdSchema, score: z.number().min(0).max(1), reason: z.string().max(240) })).max(12),
  items: z.array(PlanItemSchema).min(1).max(6),
  /** brain = modelo + validação; fallback = regras determinísticas. */
  source: z.enum(["brain", "fallback"]),
  model: z.string().max(80).nullable(),
  warnings: z.array(z.string().max(300)).max(30),
  status: z.enum(["draft", "applied", "discarded"]),
  appliedInstanceIds: z.array(z.string().max(40)).max(12),
  visualProfileRevision: z.number().int().positive().nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type CreativePlan = z.infer<typeof CreativePlanSchema>;

export interface CreativePlanRepository {
  create(plan: CreativePlan): Promise<CreativePlan>;
  getById(id: CreativePlanId): Promise<CreativePlan | null>;
  listByProject(projectId: z.infer<typeof ProjectIdSchema>): Promise<CreativePlan[]>;
  /** Só status e instâncias criadas mudam (o conteúdo do plano é imutável). */
  setStatus(id: CreativePlanId, status: CreativePlan["status"], appliedInstanceIds?: string[]): Promise<CreativePlan>;
}

export function createPlan(input: Omit<CreativePlan, "id" | "createdAt" | "updatedAt" | "status" | "appliedInstanceIds">): CreativePlan {
  const now = nowIso();
  return parseOrThrow(CreativePlanSchema, { ...input, id: newId(), status: "draft", appliedInstanceIds: [], createdAt: now, updatedAt: now }, "Plano criativo");
}

// ── Validação de domínio da saída do modelo ─────────────────────────────────

export interface PlanValidationContext {
  compositions: readonly CompositionDefinition[];
  shortlist: readonly ShortlistItem[];
  bindingContext: BindingContext;
  request: CreativeRequest;
}

export interface ValidatedPlan {
  summary: string;
  direction: CreativeDirection;
  assetRanking: CreativePlan["assetRanking"];
  items: PlanItem[];
}

export interface PlanValidationResult {
  plan: ValidatedPlan | null;
  /** Erros que invalidam um item (mandados de volta ao modelo no reparo). */
  errors: string[];
  /** Itens válidos, mesmo quando outros falharam. */
  validItems: PlanItem[];
  /** Ajustes explícitos e visíveis (ex.: slot não preenchido → ligação automática). */
  notes: string[];
  /** Só com os itens e campos válidos (quando o schema passou e sobrou ao menos uma peça). */
  partial: ValidatedPlan | null;
}

/**
 * Cadeia de validação (docs/AI-GUARDRAILS.md): schema → domínio → compatibilidade.
 * Nada é "consertado em silêncio": IDs desconhecidos, formatos não suportados,
 * variantes inexistentes e textos longos são ERROS; só slots omitidos recebem a
 * ligação determinística, e isso fica registrado em `notes`.
 */
export function validatePlanOutput(raw: unknown, ctx: PlanValidationContext): PlanValidationResult {
  const parsed = PlanOutputSchema.safeParse(raw);
  if (!parsed.success) {
    return { plan: null, errors: parsed.error.issues.slice(0, 12).map((i) => `${i.path.join(".") || "saída"}: ${i.message}`), validItems: [], notes: [], partial: null };
  }
  const out = parsed.data;
  const errors: string[] = [];
  const notes: string[] = [];
  const allowed = new Set(ctx.shortlist.map((s) => s.id));
  const limit = ctx.request.maxItems ?? CREATIVE_GOALS[ctx.request.goal].items;

  const accentValid = out.direction.accent === null || /^#[0-9a-f]{6}$/.test(out.direction.accent);
  if (!accentValid) errors.push(`direction.accent: "${out.direction.accent}" não é hex #rrggbb minúsculo.`);
  const accent = accentValid ? out.direction.accent : null;

  const assetRanking: CreativePlan["assetRanking"] = [];
  for (const r of out.assetRanking) {
    if (!allowed.has(r.assetId)) errors.push(`assetRanking: asset "${r.assetId}" não está na lista curta.`);
    else if (!(r.score >= 0 && r.score <= 1)) errors.push(`assetRanking: score de "${r.assetId}" deve estar entre 0 e 1.`);
    else assetRanking.push({ assetId: AssetIdSchema.parse(r.assetId), score: r.score, reason: r.reason });
  }

  if (out.items.length > limit) errors.push(`items: no máximo ${limit} peça(s) para este pedido (veio ${out.items.length}).`);

  const validItems: PlanItem[] = [];
  out.items.slice(0, limit).forEach((item, index) => {
    const at = `items[${index}]`;
    const itemErrors: string[] = [];
    const definition = ctx.compositions.find((c) => c.id === item.compositionId);
    if (!definition) {
      errors.push(`${at}: composição "${item.compositionId}" não existe no catálogo.`);
      return;
    }
    const format = FormatIdSchema.safeParse(item.formatId);
    if (!format.success || !definition.formats.includes(format.data)) itemErrors.push(`${at}: formato "${item.formatId}" não é suportado por ${definition.id} (use ${definition.formats.join(", ")}).`);
    if (!definition.variants.some((v) => v.id === item.variant)) itemErrors.push(`${at}: variante "${item.variant}" não existe em ${definition.id} (use ${definition.variants.map((v) => v.id).join(", ")}).`);

    const bindings: Record<string, Binding> = {};
    for (const a of item.assets) {
      const slot = definition.slots.find((s) => s.id === a.slotId);
      if (!slot || slot.type !== "asset") itemErrors.push(`${at}: "${a.slotId}" não é um slot de imagem de ${definition.id}.`);
      else if (a.assetId !== null && !allowed.has(a.assetId)) itemErrors.push(`${at}: asset "${a.assetId}" não está na lista curta.`);
      else bindings[slot.id] = { assetId: a.assetId === null ? null : AssetIdSchema.parse(a.assetId) };
    }
    for (const t of item.texts) {
      const slot = definition.slots.find((s) => s.id === t.slotId);
      if (!slot || slot.type !== "text") itemErrors.push(`${at}: "${t.slotId}" não é um slot de texto de ${definition.id}.`);
      else if (t.text.length > slot.maxLength) itemErrors.push(`${at}: texto de "${slot.id}" tem ${t.text.length} caracteres (máximo ${slot.maxLength}).`);
      else bindings[slot.id] = { text: t.text };
    }
    if (itemErrors.length > 0) {
      errors.push(...itemErrors);
      return;
    }
    // Slots que o modelo não mencionou: ligação determinística, registrada.
    const auto = autoBind(definition, ctx.bindingContext);
    const omitted = definition.slots.filter((s) => !(s.id in bindings)).map((s) => s.id);
    for (const id of omitted) bindings[id] = auto[id];
    if (omitted.length > 0) notes.push(`${definition.name}: ${omitted.join(", ")} preenchido(s) automaticamente.`);
    const missing = missingSlots(definition, bindings);
    if (missing.length > 0) {
      errors.push(`${at}: faltam slots obrigatórios em ${definition.id}: ${missing.join(", ")}.`);
      return;
    }
    validItems.push({ compositionId: definition.id, formatId: format.data as FormatId, variant: item.variant, bindings, rationale: item.rationale });
  });

  const candidate: ValidatedPlan = { summary: out.summary, direction: { tone: out.direction.tone, emphasis: out.direction.emphasis, styleMode: out.direction.styleMode, accent }, assetRanking, items: validItems };
  return { plan: errors.length === 0 ? candidate : null, errors, validItems, notes, partial: validItems.length > 0 ? candidate : null };
}

// ── Plano determinístico (sem IA, ou quando a IA falha) ──────────────────────

/** Ordem de preferência de composições por objetivo. */
const GOAL_PICKS: Record<CreativeGoal, string[]> = {
  "launch-post": ["desktop-mobile", "desktop-hero", "ui-details-grid", "typography-colors", "editorial-split", "project-reveal"],
  "showcase-set": ["desktop-hero", "desktop-mobile", "mobile-stack", "floating-devices", "editorial-split", "ui-details-grid"],
  story: ["mobile-stack", "project-reveal", "floating-devices", "single-feature", "project-closing"],
  cover: ["desktop-hero", "floating-devices", "editorial-split"],
  presentation: ["project-reveal", "desktop-hero", "editorial-split", "ui-details-grid", "typography-colors", "project-closing"],
  custom: ["desktop-mobile", "desktop-hero", "editorial-split", "mobile-stack", "ui-details-grid"],
};

export function deterministicPlan(input: {
  request: CreativeRequest;
  compositions: readonly CompositionDefinition[];
  bindingContext: BindingContext;
  shortlist: readonly ShortlistItem[];
  hasPalette: boolean;
  category: string;
}): ValidatedPlan {
  const { request, compositions, bindingContext } = input;
  const goal = CREATIVE_GOALS[request.goal];
  const formats: FormatId[] = request.formats.length > 0 ? request.formats : [...goal.defaultFormats];
  const limit = request.maxItems ?? goal.items;
  const items: PlanItem[] = [];

  for (const id of GOAL_PICKS[request.goal]) {
    if (items.length >= limit) break;
    const definition = compositions.find((c) => c.id === id);
    if (!definition) continue;
    // Formato: o próximo da lista (alternando) que a composição suporta.
    const formatId = [...formats.slice(items.length % formats.length), ...formats].find((f) => definition.formats.includes(f));
    if (!formatId) continue;
    const bindings = autoBind(definition, bindingContext);
    if (missingSlots(definition, bindings).length > 0) continue;
    if (id === "typography-colors" && !input.hasPalette) continue;
    items.push({ compositionId: id, formatId, variant: definition.variants[0].id, bindings, rationale: `${definition.name} em ${FORMATS[formatId].label}: ${definition.description}` });
  }
  // Pouco material: completa com o que couber, em qualquer formato do pedido.
  if (items.length === 0) {
    for (const definition of compositions) {
      const formatId = formats.find((f) => definition.formats.includes(f)) ?? definition.formats[0];
      const bindings = autoBind(definition, bindingContext);
      if (missingSlots(definition, bindings).length === 0) {
        items.push({ compositionId: definition.id, formatId, variant: definition.variants[0].id, bindings, rationale: `${definition.name}: combina com o material disponível.` });
        break;
      }
    }
  }

  return {
    summary: `${goal.label} para ${bindingContext.project.name}, montado pelas regras do Atlas a partir do material capturado.`,
    direction: { tone: `Técnico e direto, adequado a ${input.category.toLowerCase()}`, emphasis: "Mostrar o site real em primeiro plano", styleMode: input.hasPalette ? "hybrid" : "atlas", accent: null },
    assetRanking: input.shortlist.slice(0, 6).map((s) => ({ assetId: AssetIdSchema.parse(s.id), score: s.priority, reason: `Prioridade do Atlas: ${s.describe}.` })),
    items,
  };
}


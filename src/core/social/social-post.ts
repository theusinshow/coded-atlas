import { z } from "zod";
import { UlidSchema, newId } from "../../shared/id";
import { TimestampSchema, nowIso, parseOrThrow } from "../../shared/validation";

/**
 * Social (3.2.D): planejamento do Instagram da Coded by M. Um SocialPost organiza
 * peças já renderizadas (Outputs de qualquer projeto) num post, carrossel, reel ou
 * story, com legenda e hashtags. O Atlas NUNCA publica sozinho: "publicado" é
 * marcado pelo Matheus depois de postar (AI-GUARDRAILS → User approval).
 */
export const SocialPostKindSchema = z.enum(["post", "carousel", "reel", "story"]);
export type SocialPostKind = z.infer<typeof SocialPostKindSchema>;
export const SocialPostStatusSchema = z.enum(["draft", "ready", "posted"]);
export type SocialPostStatus = z.infer<typeof SocialPostStatusSchema>;

export const SocialPostIdSchema = UlidSchema.brand<"SocialPostId">();
export type SocialPostId = z.infer<typeof SocialPostIdSchema>;

/** Limites do Instagram (legenda, hashtags, itens de carrossel). */
export const INSTAGRAM = {
  captionMax: 2200,
  hashtagsMax: 30,
  carouselMin: 2,
  carouselMax: 10,
  /** Área que a interface do story cobre (topo: perfil; base: resposta), em fração da altura. */
  storySafeTop: 0.14,
  storySafeBottom: 0.2,
  reelRecommendedMaxMs: 90_000,
  storyVideoMaxMs: 60_000,
} as const;

export const HashtagSchema = z.string().regex(/^[\p{L}\p{N}_]{1,100}$/u, "hashtag: só letras, números e _");

export const SocialPostSchema = z.strictObject({
  id: SocialPostIdSchema,
  kind: SocialPostKindSchema,
  status: SocialPostStatusSchema,
  /** Nome interno (não vai para o Instagram). */
  title: z.string().trim().min(1).max(120),
  /** Peças na ordem em que aparecem (carrossel: slides). */
  outputIds: z.array(z.string().max(40)).min(1).max(INSTAGRAM.carouselMax),
  caption: z.string().max(INSTAGRAM.captionMax),
  hashtags: z.array(HashtagSchema).max(INSTAGRAM.hashtagsMax),
  /** Dia planejado (YYYY-MM-DD) — só organização, nada é agendado de verdade. */
  plannedFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  /** Posição no grid do perfil (menor = mais recente/no topo). Stories não entram no grid. */
  feedOrder: z.number().int(),
  postedAt: TimestampSchema.nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type SocialPost = z.infer<typeof SocialPostSchema>;

export function createSocialPost(input: Pick<SocialPost, "kind" | "title" | "outputIds" | "feedOrder"> & Partial<Pick<SocialPost, "caption" | "hashtags">>): SocialPost {
  const now = nowIso();
  return parseOrThrow(
    SocialPostSchema,
    { caption: "", hashtags: [], ...input, id: newId(), status: "draft", plannedFor: null, postedAt: null, createdAt: now, updatedAt: now },
    "Post social"
  );
}

export interface SocialPostRepository {
  create(post: SocialPost): Promise<SocialPost>;
  getById(id: SocialPostId): Promise<SocialPost | null>;
  list(): Promise<SocialPost[]>;
  update(post: SocialPost): Promise<SocialPost>;
  delete(id: SocialPostId): Promise<void>;
}

// ── Regras puras ─────────────────────────────────────────────────────────────

/** O que as regras precisam saber de cada peça. */
export interface PieceFacts {
  id: string;
  kind: "image" | "video" | "other";
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

export interface PostCheck {
  /** Bloqueiam "pronto". */
  errors: string[];
  /** Avisos: o Instagram aceita, mas vai cortar/reduzir. */
  warnings: string[];
}

const ratio = (p: PieceFacts) => (p.width && p.height ? p.width / p.height : null);
const near = (a: number, b: number, tol = 0.02) => Math.abs(a - b) <= tol;
const fmt = (r: number) => (near(r, 1) ? "1:1" : near(r, 0.8) ? "4:5" : near(r, 0.5625) ? "9:16" : near(r, 1.91, 0.05) ? "1,91:1" : r.toFixed(2));

/** Checa se as peças servem para o tipo de post (proporção, quantidade, duração). */
export function checkPieces(kind: SocialPostKind, pieces: readonly PieceFacts[], missing = 0): PostCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (missing > 0) errors.push(`${missing} ${missing === 1 ? "peça não existe mais" : "peças não existem mais"} — troque as peças do post.`);
  if (pieces.some((p) => p.kind === "other")) errors.push("Instagram só aceita imagem ou vídeo.");
  const first = pieces[0];

  if (kind === "post") {
    if (pieces.length !== 1) errors.push("Post único leva exatamente 1 peça.");
    else if (first.kind !== "image") errors.push("Post único é uma imagem — para vídeo, use Reel.");
    else {
      const r = ratio(first);
      if (r !== null && (r < 0.79 || r > 1.92)) errors.push(`Proporção ${fmt(r)} não cabe no feed (aceita de 4:5 a 1,91:1).`);
      else if (r !== null && !near(r, 0.8) && !near(r, 1)) warnings.push(`Proporção ${fmt(r)}: no feed, 4:5 ou 1:1 ocupam mais espaço.`);
    }
  }
  if (kind === "carousel") {
    if (pieces.length < INSTAGRAM.carouselMin || pieces.length > INSTAGRAM.carouselMax) errors.push(`Carrossel leva de ${INSTAGRAM.carouselMin} a ${INSTAGRAM.carouselMax} peças.`);
    const ratios = pieces.map(ratio).filter((r): r is number => r !== null);
    if (ratios.length > 1 && ratios.some((r) => !near(r, ratios[0]))) errors.push("Todas as peças do carrossel precisam ter a mesma proporção (o Instagram corta pela primeira).");
  }
  if (kind === "reel") {
    if (pieces.length !== 1 || first.kind !== "video") errors.push("Reel é exatamente 1 vídeo.");
    else {
      const r = ratio(first);
      if (r !== null && !near(r, 0.5625)) warnings.push(`Vídeo ${fmt(r)}: Reels ocupam a tela toda em 9:16.`);
      if (first.durationMs && first.durationMs > INSTAGRAM.reelRecommendedMaxMs) warnings.push("Reels acima de 90 s alcançam menos gente.");
    }
  }
  if (kind === "story") {
    if (pieces.length !== 1) errors.push("Story leva 1 peça (faça um story por peça).");
    else {
      const r = ratio(first);
      if (r !== null && !near(r, 0.5625)) warnings.push(`Proporção ${fmt(r)}: stories são 9:16 — o resto vira faixa.`);
      if (first.kind === "video" && first.durationMs && first.durationMs > INSTAGRAM.storyVideoMaxMs) warnings.push("Vídeos acima de 60 s são divididos em vários stories.");
    }
  }
  return { errors, warnings };
}

/** "#Web design, #web_design" → ["Webdesign", "web_design"]: sem #, sem espaços, sem repetidos (ignora caixa). */
export function normalizeHashtags(input: string | readonly string[]): string[] {
  const raw = typeof input === "string" ? input.split(/[\s,]+/) : input;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const tag = item.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag.slice(0, 100));
  }
  return out;
}

/** Texto final para colar no Instagram: legenda + linha em branco + hashtags. */
export function composeCaption(caption: string, hashtags: readonly string[]): string {
  const tags = hashtags.map((t) => `#${t}`).join(" ");
  return [caption.trim(), tags].filter(Boolean).join("\n\n");
}

export function captionIssues(caption: string, hashtags: readonly string[]): string[] {
  const issues: string[] = [];
  const length = composeCaption(caption, hashtags).length;
  if (length > INSTAGRAM.captionMax) issues.push(`Legenda com hashtags tem ${length} caracteres (máximo ${INSTAGRAM.captionMax}).`);
  if (hashtags.length > INSTAGRAM.hashtagsMax) issues.push(`${hashtags.length} hashtags (máximo ${INSTAGRAM.hashtagsMax}).`);
  return issues;
}

const CATEGORY_TAGS: [RegExp, string[]][] = [
  [/landing/i, ["landingpage", "conversao"]],
  [/institucional|one page/i, ["siteinstitucional", "webdesign"]],
  [/e-?commerce|loja/i, ["ecommerce", "lojavirtual"]],
  [/aplica|saas|dashboard|sistema/i, ["produtodigital", "uxui"]],
  [/portf/i, ["portfolio", "webdesign"]],
];

/** Hashtags sugeridas (determinístico): estúdio + categoria do projeto. */
export function suggestHashtags(categories: readonly string[]): string[] {
  const tags = ["codedbym", "webdesign", "desenvolvimentoweb"];
  for (const c of categories) for (const [re, list] of CATEGORY_TAGS) if (re.test(c)) tags.push(...list);
  return normalizeHashtags(tags).slice(0, 12);
}

import { z } from "zod";
import { ProjectIdSchema, UlidSchema, type ProjectId } from "../../shared/id";
import { TimestampSchema } from "../../shared/validation";
import { FormatIdSchema } from "../creative/formats";
import { DocumentStyleSchema } from "./style";
import { MotionContentSchema, type MotionContent } from "../motion/motion";
import { ArtboardSchema, artboardAssetIds, type Artboard } from "./artboard";

/**
 * CreativeDocument (docs/DOMAIN-MODEL.md): documento editável e revisionado.
 * Família: canvas agora; carousel, motion, presentation e case nas fases seguintes
 * reutilizam a mesma tabela de revisões com outro `kind` e outro conteúdo.
 */
export const DocumentKindSchema = z.enum(["canvas", "carousel", "motion", "presentation"]);
export type DocumentKind = z.infer<typeof DocumentKindSchema>;

export const CreativeDocumentIdSchema = UlidSchema.brand<"CreativeDocumentId">();
export type CreativeDocumentId = z.infer<typeof CreativeDocumentIdSchema>;

export { DocumentStyleSchema, type DocumentStyle } from "./style";

/** Conteúdo de um CanvasDocument: um artboard + estilo + formato de origem (se houver). */
export const CanvasContentSchema = z.strictObject({
  artboard: ArtboardSchema,
  style: DocumentStyleSchema,
  formatId: FormatIdSchema.nullable(),
});
export type CanvasContent = z.infer<typeof CanvasContentSchema>;
export type CanvasContentInput = z.input<typeof CanvasContentSchema>;

export const MAX_PAGES = 20;

export const DocumentPageSchema = z.strictObject({
  id: z.string().min(1).max(64),
  /** Rótulo curto no storyboard ("Abertura", "Mobile"…). */
  title: z.string().trim().max(80).optional(),
  artboard: ArtboardSchema,
});
export type DocumentPage = z.infer<typeof DocumentPageSchema>;

/**
 * Carrossel: páginas ordenadas do MESMO tamanho, com um estilo só — uma peça
 * sequencial coerente (docs/WORKFLOWS.md → carrossel). Cada página vira um Output.
 */
export const CarouselContentSchema = z
  .strictObject({
    pages: z.array(DocumentPageSchema).min(1).max(MAX_PAGES),
    style: DocumentStyleSchema,
    formatId: FormatIdSchema.nullable(),
  })
  .refine((c) => c.pages.every((p) => p.artboard.width === c.pages[0].artboard.width && p.artboard.height === c.pages[0].artboard.height), {
    message: "Todas as páginas do carrossel precisam ter o mesmo tamanho.",
  })
  .refine((c) => new Set(c.pages.map((p) => p.id)).size === c.pages.length, { message: "IDs de página repetidos." });
export type CarouselContent = z.infer<typeof CarouselContentSchema>;

export const MAX_SLIDES = 40;

export const SlideSchema = z.strictObject({
  id: z.string().min(1).max(64),
  title: z.string().trim().max(80).optional(),
  /** Notas do apresentador (vão para o PPTX; não aparecem no slide). */
  notes: z.string().max(2000),
  artboard: ArtboardSchema,
});
export type Slide = z.infer<typeof SlideSchema>;

/** Apresentação (docs/WORKFLOWS.md → F): slides do mesmo tamanho, um estilo, notas por slide. */
export const PresentationContentSchema = z
  .strictObject({
    slides: z.array(SlideSchema).min(1).max(MAX_SLIDES),
    style: DocumentStyleSchema,
    formatId: FormatIdSchema.nullable(),
  })
  .refine((c) => c.slides.every((s) => s.artboard.width === c.slides[0].artboard.width && s.artboard.height === c.slides[0].artboard.height), {
    message: "Todos os slides precisam ter o mesmo tamanho.",
  })
  .refine((c) => new Set(c.slides.map((s) => s.id)).size === c.slides.length, { message: "IDs de slide repetidos." });
export type PresentationContent = z.infer<typeof PresentationContentSchema>;

/**
 * Conteúdo de qualquer documento. A forma decide o tipo: `artboard` = canvas,
 * `pages` = carrossel, `scenes` = motion, `slides` = apresentação.
 */
export const DocumentContentSchema = z.union([CanvasContentSchema, CarouselContentSchema, MotionContentSchema, PresentationContentSchema]);
export type DocumentContent = CanvasContent | CarouselContent | MotionContent | PresentationContent;
export type SequenceContent = CarouselContent | MotionContent | PresentationContent;

export function isCarousel(content: DocumentContent): content is CarouselContent {
  return "pages" in content;
}

export function isPresentation(content: DocumentContent): content is PresentationContent {
  return "slides" in content;
}

export function isMotion(content: DocumentContent): content is MotionContent {
  return "scenes" in content;
}

export function isSequence(content: DocumentContent): content is SequenceContent {
  return isCarousel(content) || isMotion(content) || isPresentation(content);
}

export function kindOf(content: DocumentContent): DocumentKind {
  return isCarousel(content) ? "carousel" : isMotion(content) ? "motion" : isPresentation(content) ? "presentation" : "canvas";
}

/**
 * Artboards em ordem de saída (canvas = 1; carrossel = páginas; motion = cenas no
 * estado final, usadas para miniaturas e pôsteres estáticos).
 */
export function contentPages(content: DocumentContent): { artboard: Artboard; title?: string }[] {
  if (isCarousel(content)) return content.pages;
  if (isMotion(content)) return content.scenes;
  if (isPresentation(content)) return content.slides;
  return [{ artboard: content.artboard }];
}

export const DocumentSourceSchema = z.strictObject({
  instanceId: z.string().max(40).optional(),
  compositionId: z.string().max(60).optional(),
  compositionVersion: z.number().int().positive().optional(),
});

export const CreativeDocumentSchema = z.strictObject({
  id: CreativeDocumentIdSchema,
  projectId: ProjectIdSchema,
  kind: DocumentKindSchema,
  name: z.string().trim().min(1).max(120),
  source: DocumentSourceSchema,
  headRevision: z.number().int().positive(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type CreativeDocument = z.infer<typeof CreativeDocumentSchema>;

/**
 * De onde veio a revisão:
 * - create: criação (em branco ou a partir de composição);
 * - edit: edição/autosave (revisões `edit` recentes e não fixadas são coalescidas);
 * - restore: volta a uma revisão anterior (sempre como revisão NOVA).
 */
export const RevisionOriginSchema = z.enum(["create", "edit", "restore"]);
export type RevisionOrigin = z.infer<typeof RevisionOriginSchema>;

export const DocumentRevisionSchema = z.strictObject({
  documentId: CreativeDocumentIdSchema,
  revision: z.number().int().positive(),
  content: DocumentContentSchema,
  origin: RevisionOriginSchema,
  /** Fixada quando um render a referencia: nunca mais é reescrita. */
  pinned: z.boolean(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type DocumentRevision = z.infer<typeof DocumentRevisionSchema>;
export type RevisionSummary = Omit<DocumentRevision, "content">;

/** Janela em que autosaves seguidos reescrevem a mesma revisão (não fixada). */
export const COALESCE_WINDOW_MS = 120_000;

/** Decide se um novo conteúdo reescreve a revisão atual ou abre uma nova. Pura. */
export function shouldCoalesce(head: Pick<DocumentRevision, "origin" | "pinned" | "createdAt">, origin: RevisionOrigin, now: Date): boolean {
  return origin === "edit" && head.origin === "edit" && !head.pinned && now.getTime() - Date.parse(head.createdAt) < COALESCE_WINDOW_MS;
}

export function contentAssetIds(content: DocumentContent): string[] {
  return [...new Set(contentPages(content).flatMap((p) => artboardAssetIds(p.artboard)))];
}

export interface CommitResult {
  document: CreativeDocument;
  revision: RevisionSummary;
}

export interface CreativeDocumentRepository {
  /** Cria documento + revisão 1 numa transação. */
  create(document: CreativeDocument, content: DocumentContent, origin: RevisionOrigin): Promise<CommitResult>;
  getById(id: CreativeDocumentId): Promise<CreativeDocument | null>;
  listByProject(projectId: ProjectId): Promise<CreativeDocument[]>;
  rename(id: CreativeDocumentId, name: string): Promise<CreativeDocument>;
  delete(id: CreativeDocumentId): Promise<void>;
  getRevision(id: CreativeDocumentId, revision: number): Promise<DocumentRevision | null>;
  listRevisions(id: CreativeDocumentId): Promise<RevisionSummary[]>;
  /**
   * Grava um conteúdo novo sobre `baseRevision` (concorrência otimista: CONFLICT se
   * a cabeça mudou). Coalesce com a cabeça segundo `shouldCoalesce`.
   */
  commit(id: CreativeDocumentId, baseRevision: number, content: DocumentContent, origin: RevisionOrigin): Promise<CommitResult>;
  /** Fixa uma revisão (referenciada por um render). */
  pin(id: CreativeDocumentId, revision: number): Promise<void>;
}

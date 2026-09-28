import { z } from "zod";
import { ProjectIdSchema, UlidSchema, type ProjectId } from "../../shared/id";
import { TimestampSchema } from "../../shared/validation";
import { FormatIdSchema } from "../creative/formats";
import { StyleModeSchema } from "../creative/tokens";
import { ArtboardSchema, artboardAssetIds, type Artboard } from "./artboard";

/**
 * CreativeDocument (docs/DOMAIN-MODEL.md): documento editável e revisionado.
 * Família: canvas agora; carousel, motion, presentation e case nas fases seguintes
 * reutilizam a mesma tabela de revisões com outro `kind` e outro conteúdo.
 */
export const DocumentKindSchema = z.enum(["canvas"]);
export type DocumentKind = z.infer<typeof DocumentKindSchema>;

export const CreativeDocumentIdSchema = UlidSchema.brand<"CreativeDocumentId">();
export type CreativeDocumentId = z.infer<typeof CreativeDocumentIdSchema>;

/** Estilo de render guardado NA revisão: uma revisão é uma entrada de render completa. */
export const DocumentStyleSchema = z.strictObject({
  mode: StyleModeSchema,
  primary: z.string().regex(/^#[0-9a-f]{6}$/).optional(),
  /** Revisão do VisualProfile usada nos tokens (null = sem identidade → Atlas). */
  profileRevision: z.number().int().positive().nullable(),
});
export type DocumentStyle = z.infer<typeof DocumentStyleSchema>;

/** Conteúdo de um CanvasDocument: um artboard + estilo + formato de origem (se houver). */
export const CanvasContentSchema = z.strictObject({
  artboard: ArtboardSchema,
  style: DocumentStyleSchema,
  formatId: FormatIdSchema.nullable(),
});
export type CanvasContent = z.infer<typeof CanvasContentSchema>;
export type CanvasContentInput = z.input<typeof CanvasContentSchema>;

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
  content: CanvasContentSchema,
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

export function contentAssetIds(content: { artboard: Artboard }): string[] {
  return artboardAssetIds(content.artboard);
}

export interface CommitResult {
  document: CreativeDocument;
  revision: RevisionSummary;
}

export interface CreativeDocumentRepository {
  /** Cria documento + revisão 1 numa transação. */
  create(document: CreativeDocument, content: CanvasContent, origin: RevisionOrigin): Promise<CommitResult>;
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
  commit(id: CreativeDocumentId, baseRevision: number, content: CanvasContent, origin: RevisionOrigin): Promise<CommitResult>;
  /** Fixa uma revisão (referenciada por um render). */
  pin(id: CreativeDocumentId, revision: number): Promise<void>;
}

import { z } from "zod";
import { ProjectIdSchema, UlidSchema, newId, type ProjectId } from "../../shared/id";
import { TimestampSchema, nowIso, parseOrThrow } from "../../shared/validation";
import { StyleModeSchema } from "./tokens";

/**
 * CreativeDirection (docs/DOMAIN-MODEL.md): a linha criativa que várias peças
 * compartilham (Media Kit, carrossel). Salva a partir de um plano ou escrita à mão
 * e reutilizada em pedidos novos — consistência entre entregas.
 */
export const CreativeDirectionIdSchema = UlidSchema.brand<"CreativeDirectionId">();
export type CreativeDirectionId = z.infer<typeof CreativeDirectionIdSchema>;

export const SavedDirectionSchema = z.strictObject({
  id: CreativeDirectionIdSchema,
  projectId: ProjectIdSchema,
  name: z.string().trim().min(1).max(80),
  tone: z.string().trim().max(160),
  emphasis: z.string().trim().max(240),
  styleMode: StyleModeSchema,
  accent: z.string().regex(/^#[0-9a-f]{6}$/).nullable(),
  notes: z.string().trim().max(600),
  /** Plano de onde veio (se veio de um). */
  planId: z.string().max(40).nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type SavedDirection = z.infer<typeof SavedDirectionSchema>;

export function createDirection(input: Omit<SavedDirection, "id" | "createdAt" | "updatedAt">): SavedDirection {
  const now = nowIso();
  return parseOrThrow(SavedDirectionSchema, { ...input, id: newId(), createdAt: now, updatedAt: now }, "Direção criativa");
}

export interface CreativeDirectionRepository {
  create(direction: SavedDirection): Promise<SavedDirection>;
  getById(id: CreativeDirectionId): Promise<SavedDirection | null>;
  listByProject(projectId: ProjectId): Promise<SavedDirection[]>;
  delete(id: CreativeDirectionId): Promise<void>;
}

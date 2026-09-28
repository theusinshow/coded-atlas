import { z } from "zod";
import { StyleModeSchema } from "../creative/tokens";

/** Estilo de render guardado NA revisão: uma revisão é uma entrada de render completa. */
export const DocumentStyleSchema = z.strictObject({
  mode: StyleModeSchema,
  primary: z.string().regex(/^#[0-9a-f]{6}$/).optional(),
  /** Revisão do VisualProfile usada nos tokens (null = sem identidade → Atlas). */
  profileRevision: z.number().int().positive().nullable(),
});
export type DocumentStyle = z.infer<typeof DocumentStyleSchema>;

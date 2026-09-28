import { z } from "zod";
import { BindingSchema } from "@/src/core/creative/composition";
import { FormatIdSchema } from "@/src/core/creative/formats";
import { StyleModeSchema } from "@/src/core/creative/tokens";

// Schemas das server actions (arquivos "use server" só podem exportar funções async).

/** Alterações do inspetor rápido (validadas de novo no serviço). */
export const PatchSchema = z.strictObject({
  name: z.string().max(120).optional(),
  formatId: FormatIdSchema.optional(),
  variant: z.string().min(1).max(40).optional(),
  styleMode: StyleModeSchema.optional(),
  bindings: z.record(z.string().min(1).max(40), BindingSchema).optional(),
  overrides: z.strictObject({ primary: z.string().regex(/^#[0-9a-f]{6}$/).optional() }).optional(),
  refreshProfile: z.boolean().optional(),
});
export type InstancePatch = z.infer<typeof PatchSchema>;

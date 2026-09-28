import { z } from "zod";
import { newId, AssetIdSchema, JobIdSchema, OutputIdSchema, ProjectIdSchema } from "../../shared/id";
import { Sha256Schema, TimestampSchema, nowIso, parseOrThrow } from "../../shared/validation";
import { StorageKeySchema } from "./storage-key";

/**
 * Output: arquivo final entregável (imutável). Diferente do Asset, que é
 * matéria-prima reutilizável; o Output é o produto de um render/export.
 */
export const OutputFormatSchema = z.enum(["png", "jpg", "webp", "mp4", "webm", "pdf", "pptx"]);
export type OutputFormat = z.infer<typeof OutputFormatSchema>;

const DimensionSchema = z.number().int().positive().max(100_000);

export const OutputSchema = z.strictObject({
  id: OutputIdSchema,
  projectId: ProjectIdSchema,
  jobId: JobIdSchema.nullable(),
  format: OutputFormatSchema,
  mimeType: z.string().regex(/^[a-z]+\/[a-z0-9.+-]+$/),
  storageKey: StorageKeySchema,
  sha256: Sha256Schema,
  byteSize: z.number().int().nonnegative(),
  width: DimensionSchema.nullable(),
  height: DimensionSchema.nullable(),
  durationMs: z.number().int().positive().nullable(),
  sourceAssetIds: z.array(AssetIdSchema).max(500),
  label: z.string().trim().min(1).max(200).nullable(),
  createdAt: TimestampSchema,
});
export type Output = z.infer<typeof OutputSchema>;

export type NewOutputInput = Pick<Output, "projectId" | "format" | "mimeType" | "storageKey" | "sha256" | "byteSize"> &
  Partial<Pick<Output, "jobId" | "width" | "height" | "durationMs" | "sourceAssetIds" | "label">>;

export function createOutput(input: NewOutputInput): Output {
  return parseOrThrow(
    OutputSchema,
    {
      jobId: null,
      width: null,
      height: null,
      durationMs: null,
      sourceAssetIds: [],
      label: null,
      ...input,
      id: newId(),
      createdAt: nowIso(),
    },
    "Output"
  );
}

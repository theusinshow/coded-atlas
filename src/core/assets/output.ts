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

/** De onde a peça final veio — para rastrear, refazer e agrupar (JSON validado). */
export const OutputMetadataSchema = z.strictObject({
  origin: z.enum(["render", "legacy"]).optional(),
  compositionId: z.string().max(60).optional(),
  compositionVersion: z.number().int().positive().optional(),
  instanceId: z.string().max(40).optional(),
  documentId: z.string().max(40).optional(),
  documentRevision: z.number().int().positive().optional(),
  page: z.number().int().nonnegative().optional(),
  formatId: z.string().max(40).optional(),
  variant: z.string().max(40).optional(),
  styleMode: z.string().max(20).optional(),
  mediaKitId: z.string().max(40).optional(),
});
export type OutputMetadata = z.infer<typeof OutputMetadataSchema>;

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
  metadata: OutputMetadataSchema,
  createdAt: TimestampSchema,
});
export type Output = z.infer<typeof OutputSchema>;

export type NewOutputInput = Pick<Output, "projectId" | "format" | "mimeType" | "storageKey" | "sha256" | "byteSize"> &
  Partial<Pick<Output, "jobId" | "width" | "height" | "durationMs" | "sourceAssetIds" | "label" | "metadata">>;

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
      metadata: {},
      ...input,
      id: newId(),
      createdAt: nowIso(),
    },
    "Output"
  );
}

import { z } from "zod";
import { newId, CaptureIdSchema, JobIdSchema, ProjectIdSchema, SourceIdSchema } from "../../shared/id";
import { TimestampSchema, nowIso, parseOrThrow } from "../../shared/validation";
import { CapturePlanSchema } from "./capture-plan";

/**
 * Capture: uma OPERAÇÃO de captura, não um arquivo. Os Assets resultantes
 * apontam para ela via `asset.captureId`.
 */
export const CaptureTypeSchema = z.enum(["page", "section", "state", "device", "motion"]);
export type CaptureType = z.infer<typeof CaptureTypeSchema>;

export const CaptureStatusSchema = z.enum(["pending", "running", "completed", "failed", "cancelled"]);
export type CaptureStatus = z.infer<typeof CaptureStatusSchema>;

/** Parâmetros persistidos (JSON) — o suficiente para reproduzir a captura. */
export const CaptureParamsSchema = z.strictObject({
  url: z.string().max(2048).optional(),
  viewport: z
    .strictObject({
      label: z.string().min(1).max(40),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      deviceScaleFactor: z.number().positive().max(4),
    })
    .optional(),
  fullPage: z.boolean().optional(),
  selector: z.string().max(500).optional(),
  /** Captura completa (2.3): o plano executado. */
  plan: CapturePlanSchema.optional(),
});
export type CaptureParams = z.infer<typeof CaptureParamsSchema>;

export const CaptureErrorSchema = z.strictObject({
  code: z.string().min(1).max(60),
  message: z.string().max(2000),
});

export const CaptureSchema = z.strictObject({
  id: CaptureIdSchema,
  projectId: ProjectIdSchema,
  sourceId: SourceIdSchema,
  jobId: JobIdSchema.nullable(),
  type: CaptureTypeSchema,
  status: CaptureStatusSchema,
  params: CaptureParamsSchema,
  error: CaptureErrorSchema.nullable(),
  createdAt: TimestampSchema,
  startedAt: TimestampSchema.nullable(),
  completedAt: TimestampSchema.nullable(),
});
export type Capture = z.infer<typeof CaptureSchema>;

export type NewCaptureInput = Pick<Capture, "projectId" | "sourceId" | "type"> &
  Partial<Pick<Capture, "jobId" | "params">>;

export function createCapture(input: NewCaptureInput): Capture {
  return parseOrThrow(
    CaptureSchema,
    {
      id: newId(),
      projectId: input.projectId,
      sourceId: input.sourceId,
      jobId: input.jobId ?? null,
      type: input.type,
      status: "pending",
      params: input.params ?? {},
      error: null,
      createdAt: nowIso(),
      startedAt: null,
      completedAt: null,
    },
    "Capture"
  );
}

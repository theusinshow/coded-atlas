import { z } from "zod";
import { monotonicFactory } from "ulid";

/**
 * Identidade interna estável: ULID (26 chars Crockford base32, ordenável por
 * tempo). Slug é propriedade exibível, nunca identidade.
 */
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

const nextUlid = monotonicFactory();

export function newId(): string {
  return nextUlid();
}

export const UlidSchema = z.string().regex(ULID_PATTERN, "ULID inválido");

export const ProjectIdSchema = UlidSchema.brand<"ProjectId">();
export const SourceIdSchema = UlidSchema.brand<"SourceId">();
export const AssetIdSchema = UlidSchema.brand<"AssetId">();
export const CaptureIdSchema = UlidSchema.brand<"CaptureId">();
export const JobIdSchema = UlidSchema.brand<"JobId">();
export const OutputIdSchema = UlidSchema.brand<"OutputId">();

export type ProjectId = z.infer<typeof ProjectIdSchema>;
export type SourceId = z.infer<typeof SourceIdSchema>;
export type AssetId = z.infer<typeof AssetIdSchema>;
export type CaptureId = z.infer<typeof CaptureIdSchema>;
export type JobId = z.infer<typeof JobIdSchema>;
export type OutputId = z.infer<typeof OutputIdSchema>;

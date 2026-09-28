import { z } from "zod";
import { DomainError } from "./errors";

/**
 * Valida `value` contra `schema` na fronteira (entrada de repositório, leitura do
 * banco, JSON persistido). Falha vira DomainError("VALIDATION") com as issues —
 * nunca coerção silenciosa.
 */
export function parseOrThrow<S extends z.ZodType>(schema: S, value: unknown, what: string): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new DomainError("VALIDATION", `${what} inválido: ${z.prettifyError(result.error)}`, {
      issues: result.error.issues,
    });
  }
  return result.data;
}

/** Timestamp ISO-8601 em UTC (ex.: 2026-09-27T12:00:00.000Z). */
export const TimestampSchema = z.iso.datetime();
export type Timestamp = z.infer<typeof TimestampSchema>;

export const nowIso = (): Timestamp => new Date().toISOString();

/** Hash SHA-256 em hexadecimal minúsculo. */
export const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, "SHA-256 hex (64 chars minúsculos)");
export type Sha256 = z.infer<typeof Sha256Schema>;

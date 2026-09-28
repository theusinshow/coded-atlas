import type { z } from "zod";
import { DomainError, isDomainError, type DomainErrorCode } from "@/src/shared/errors";

const STATUS: Partial<Record<DomainErrorCode, number>> = {
  VALIDATION: 400,
  INVALID_STORAGE_KEY: 400,
  PATH_OUTSIDE_ROOT: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_TRANSITION: 409,
  DB_SCHEMA_MISMATCH: 503,
};

/** Converte qualquer erro em resposta JSON; erro inesperado vira 500 sem vazar detalhes. */
export function errorResponse(err: unknown): Response {
  if (isDomainError(err)) {
    return Response.json({ error: { code: err.code, message: err.message } }, { status: STATUS[err.code] ?? 500 });
  }
  console.error("[atlas:api]", err);
  return Response.json({ error: { code: "UNKNOWN", message: "Erro inesperado." } }, { status: 500 });
}

/** Valida um parâmetro de rota (ex.: ULID) antes de qualquer acesso a banco/disco. */
export function parseParam<S extends z.ZodType>(schema: S, value: unknown, name: string): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new DomainError("VALIDATION", `Parâmetro inválido: ${name}.`);
  return result.data;
}

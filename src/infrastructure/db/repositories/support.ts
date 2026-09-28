import { SqliteError } from "better-sqlite3";
import type { z } from "zod";
import { DomainError } from "../../../shared/errors";
import { parseOrThrow } from "../../../shared/validation";

/** Valida uma linha lida do banco contra o schema da entidade (fronteira de persistência). */
export function toDomain<S extends z.ZodType>(schema: S, row: unknown, what: string): z.output<S> {
  return parseOrThrow(schema, row, `${what} persistido`);
}

/**
 * Executa uma operação no banco traduzindo falhas conhecidas em DomainError:
 * unicidade → CONFLICT; FK inexistente → VALIDATION; JSON corrompido na leitura
 * (drizzle faz JSON.parse ao mapear colunas json) → VALIDATION.
 */
export function run<T>(what: string, op: () => T): T {
  try {
    return op();
  } catch (err) {
    if (err instanceof DomainError) throw err;
    if (err instanceof SqliteError) {
      if (err.code === "SQLITE_CONSTRAINT_UNIQUE" || err.code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
        throw new DomainError("CONFLICT", `${what}: registro já existe.`, { sqlite: err.message }, { cause: err });
      }
      if (err.code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
        throw new DomainError("VALIDATION", `${what}: referência a registro inexistente.`, undefined, { cause: err });
      }
    }
    if (err instanceof SyntaxError) {
      throw new DomainError("VALIDATION", `${what}: JSON persistido inválido.`, undefined, { cause: err });
    }
    throw err;
  }
}

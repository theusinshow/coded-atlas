/**
 * Erro base da nova fundação (src/). Todo erro esperado cruza as camadas como
 * DomainError com um código conhecido; o que não for DomainError é bug.
 *
 * O pipeline legado (lib/) continua usando `AtlasError` (lib/errors.ts) até ser
 * migrado — os dois convivem durante a transição (ver docs/DECISIONS.md, ADR-019).
 */
export type DomainErrorCode =
  | "VALIDATION"          // dado não satisfaz o contrato (Zod/regra de domínio)
  | "NOT_FOUND"           // registro/objeto inexistente
  | "CONFLICT"            // unicidade violada ou objeto imutável já existe com outro conteúdo
  | "INVALID_TRANSITION"  // mudança de estado não permitida (ex.: job concluído → running)
  | "INVALID_STORAGE_KEY" // storage key fora do formato seguro
  | "PATH_OUTSIDE_ROOT"   // caminho resolvido escapa da raiz confinada
  | "STORAGE_FAILED"      // falha de I/O ao ler/gravar bytes
  | "DB_SCHEMA_MISMATCH"  // banco criado por outra versão/migrations divergentes
  | "CANCELLED"           // trabalho interrompido por pedido de cancelamento
  | "INTERRUPTED"         // trabalho interrompido pelo desligamento do worker
  | "TIMEOUT";            // trabalho excedeu o tempo máximo configurado

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "DomainError";
  }
}

export function isDomainError(err: unknown, code?: DomainErrorCode): err is DomainError {
  return err instanceof DomainError && (code === undefined || err.code === code);
}

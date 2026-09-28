import type { CatalogWarning, CatalogWarningCode } from "./types";

/** Recebe avisos de etapas opcionais do pipeline v1 (2.1.G). */
export type WarnFn = (warning: CatalogWarning) => void;

/** Monta um aviso com o detalhe técnico do erro (curto — vai para o catalog.json). */
export function warning(
  code: CatalogWarningCode,
  message: string,
  err?: unknown,
  device?: "desktop" | "mobile"
): CatalogWarning {
  const detail = err === undefined ? undefined : (err instanceof Error ? err.message : String(err)).slice(0, 500);
  return { code, message, ...(device ? { device } : {}), ...(detail ? { detail } : {}) };
}

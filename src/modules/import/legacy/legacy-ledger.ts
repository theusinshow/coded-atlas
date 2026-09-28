import type { ProjectId } from "../../../shared/id";

/**
 * Registro da importação da biblioteca v1, um por pasta. Torna a importação
 * idempotente, lembra projetos dispensados (não reimportar a cada início) e
 * guarda o `createdAt` do catálogo para detectar recapturas feitas no v1.
 */
export interface LegacyImportEntry {
  slug: string;
  projectId: ProjectId | null;
  status: "imported" | "dismissed" | "failed";
  catalogCreatedAt: string | null;
  error: string | null;
}

export interface LegacyImportLedger {
  get(slug: string): Promise<LegacyImportEntry | null>;
  list(): Promise<LegacyImportEntry[]>;
  record(entry: LegacyImportEntry): Promise<void>;
}

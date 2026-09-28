import { SlugSchema } from "../../../core/projects/project";
import type { LegacyStore } from "./legacy-store";
import { mapLegacyCatalog, type LegacyIssue, type LegacyProjectSnapshot } from "./map-catalog";

export interface LegacyFileStatus {
  present: boolean;
  byteSize: number | null;
}

export interface LegacyScannedProject extends LegacyProjectSnapshot {
  /** Mesmo índice de `files`. */
  fileStatus: LegacyFileStatus[];
  caseDraftPresent: boolean;
}

export interface LegacyScanReport {
  scannedFolders: number;
  projects: LegacyScannedProject[];
  /** Nada é descartado em silêncio: toda pasta que não virou projeto aparece aqui. */
  issues: LegacyIssue[];
}

/**
 * Lê a biblioteca do Atlas v1 inteira e descreve cada projeto no modelo novo.
 * Somente leitura; falhas por projeto nunca derrubam a varredura.
 */
export async function scanLegacyLibrary(store: LegacyStore): Promise<LegacyScanReport> {
  const folders = await store.listFolders();
  const projects: LegacyScannedProject[] = [];
  const issues: LegacyIssue[] = [];

  for (const folder of folders) {
    const slug = SlugSchema.safeParse(folder.name);
    if (!slug.success) {
      issues.push({
        folder: folder.name,
        severity: "error",
        code: "INVALID_FOLDER_NAME",
        message: "Nome de pasta não é um slug válido; ignorada.",
      });
      continue;
    }
    if (!folder.isSafeDirectory) {
      issues.push({
        folder: folder.name,
        severity: "error",
        code: "UNSAFE_FOLDER",
        message: "Entrada não é uma pasta real dentro de public/generated; ignorada.",
      });
      continue;
    }

    const read = await store.readCatalog(slug.data);
    if (read.status !== "ok") {
      issues.push(readIssue(folder.name, read));
      continue;
    }

    const mapped = mapLegacyCatalog(slug.data, read.raw);
    issues.push(...mapped.issues);
    if (!mapped.snapshot) continue;

    const fileStatus: LegacyFileStatus[] = [];
    for (const file of mapped.snapshot.files) {
      const stat = await store.statPublicPath(file.publicPath);
      fileStatus.push({ present: stat !== null, byteSize: stat?.byteSize ?? null });
      if (!stat) {
        issues.push({
          folder: folder.name,
          severity: "warning",
          code: "FILE_MISSING",
          message: `Referenciado no catálogo, ausente no disco: ${file.publicPath}`,
          details: { role: file.role },
        });
      }
    }

    projects.push({ ...mapped.snapshot, fileStatus, caseDraftPresent: await store.hasCaseDraft(slug.data) });
  }

  return { scannedFolders: folders.length, projects, issues };
}

function readIssue(
  folder: string,
  read: Exclude<Awaited<ReturnType<LegacyStore["readCatalog"]>>, { status: "ok" }>
): LegacyIssue {
  switch (read.status) {
    case "missing":
      return { folder, severity: "error", code: "CATALOG_MISSING", message: "Pasta sem catalog.json." };
    case "too-large":
      return {
        folder,
        severity: "error",
        code: "CATALOG_TOO_LARGE",
        message: "catalog.json grande demais para ser um catálogo legítimo.",
        details: { byteSize: read.byteSize },
      };
    case "invalid-json":
      return { folder, severity: "error", code: "CATALOG_INVALID_JSON", message: `JSON inválido: ${read.reason}` };
    case "unreadable":
      return { folder, severity: "error", code: "CATALOG_UNREADABLE", message: `Falha de leitura: ${read.reason}` };
  }
}

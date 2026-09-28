import { promises as fs } from "node:fs";
import { config } from "../config";
import type { ProjectSummary } from "../types";
import { readCatalog } from "./read-catalog";

/**
 * Lista todos os projetos gerados lendo as subpastas de public/generated/.
 * Ignora pastas sem catalog.json; catálogos inválidos são reportados no log.
 * Retorna ordenado por data de criação decrescente (mais recente primeiro).
 */
export async function listProjects(): Promise<ProjectSummary[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(config.outputDir);
  } catch {
    return [];
  }

  const results = await Promise.all(
    // Pastas sem catalog.json (ex.: .trash) ficam de fora; catálogo inválido é
    // reportado no log pelo readCatalog — nada some em silêncio.
    entries.map(async (entry): Promise<ProjectSummary | null> => {
      const read = await readCatalog(entry);
      if (read.status !== "ok") return null;
      const { catalog } = read;
      return {
        slug: entry,
        name: catalog.project.name,
        category: catalog.project.category,
        client: catalog.project.client,
        url: catalog.project.url,
        thumbnail: catalog.thumbnails.main,
        createdAt: catalog.createdAt,
      };
    })
  );

  return results
    .filter((p): p is ProjectSummary => p !== null)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

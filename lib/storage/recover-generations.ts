import { promises as fs } from "node:fs";
import path from "node:path";
import { LegacyCatalogSchema } from "../../src/modules/import/legacy/catalog-schema";
import { SlugSchema } from "../../src/core/projects/project";
import { resolveWithin } from "../../src/infrastructure/storage/confine";
import { config } from "../config";

export type RecoveryAction =
  | { slug: string; backup: string; action: "restored" }   // geração nova não terminou: volta a anterior
  | { slug: string; backup: string; action: "discarded" }  // geração nova terminou; backup sobrando
  | { slug: string | null; backup: string; action: "skipped"; reason: string };

/**
 * Recuperação de gerações v1 interrompidas (2.1.G — geração transacional).
 *
 * A recaptura move a versão válida para `.trash/<slug>-<timestamp>` antes de
 * gerar a nova e decide no fim (commit/rollback). Se o processo morre no meio,
 * o projeto fica sem catalog.json válido e some da biblioteca. Rodado na
 * inicialização do servidor, antes de qualquer geração:
 *   - pasta atual sem catálogo válido → restaura o backup mais recente;
 *   - pasta atual válida → backup é resto de um commit interrompido → descarta.
 * Nunca apaga uma versão válida.
 */
export async function recoverInterruptedGenerations(outputDir: string = config.outputDir): Promise<RecoveryAction[]> {
  const trash = path.join(outputDir, ".trash");
  let entries: string[];
  try {
    entries = await fs.readdir(trash);
  } catch {
    return []; // sem .trash: nada a recuperar
  }

  // Mais recente primeiro: se houver vários backups do mesmo slug, o mais novo é a última versão válida.
  const backups = entries
    .map((name) => ({ name, match: /^(.+)-(\d{10,})$/.exec(name) }))
    .sort((a, b) => Number(b.match?.[2] ?? 0) - Number(a.match?.[2] ?? 0));

  const actions: RecoveryAction[] = [];
  for (const { name, match } of backups) {
    const backupDir = path.join(trash, name);
    const slug = match?.[1] ?? null;
    if (!slug || !SlugSchema.safeParse(slug).success) {
      actions.push({ slug, backup: name, action: "skipped", reason: "nome de backup não reconhecido" });
      continue;
    }
    if (!(await hasValidCatalog(backupDir))) {
      actions.push({ slug, backup: name, action: "skipped", reason: "backup sem catálogo válido — mantido para inspeção" });
      continue;
    }

    const current = resolveWithin(outputDir, slug);
    if (await hasValidCatalog(current)) {
      await fs.rm(backupDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      actions.push({ slug, backup: name, action: "discarded" });
      continue;
    }

    // Parcial da geração interrompida: preserva o rascunho de case se ele só existir ali.
    const draft = path.join(current, "case-draft.mdx");
    const backupDraft = path.join(backupDir, "case-draft.mdx");
    if ((await exists(draft)) && !(await exists(backupDraft))) await fs.copyFile(draft, backupDraft);
    await fs.rm(current, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    await fs.rename(backupDir, current);
    actions.push({ slug, backup: name, action: "restored" });
  }
  return actions;
}

async function hasValidCatalog(dir: string): Promise<boolean> {
  try {
    return LegacyCatalogSchema.safeParse(JSON.parse(await fs.readFile(path.join(dir, "catalog.json"), "utf-8"))).success;
  } catch {
    return false; // ausente ou ilegível = não é uma versão válida
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

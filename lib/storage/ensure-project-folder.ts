import path from "node:path";
import { promises as fs } from "node:fs";
import { AtlasError } from "../errors";
import { config } from "../config";
import { projectDir, screenshotDir, thumbnailDir, caseDraftPath, trashDir } from "./paths";

/**
 * Resultado de preparar a pasta de um projeto. Se a pasta já existia, a versão
 * anterior foi movida para `backupDir` — a geração decide no fim se descarta
 * o backup (sucesso) ou o restaura (falha/cancelamento).
 */
export interface ProjectFolderLease {
  backupDir?: string;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function createSubfolders(slug: string): Promise<void> {
  await fs.mkdir(screenshotDir(slug), { recursive: true });
  await fs.mkdir(thumbnailDir(slug), { recursive: true });
}

export async function ensureProjectFolder(slug: string): Promise<ProjectFolderLease> {
  const dir = projectDir(slug);

  if (!(await exists(dir))) {
    await createSubfolders(slug);
    return {};
  }

  if (config.onSlugConflict === "fail") {
    throw new AtlasError(
      "SLUG_CONFLICT",
      "Já existe um projeto com este slug.",
      `Project folder already exists: ${dir}`
    );
  }

  // Reprocessamento: move a versão anterior para .trash em vez de apagar,
  // para poder restaurá-la se a nova geração falhar ou for cancelada.
  const backupDir = path.join(trashDir(), `${slug}-${Date.now()}`);
  try {
    await fs.mkdir(trashDir(), { recursive: true });
    await fs.rename(dir, backupDir);
  } catch (err) {
    // Rename pode falhar no Windows com arquivo em uso — cai no comportamento
    // antigo (recriar do zero), preservando só o rascunho de case.
    console.warn(`[atlas:${slug}] backup indisponível (${err}); recriando a pasta.`);
    let savedCaseDraft: string | undefined;
    try {
      savedCaseDraft = await fs.readFile(caseDraftPath(slug), "utf-8");
    } catch {
      /* sem case draft — nada a preservar */
    }
    await fs.rm(dir, { recursive: true, force: true });
    await createSubfolders(slug);
    if (savedCaseDraft !== undefined) {
      await fs.writeFile(caseDraftPath(slug), savedCaseDraft, "utf-8");
    }
    return {};
  }

  await createSubfolders(slug);

  // O rascunho de case é conteúdo autoral downstream (não é artefato de
  // captura): acompanha a pasta nova.
  const backupDraft = path.join(backupDir, path.basename(caseDraftPath(slug)));
  if (await exists(backupDraft)) {
    await fs.copyFile(backupDraft, caseDraftPath(slug));
  }

  return { backupDir };
}

/** Geração concluída: descarta a versão anterior. */
export async function commitProjectFolder(lease: ProjectFolderLease): Promise<void> {
  if (lease.backupDir) {
    await fs.rm(lease.backupDir, { recursive: true, force: true });
  }
}

/**
 * Geração falhou ou foi cancelada: remove o que foi escrito pela metade e,
 * se havia versão anterior, restaura-a. Nunca deixa pasta órfã.
 */
export async function rollbackProjectFolder(
  slug: string,
  lease: ProjectFolderLease
): Promise<void> {
  const dir = projectDir(slug);
  // No Windows, o vídeo parcial segue travado (EBUSY) por alguns instantes
  // depois de o Chromium fechar — o rm tenta de novo em vez de desistir.
  await fs.rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  if (lease.backupDir) {
    await fs.rename(lease.backupDir, dir);
  }
}

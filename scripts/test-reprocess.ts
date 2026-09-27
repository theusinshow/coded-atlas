import { promises as fs } from "node:fs";
import path from "node:path";
import {
  ensureProjectFolder,
  commitProjectFolder,
  rollbackProjectFolder,
} from "../lib/storage/ensure-project-folder";
import { projectDir, caseDraftPath, screenshotDir, thumbnailDir, trashDir } from "../lib/storage/paths";

const SLUG = "__test_reprocess__";

let pass = 0, fail = 0;
function ok(label: string, cond: boolean) {
  if (cond) { console.log(`  ✓ ${label}`); pass++; }
  else { console.log(`  ✗ ${label}`); fail++; }
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

async function main() {
  await fs.rm(projectDir(SLUG), { recursive: true, force: true });

  // ── 1. Primeira geração — pasta nova ──
  await ensureProjectFolder(SLUG);
  ok("cria screenshots/", await exists(screenshotDir(SLUG)));
  ok("cria thumbnails/", await exists(thumbnailDir(SLUG)));

  // Artefatos: um screenshot e um case-draft autoral
  await fs.writeFile(path.join(screenshotDir(SLUG), "desktop.png"), "fake-png");
  await fs.writeFile(caseDraftPath(SLUG), "# Case autoral\nconteúdo importante");

  // ── 2. Reprocessamento (overwrite) ──
  const lease2 = await ensureProjectFolder(SLUG);
  ok("versão anterior guardada em backup", Boolean(lease2.backupDir) && (await exists(lease2.backupDir!)));
  ok("screenshot antigo removido (capturas regeneradas)",
    !(await exists(path.join(screenshotDir(SLUG), "desktop.png"))));
  ok("screenshots/ recriado vazio", await exists(screenshotDir(SLUG)));

  const draftSurvived = await exists(caseDraftPath(SLUG));
  ok("case-draft.mdx PRESERVADO no reprocessamento", draftSurvived);
  if (draftSurvived) {
    const content = await fs.readFile(caseDraftPath(SLUG), "utf-8");
    ok("conteúdo do case-draft intacto", content.includes("conteúdo importante"));
  }
  await commitProjectFolder(lease2);
  ok("commit descarta o backup", !(await exists(lease2.backupDir!)));

  // ── 3. Overwrite sem case-draft não quebra ──
  await fs.rm(caseDraftPath(SLUG), { force: true });
  await commitProjectFolder(await ensureProjectFolder(SLUG));
  ok("overwrite sem case-draft não quebra", !(await exists(caseDraftPath(SLUG))));

  // ── 4. Reprocessamento que falha restaura a versão anterior ──
  const marker = path.join(screenshotDir(SLUG), "anterior.png");
  await fs.writeFile(marker, "versao-anterior");
  await fs.writeFile(caseDraftPath(SLUG), "# Case autoral");
  const lease4 = await ensureProjectFolder(SLUG);
  await fs.writeFile(path.join(screenshotDir(SLUG), "parcial.png"), "meio-caminho");
  await rollbackProjectFolder(SLUG, lease4);
  ok("rollback restaura a captura anterior", await exists(marker));
  ok("rollback descarta o que foi escrito pela metade",
    !(await exists(path.join(screenshotDir(SLUG), "parcial.png"))));
  ok("rollback mantém o case-draft", await exists(caseDraftPath(SLUG)));
  ok("rollback não deixa backup para trás", !(await exists(lease4.backupDir!)));

  // ── 5. Primeira geração que falha não deixa pasta órfã ──
  await fs.rm(projectDir(SLUG), { recursive: true, force: true });
  const lease5 = await ensureProjectFolder(SLUG);
  ok("pasta nova não gera backup", lease5.backupDir === undefined);
  await rollbackProjectFolder(SLUG, lease5);
  ok("falha em projeto novo remove a pasta", !(await exists(projectDir(SLUG))));

  // .trash não pode aparecer como projeto (sem catalog.json na raiz)
  ok(".trash não tem catalog.json", !(await exists(path.join(trashDir(), "catalog.json"))));

  await fs.rm(projectDir(SLUG), { recursive: true, force: true });
  console.log(`\n${pass}/${pass + fail} passaram.`);
  process.exit(fail === 0 ? 0 : 1);
}

main();

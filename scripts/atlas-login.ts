/**
 * Login manual para captura autenticada (Atlas 2.x).
 * Uso: npm run atlas:login -- <slug-do-projeto> [url-de-login]
 *
 * Abre um navegador VISÍVEL na URL de login (padrão: a origem de site do
 * projeto). Você entra normalmente — MFA e login social incluídos — e aperta
 * Enter aqui. A sessão (cookies + localStorage) fica em <ATLAS_HOME>/auth e as
 * próximas capturas do projeto já entram logadas. Remova pela aba Captura.
 */
import readline from "node:readline/promises";
import path from "node:path";
import { chromium } from "playwright";
import { CAPTURE_SETTINGS } from "../src/infrastructure/capture-settings";
import { SlugSchema } from "../src/core/projects/project";
import { resolveAtlasHome } from "../src/infrastructure/atlas-home";
import { openDatabase } from "../src/infrastructure/db/client";
import { createRepositories } from "../src/infrastructure/db/repositories";
import { createUrlPolicy, resolveUrlPolicyMode } from "../src/infrastructure/net/url-policy";
import { FileSessionStore } from "../src/infrastructure/playwright/file-session-store";
import { SessionStateSchema } from "../src/modules/capture/session-store";

async function main(): Promise<void> {
  const [slugArg, urlArg] = process.argv.slice(2);
  const slug = SlugSchema.safeParse(slugArg);
  if (!slug.success) {
    console.error("Uso: npm run atlas:login -- <slug-do-projeto> [url-de-login]");
    process.exitCode = 1;
    return;
  }
  const home = resolveAtlasHome();
  const database = openDatabase({ file: home.databaseFile });
  try {
    const repos = createRepositories(database.db);
    const project = await repos.projects.getBySlug(slug.data);
    if (!project) throw new Error(`Projeto "${slug.data}" não existe neste ATLAS_HOME (${home.root}).`);
    const url = urlArg ?? (await repos.sources.listByProject(project.id)).find((s) => s.type === "url" || s.type === "local")?.locator;
    if (!url) throw new Error("O projeto não tem origem de site — informe a URL de login como segundo argumento.");
    await createUrlPolicy(resolveUrlPolicyMode()).assertAllowed(url);

    const browser = await chromium.launch({ headless: false });
    try {
      const context = await browser.newContext({ userAgent: CAPTURE_SETTINGS.userAgent, viewport: null });
      const page = await context.newPage();
      await page.goto(url, { timeout: CAPTURE_SETTINGS.navTimeoutMs }).catch((err: unknown) => console.warn(`Aviso: ${err instanceof Error ? err.message : String(err)}`));
      console.log(`\nFaça o login no navegador que abriu (${url}).`);
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      await rl.question("Quando estiver logado, volte aqui e aperte Enter para salvar a sessão… ");
      rl.close();
      const state = SessionStateSchema.parse(await context.storageState());
      const info = await new FileSessionStore(path.join(home.root, "auth")).save(project.id, state);
      console.log(`Sessão salva para "${project.name}": ${info.cookieCount} cookies · ${info.domains.join(", ") || "sem domínios"}.`);
      console.log("As próximas capturas deste projeto entram autenticadas. Para remover: aba Captura → Remover sessão.");
    } finally {
      await browser.close();
    }
  } finally {
    database.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

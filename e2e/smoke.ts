/**
 * E2E de fumaça da UI do Atlas 2.x — dirige o navegador pelas telas reais.
 *
 * Uso (sempre contra um servidor com ATLAS_HOME TEMPORÁRIO — cria e apaga dados):
 *   ATLAS_HOME=/tmp/atlas-e2e npx next start -p 5055
 *   E2E_BASE_URL=http://localhost:5055 npm run e2e
 *
 * Sobe um site fixture local (não depende de internet) e cresce a cada fase.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { chromium, type Page } from "playwright";
import sharp from "sharp";

const BASE = process.env.E2E_BASE_URL;
if (!BASE) {
  console.error("Defina E2E_BASE_URL (ex.: http://localhost:5055) apontando para um servidor com ATLAS_HOME temporário.");
  process.exit(1);
}

let failures = 0;
async function step(name: string, fn: () => Promise<void>): Promise<void> {
  const t0 = Date.now();
  try {
    await fn();
    console.log(`  ✓ ${name} (${Date.now() - t0}ms)`);
  } catch (err) {
    failures++;
    console.log(`  ✗ ${name}\n    ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
  }
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  assert(res.ok, `${path} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function waitFor(predicate: () => Promise<boolean>, what: string, ms = 90_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error(`timeout: ${what}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function main(): Promise<void> {
  const fixture = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    if (req.url === "/sobre") return void res.end(`<html><body style="margin:0;background:#f4f1ea"><h1>Página sobre</h1></body></html>`);
    res.end(`<!doctype html><html><head><style>
      body{margin:0;background:#101418;color:#e6e6e6;font:40px Georgia,serif} header,section,footer{min-height:600px;padding:60px}
      #menu{display:none;position:fixed;inset:0;background:#c4884c} body.open #menu{display:block}
    </style></head><body>
      <header id="hero"><h1>Fixture E2E</h1><button id="abrir" onclick="document.body.classList.add('open')">Menu</button></header>
      <section id="servicos" style="background:#1b2530"><h2>Serviços</h2></section>
      <section id="about"><h2>Sobre</h2></section><footer>Contato</footer><div id="menu">menu</div></body></html>`);
  });
  await new Promise<void>((r) => fixture.listen(0, "127.0.0.1", r));
  const fixtureUrl = `http://127.0.0.1:${(fixture.address() as AddressInfo).port}/`;

  const browser = await chromium.launch({ headless: true });
  const page: Page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const slug = `e2e-fixture-${Date.now().toString(36)}`;
  let projectId = "";

  console.log(`\nE2E contra ${BASE}`);
  try {
    await step("biblioteca abre e / redireciona para /projects", async () => {
      await page.goto(`${BASE}/`);
      assert(page.url().endsWith("/projects"), `url ${page.url()}`);
      await page.getByRole("heading", { name: "Biblioteca de projetos" }).waitFor();
    });

    await step("novo projeto com URL + captura imediata", async () => {
      await page.goto(`${BASE}/projects/new`);
      await page.getByLabel("URL do site").fill(fixtureUrl);
      await page.getByLabel("Nome").fill(`E2E ${slug}`);
      await page.getByLabel("Categoria").fill("Site");
      await page.getByRole("button", { name: "Criar projeto" }).click();
      await page.waitForURL(`**/projects/e2e-${slug}`);
      const { projects } = await api<{ projects: { id: string; slug: string }[] }>("/api/atlas/projects");
      projectId = projects.find((p) => p.slug === `e2e-${slug}`)?.id ?? "";
      assert(projectId, "projeto não apareceu na API");
    });

    await step("captura roda no worker e vira Asset", async () => {
      await waitFor(async () => {
        const data = await api<{ assets: unknown[]; jobs: { status: string }[] }>(`/api/atlas/projects/${projectId}`);
        if (data.jobs.some((j) => j.status === "failed")) throw new Error("job de captura falhou");
        return data.assets.length > 0;
      }, "asset da captura");
      await page.goto(`${BASE}/projects/e2e-${slug}/capture`);
      await page.getByText("concluída").first().waitFor();
    });

    await step("captura completa pela aba Captura (página extra + estado)", async () => {
      await page.goto(`${BASE}/projects/e2e-${slug}/capture`);
      await page.getByText("Páginas extras e estados de interação").click();
      await page.getByLabel("Páginas extras").fill("/sobre");
      await page.getByLabel("Estados").fill("Menu aberto | #abrir");
      await page.getByRole("button", { name: "Capturar", exact: true }).click();
      await waitFor(async () => {
        const data = await api<{ assets: { metadata: { role?: string } }[]; jobs: { status: string; payload: { plan?: unknown } }[] }>(`/api/atlas/projects/${projectId}`);
        const full = data.jobs.filter((j) => j.payload.plan);
        if (full.some((j) => j.status === "failed")) throw new Error("captura completa falhou");
        const roles = new Set(data.assets.map((a) => a.metadata.role));
        return full.length >= 2 && full.every((j) => j.status === "completed") && ["section", "page-viewport", "state", "cover"].every((r) => roles.has(r));
      }, "assets da captura completa", 180_000);
      await page.reload();
      await page.getByText("página(s) extra(s)").first().waitFor();
    });

    await step("detalhe do asset: linhagem e trocar a capa", async () => {
      await page.goto(`${BASE}/projects/e2e-${slug}/assets?kind=section`);
      await page.locator(`a[href*="/projects/e2e-${slug}/assets/"]`).first().click();
      await page.getByRole("heading", { level: 2 }).first().waitFor();
      await page.getByRole("button", { name: "Usar como capa" }).click();
      await page.getByText("Capa atualizada.").waitFor();
      await page.goto(`${BASE}/projects/e2e-${slug}/assets?kind=screenshot`);
      await page.locator("li", { hasText: "Capa 1.91:1" }).first().locator("a").first().click();
      await page.getByText("Derivado de:").waitFor();
    });

    await step("identidade visual e biblioteca global", async () => {
      await page.goto(`${BASE}/projects/e2e-${slug}`);
      await page.getByText("#101418").waitFor();
      await page.goto(`${BASE}/library?q=servi&project=e2e-${slug}`);
      await page.getByText("Serviços").first().waitFor();
    });

    await step("upload manual de imagem", async () => {
      const png = await sharp({ create: { width: 640, height: 400, channels: 3, background: "#c4884c" } }).png().toBuffer();
      await page.goto(`${BASE}/projects/e2e-${slug}/assets`);
      await page.getByLabel("Arquivos", { exact: true }).setInputFiles({ name: "logo-e2e.png", mimeType: "image/png", buffer: png });
      await page.getByLabel("Tipo de asset").selectOption("logo");
      await page.getByRole("button", { name: "Enviar" }).click();
      await page.getByText("1 enviado(s)").waitFor();
      await page.getByText("logo-e2e").waitFor();
    });

    await step("editar, arquivar e restaurar", async () => {
      await page.goto(`${BASE}/projects/e2e-${slug}/settings`);
      await page.getByLabel("Descrição").fill("Criado pelo E2E.");
      await page.getByRole("button", { name: "Salvar" }).click();
      await page.getByText("Alterações salvas.").waitFor();
      await page.getByRole("button", { name: "Arquivar" }).click();
      await page.getByRole("button", { name: "Restaurar" }).waitFor();
      await page.goto(`${BASE}/projects?q=${slug}`);
      await page.getByText("Nada encontrado").waitFor();
      await page.goto(`${BASE}/projects/e2e-${slug}/settings`);
      await page.getByRole("button", { name: "Restaurar" }).click();
      await page.getByRole("button", { name: "Arquivar" }).waitFor();
    });

    await step("jobs e ajustes mostram o estado real", async () => {
      await page.goto(`${BASE}/jobs`);
      await page.getByText("Captura").first().waitFor();
      await page.goto(`${BASE}/settings`);
      await page.getByRole("button", { name: "Sincronizar biblioteca v1" }).waitFor();
    });

    await step("excluir com confirmação digitada", async () => {
      await page.goto(`${BASE}/projects/e2e-${slug}/settings`);
      const del = page.getByRole("button", { name: "Excluir projeto" });
      assert(await del.isDisabled(), "botão de excluir deveria começar desabilitado");
      await page.getByLabel(/para confirmar/).fill(`e2e-${slug}`);
      await del.click();
      await page.waitForURL("**/projects");
      const res = await fetch(`${BASE}/projects/e2e-${slug}`);
      assert(res.status === 404, `projeto ainda existe (HTTP ${res.status})`);
    });
  } finally {
    await browser.close();
    fixture.close();
  }

  console.log(failures ? `\n${failures} passo(s) falharam.` : "\nTodos os passos passaram.");
  process.exitCode = failures ? 1 : 0;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});

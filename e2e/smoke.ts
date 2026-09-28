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
      await page.getByRole("list", { name: "Paleta" }).getByText("#101418").waitFor();
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

    await step("criar composição, ajustar e renderizar", async () => {
      await page.goto(`${BASE}/projects/e2e-${slug}/create`);
      const card = page.locator('[data-composition="desktop-hero"]');
      await card.locator("[data-atlas-artboard]").waitFor();
      await card.getByRole("button", { name: "Usar" }).click();
      await page.waitForURL(/\/create\/[0-9A-Z]{26}$/);
      await page.locator("#slot-title").fill("Peça do E2E");
      await page.getByRole("radio", { name: "Sangrando" }).click();
      await page.getByText("Alterações não salvas").waitFor();
      await page.getByRole("button", { name: "Renderizar" }).click();
      await page.getByText("Concluído").waitFor({ timeout: 120_000 });
    });

    await step("publicar: peça final com dimensão exata e download", async () => {
      await page.goto(`${BASE}/projects/e2e-${slug}/publish`);
      const card = page.locator("[data-output]").first();
      await card.getByText("PNG · 1080×1350").waitFor();
      const id = await card.getAttribute("data-output");
      const res = await fetch(`${BASE}/api/atlas/outputs/${id}/file?download=1`);
      assert(res.ok && res.headers.get("content-type") === "image/png", `download HTTP ${res.status}`);
      assert(/attachment; filename=".+\.png"/.test(res.headers.get("content-disposition") ?? ""), "sem content-disposition");
      const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
      assert(meta.width === 1080 && meta.height === 1350, `dimensão ${meta.width}×${meta.height}`);
    });

    await step("studio: abrir composição no canvas, editar, autosave e desfazer", async () => {
      await page.goto(`${BASE}/projects/e2e-${slug}/create`);
      await page.locator(`a[href*="/projects/e2e-${slug}/create/"]`).first().click();
      await page.getByRole("button", { name: "Editar no canvas" }).click();
      await page.waitForURL(/\/studio\/[0-9A-Z]{26}$/);
      await page.locator("[data-studio-artboard] [data-atlas-artboard]").waitFor();
      await page.getByRole("tab", { name: "Adicionar" }).click();
      await page.getByRole("complementary", { name: "Camadas e material" }).getByRole("button", { name: "Texto", exact: true }).click();
      await page.locator("#layer-text").fill("Texto do canvas E2E");
      await page.locator('[data-save-state="saved"]').waitFor({ timeout: 15_000 });
      assert((await page.locator("[data-save-state]").textContent())?.includes("rev 2"), "autosave não gerou a revisão 2");

      // Arrastar o layer selecionado muda X; Ctrl+Z desfaz o arrasto inteiro.
      const xField = page.getByLabel("X", { exact: true });
      const before = Number(await xField.inputValue());
      const frame = page.locator("[data-selection]");
      const b = (await frame.boundingBox())!;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2 + 60, b.y + b.height / 2 + 5, { steps: 6 });
      await page.mouse.up();
      const moved = Number(await xField.inputValue());
      assert(moved !== before, `arrastar não moveu (x=${moved})`);
      await page.keyboard.press("Escape");
      await page.keyboard.press("Control+z");
      await page.getByRole("tab", { name: "Camadas" }).click();
      await page.locator("[data-layer-row]").first().click();
      assert(Number(await page.getByLabel("X", { exact: true }).inputValue()) === before, "desfazer não voltou a posição");
    });

    await step("studio: renderizar a revisão e abrir a peça em Publicar", async () => {
      await page.getByRole("button", { name: "Renderizar", exact: true }).click();
      await page.getByRole("button", { name: "Renderizar agora" }).click();
      await page.getByText("Concluído").waitFor({ timeout: 120_000 });
      await page.goto(`${BASE}/projects/e2e-${slug}/publish`);
      await page.getByText(/Abrir no canvas \(rev \d+\)/).first().waitFor();
    });

    await step("atlas brain: pedir plano, ver peças com preview e criar uma", async () => {
      await page.goto(`${BASE}/projects/e2e-${slug}/plans`);
      await page.getByText("Stories").click();
      await page.getByRole("button", { name: "Pedir plano" }).click();
      await page.waitForURL(/\/plans\/[0-9A-Z]{26}$/, { timeout: 120_000 });
      await page.locator("[data-plan-item] [data-atlas-artboard]").first().waitFor();
      const before = (await page.request.get(`${BASE}/projects/e2e-${slug}/create`)).ok();
      assert(before, "Criar indisponível");
      await page.locator("[data-plan-item='0']").getByRole("button", { name: "Criar esta" }).click();
      await page.waitForURL(`**/projects/e2e-${slug}/create`);
      await page.goto(`${BASE}/projects/e2e-${slug}/plans`);
      await page.getByText("aplicado").first().waitFor();
    });

    await step("sistema criativo: corrigir identidade, memória do projeto e direção salva", async () => {
      await page.goto(`${BASE}/projects/e2e-${slug}`);
      await page.getByText("Corrigir identidade").click();
      await page.getByLabel(/Paleta \(hex/).fill("#0b1f33, #f2a900, #ffffff");
      await page.getByRole("button", { name: "Salvar nova revisão" }).click();
      await page.getByText(/Identidade atualizada \(revisão \d+\)/).waitFor();

      await page.goto(`${BASE}/projects/e2e-${slug}/plans`);
      const memory = page.locator("form", { has: page.getByLabel("Assunto") });
      await memory.getByLabel("Tipo").selectOption("avoid");
      await memory.getByLabel("Assunto").selectOption("composition");
      await memory.getByLabel("Composição").selectOption("mobile-stack");
      await memory.getByRole("button", { name: "Adicionar" }).click();
      await page.getByRole("list", { name: "Memórias" }).getByText("Mobile Stack").waitFor();

      await page.locator("a[href*='/plans/']").first().click();
      await page.getByLabel("Salvar como direção criativa").fill("Direção E2E");
      await page.getByRole("button", { name: "Salvar", exact: true }).click();
      await page.getByText('Direção "Direção E2E" salva').waitFor();
      await page.goto(`${BASE}/projects/e2e-${slug}/plans`);
      await page.getByLabel("Seguir uma direção salva").selectOption({ label: "Direção E2E" });
    });

    await step("carrossel: plano → páginas no Studio → render com ZIP", async () => {
      await page.goto(`${BASE}/projects/e2e-${slug}/plans`);
      await page.getByText("Carrossel", { exact: true }).click();
      await page.getByRole("button", { name: "Pedir plano" }).click();
      await page.waitForURL(/\/plans\/[0-9A-Z]{26}$/, { timeout: 120_000 });
      await page.getByRole("button", { name: "Montar como carrossel" }).click();
      await page.waitForURL(/\/studio\/[0-9A-Z]{26}$/);
      const thumbs = page.locator("[data-page-thumb]");
      await thumbs.first().waitFor();
      const count = await thumbs.count();
      assert(count >= 2, `carrossel com ${count} página(s)`);
      await thumbs.nth(1).click();
      await page.getByText(`Página 2/${count}`).waitFor();
      await page.getByRole("button", { name: "+ Página" }).click();
      await page.getByText(`Página 3/${count + 1}`).waitFor();
      await page.locator('[data-save-state="saved"]').waitFor({ timeout: 15_000 });
      await page.getByRole("button", { name: "Renderizar", exact: true }).click();
      await page.getByRole("button", { name: "Renderizar agora" }).click();
      await page.getByText("Concluído").waitFor({ timeout: 180_000 });
      await page.goto(`${BASE}/projects/e2e-${slug}/publish`);
      await page.getByText(`Carrossel · ${count + 1} páginas`).waitFor();
      const href = await page.getByRole("link", { name: "Baixar tudo (.zip)" }).first().getAttribute("href");
      const res = await fetch(`${BASE}${href}`);
      assert(res.ok && res.headers.get("content-type") === "application/zip", `zip HTTP ${res.status}`);
      assert(Buffer.from(await res.arrayBuffer()).subarray(0, 2).toString() === "PK", "zip inválido");
    });

    await step("motion: Website Scroll e Animar documento, preview e preset", async () => {
      await page.goto(`${BASE}/projects/e2e-${slug}/create`);
      await page.getByRole("button", { name: "Criar vídeo" }).click();
      await page.waitForURL(/\/studio\/[0-9A-Z]{26}$/);
      await page.getByRole("button", { name: "Tocar vídeo" }).click();
      await page.locator("[data-motion-player] [data-atlas-artboard]").first().waitFor();
      await page.getByRole("button", { name: "Editar cena" }).click();
      await page.locator("[data-layer-row]").first().click();
      await page.locator('[data-track="website-scroll"]').waitFor();

      // Um documento estático vira vídeo: cada página, uma cena animada.
      await page.goto(`${BASE}/projects/e2e-${slug}/create`);
      await page.locator("[data-document]").last().click();
      await page.waitForURL(/\/studio\//);
      await page.getByRole("button", { name: "Animar", exact: true }).click();
      await page.waitForURL(/\/studio\//);
      await page.getByRole("region", { name: "Cenas do vídeo" }).waitFor();
      await page.locator("[data-layer-row]").first().click();
      await page.getByLabel("Adicionar preset").selectOption("float");
      await page.locator('[data-track="float"]').waitFor();
      await page.locator('[data-save-state="saved"]').waitFor({ timeout: 15_000 });
    });

    await step("vídeo: receita → render MP4 (preview) → Publicar", async () => {
      await page.goto(`${BASE}/projects/e2e-${slug}/create`);
      await page.getByLabel("Receita de vídeo").selectOption("quick-showcase");
      await page.getByLabel("Formato do vídeo por receita").selectOption("post-1x1");
      await page.getByRole("button", { name: "Montar vídeo" }).click();
      await page.waitForURL(/\/studio\/[0-9A-Z]{26}$/);
      const scenes = await page.locator("[data-page-thumb]").count();
      assert(scenes >= 2, `receita com ${scenes} cena(s)`);
      await page.getByRole("button", { name: "Renderizar", exact: true }).click();
      await page.getByRole("radio", { name: "Preview rápido" }).click();
      await page.getByRole("button", { name: "Renderizar agora" }).click();
      await page.getByText("Concluído").waitFor({ timeout: 240_000 });
      await page.goto(`${BASE}/projects/e2e-${slug}/publish`);
      const card = page.locator("[data-output]", { has: page.locator("video") }).first();
      await card.getByText(/MP4 · 540×540 · [\d.]+ s · preview/).waitFor();
      const id = await card.getAttribute("data-output");
      const res = await fetch(`${BASE}/api/atlas/outputs/${id}/file`);
      assert(res.ok && res.headers.get("content-type") === "video/mp4", `mp4 HTTP ${res.status}`);
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

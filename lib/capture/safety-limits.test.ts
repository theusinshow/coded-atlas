import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CatalogWarning } from "../types";

// A vitrine grava em config.outputDir: aponta para uma pasta temporária ANTES de
// importar o config, para o teste nunca tocar em public/generated.
const dir = mkdtempSync(path.join(os.tmpdir(), "atlas-limits-"));
process.env.ATLAS_OUTPUT_DIR = path.join(dir, "generated");
const { config } = await import("../config");
const { captureFullPage } = await import("./fullpage-screenshot");
const { generateShowcase } = await import("./generate-showcase");
const { scrollToBottom } = await import("./scroll-to-bottom");

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(async () => {
  page = await (await browser.newContext({ viewport: { width: 400, height: 300 } })).newPage();
});

/** Página que ganha conteúdo toda vez que chega perto do fim — scroll infinito. */
const INFINITE = `<html><body style="margin:0"><div id="feed"></div><script>
  const feed = document.getElementById("feed");
  const add = () => { for (let i = 0; i < 20; i++) { const d = document.createElement("div"); d.style.height = "200px"; feed.appendChild(d); } };
  add();
  addEventListener("scroll", () => { if (innerHeight + scrollY > document.body.scrollHeight - 800) add(); });
</script></body></html>`;

describe("guarda de scroll infinito", () => {
  it("para no limite e avisa, em vez de rolar para sempre", async () => {
    await page.setContent(INFINITE);
    const started = Date.now();
    const result = await scrollToBottom(page, { maxHeightPx: 6_000, maxMs: 5_000 });
    expect(result.limitReached).toBe(true);
    expect(Date.now() - started).toBeLessThan(8_000);
  }, 20_000);

  it("página normal termina sem acionar o limite", async () => {
    await page.setContent(`<html><body style="margin:0"><div style="height:1500px"></div></body></html>`);
    expect((await scrollToBottom(page, { maxHeightPx: 6_000, maxMs: 5_000 })).limitReached).toBe(false);
  }, 20_000);
});

describe("full page com altura máxima", () => {
  it("página gigante é cortada em maxFullPageHeightPx, com aviso", async () => {
    await page.setContent(`<html><body style="margin:0"><div style="height:${config.maxFullPageHeightPx + 5000}px;background:linear-gradient(#123,#abc)"></div></body></html>`);
    const warnings: CatalogWarning[] = [];
    const file = path.join(dir, "gigante.png");
    await captureFullPage(page, file, "desktop", (w) => warnings.push(w));
    expect((await sharp(file).metadata()).height).toBe(config.maxFullPageHeightPx);
    expect(warnings).toEqual([expect.objectContaining({ code: "FULLPAGE_TRUNCATED", device: "desktop" })]);
  }, 30_000);

  it("página comum sai inteira, sem aviso", async () => {
    await page.setContent(`<html><body style="margin:0"><div style="height:900px"></div></body></html>`);
    const warnings: CatalogWarning[] = [];
    const file = path.join(dir, "normal.png");
    await captureFullPage(page, file, "mobile", (w) => warnings.push(w));
    expect((await sharp(file).metadata()).height).toBe(900);
    expect(warnings).toEqual([]);
  }, 30_000);
});

describe("vitrine: falha vira aviso estruturado", () => {
  it("screenshots ausentes → sem peças, com um aviso para cada peça que faltou", async () => {
    const missing = path.join(dir, "nao-existe.png");
    const result = await generateShowcase(browser, "sem-arquivos", { desktopAbs: missing, mobileAbs: missing }, { url: "https://x.example" });
    expect(result.cover).toBeUndefined();
    expect(result.compositions).toEqual([]);
    expect(result.mockups).toEqual([]);
    const count = (code: string) => result.warnings.filter((w) => w.code === code).length;
    // um aviso por peça que faltou: 1 capa, 3 composições, 2 mockups, 2 mockups 3D
    expect([count("COVER_FAILED"), count("COMPOSITIONS_FAILED"), count("MOCKUPS_FAILED"), count("MOCKUPS_3D_FAILED")]).toEqual([
      1, config.compositions.formats.length, 2, 2,
    ]);
    expect(result.warnings.every((w) => w.message && w.detail)).toBe(true);
    expect(config.outputDir.startsWith(dir)).toBe(true); // escreveu na pasta temporária, não em public/generated
  }, 30_000);
});

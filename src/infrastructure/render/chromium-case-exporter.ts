import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { safeFileBase } from "../../core/assets/file-names";
import { FONT_FAMILIES, type FontFamilyId } from "../../core/creative/tokens";
import { CASE_MODULE_WIDTH, type CaseExporter, type CaseExportResult, type CaseOutputKind, type MediaLoader } from "../../modules/render/case-exporter";
import { fontFiles } from "../../render/fonts";
import { buildZip, type ZipEntry } from "../zip/zip-builder";
import { installRenderRoutes, renderFontCss, RENDER_ORIGIN } from "./page-routes";
import { getRenderBundle, RENDER_ENTRIES } from "./render-bundle";

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/avif": "avif", "image/gif": "gif", "image/svg+xml": "svg" };
/** Altura de página do PDF: proporção A (1 : √2) na largura do case. */
const PDF_PAGE_HEIGHT = Math.round(CASE_MODULE_WIDTH * Math.SQRT2);

/**
 * Exportador do case no Chromium: renderiza o bundle do CaseView a 1400 px e dali
 * tira (1) a página web autônoma — o DOM serializado com imagens e fontes locais,
 * zipado; (2) PDF paginado sem quebrar seções; (3) um PNG por seção (módulos).
 */
export class ChromiumCaseExporter implements CaseExporter {
  constructor(private readonly options: { nodeModules?: string } = {}) {}

  async export(
    input: Parameters<CaseExporter["export"]>[0],
    kinds: readonly CaseOutputKind[],
    options: { loadAsset: MediaLoader; loadOutput: MediaLoader; signal: AbortSignal }
  ): Promise<CaseExportResult> {
    options.signal.throwIfAborted();
    let browser: Browser | undefined;
    const onAbort = () => void browser?.close().catch(() => undefined); // já fechando
    options.signal.addEventListener("abort", onAbort, { once: true });
    const assetCache = new Map<string, { bytes: Uint8Array; mimeType: string } | null>();
    const outputCache = new Map<string, { bytes: Uint8Array; mimeType: string } | null>();
    const cached = (cache: typeof assetCache, loader: MediaLoader) => async (id: string) => {
      if (!cache.has(id)) cache.set(id, await loader(id));
      return cache.get(id) ?? null;
    };
    const loadAsset = cached(assetCache, options.loadAsset);
    const loadOutput = cached(outputCache, options.loadOutput);
    try {
      const bundle = await getRenderBundle(RENDER_ENTRIES.case);
      browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
      const page = await browser.newPage({ viewport: { width: CASE_MODULE_WIDTH, height: 900 }, deviceScaleFactor: 1 });
      page.setDefaultTimeout(60_000);
      await installRenderRoutes(page, { loadAsset, loadOutput, nodeModules: this.options.nodeModules });
      const payload = JSON.stringify({ content: input.content, tokens: input.tokens, origin: RENDER_ORIGIN }).replace(/</g, "\\u003c");
      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><style>${renderFontCss()}
html,body{margin:0;padding:0;background:${input.tokens.colors.background}}
[data-case-section]{break-inside:avoid;page-break-inside:avoid}</style></head><body><div id="root"></div>
<script>window.__ATLAS_CASE__=${payload};</script><script>${bundle}</script></body></html>`,
        { waitUntil: "load" }
      );
      await page.waitForSelector("[data-atlas-case]");
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((img) => (img.complete ? img.decode().catch(() => undefined) : new Promise((r) => img.addEventListener("load", r, { once: true })))));
      });
      const result: CaseExportResult = {};

      if (kinds.includes("modules")) {
        result.modules = [];
        for (const handle of await page.$$("[data-case-section]")) {
          options.signal.throwIfAborted();
          const id = (await handle.getAttribute("data-case-section")) ?? "section";
          const box = await handle.boundingBox();
          const png = await handle.screenshot({ type: "png" });
          result.modules.push({ id, bytes: new Uint8Array(png), width: Math.round(box?.width ?? CASE_MODULE_WIDTH), height: Math.round(box?.height ?? 0) });
        }
      }

      if (kinds.includes("pdf")) {
        const pdf = await page.pdf({ width: `${CASE_MODULE_WIDTH}px`, height: `${PDF_PAGE_HEIGHT}px`, printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
        result.pdf = new Uint8Array(pdf);
      }

      if (kinds.includes("web")) {
        const markup = await page.evaluate(() => document.querySelector("[data-atlas-case]")?.outerHTML ?? "");
        result.web = await this.webPackage(markup, input, assetCache, outputCache);
      }
      return result;
    } catch (err) {
      if (options.signal.aborted) throw options.signal.reason;
      throw err;
    } finally {
      options.signal.removeEventListener("abort", onAbort);
      await browser?.close().catch(() => undefined);
    }
  }

  /** index.html autônomo: imagens em assets/, peças em pieces/, fontes usadas em fonts/. */
  private async webPackage(
    markup: string,
    input: Parameters<CaseExporter["export"]>[0],
    assets: Map<string, { bytes: Uint8Array; mimeType: string } | null>,
    outputs: Map<string, { bytes: Uint8Array; mimeType: string } | null>
  ): Promise<Uint8Array> {
    const entries: ZipEntry[] = [];
    const rewrite = (kind: "asset" | "output", folder: string, cache: typeof assets) => (_: string, encoded: string) => {
      const id = decodeURIComponent(encoded);
      const media = cache.get(id);
      const file = `${folder}/${safeFileBase(id, "media")}.${EXT[media?.mimeType ?? ""] ?? "bin"}`;
      if (media && !entries.some((e) => e.name === file)) entries.push({ name: file, bytes: media.bytes });
      return file;
    };
    const origin = RENDER_ORIGIN.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    let html = markup.replace(new RegExp(`${origin}/asset/([^"'\\s)]+)`, "g"), rewrite("asset", "assets", assets));
    html = html.replace(new RegExp(`${origin}/output/([^"'\\s)]+)`, "g"), rewrite("output", "pieces", outputs));

    const families = new Set<string>((["display", "body", "mono"] as const).map((role) => FONT_FAMILIES[input.tokens.fonts[role] as FontFamilyId].css));
    const nodeModules = this.options.nodeModules ?? path.join(process.cwd(), "node_modules");
    const faces: string[] = [];
    for (const font of fontFiles().filter((f) => families.has(f.family))) {
      const name = `fonts/${path.posix.basename(font.file)}`;
      entries.push({ name, bytes: new Uint8Array(await readFile(path.join(nodeModules, font.file))) });
      faces.push(`@font-face{font-family:'${font.family}';font-style:normal;font-weight:${font.weight};font-display:swap;src:url(${name}) format('woff2');}`);
    }
    const title = input.title.replace(/[<>&"]/g, "");
    const page = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Coded Atlas">
<title>${title}</title>
<style>${faces.join("\n")}
html,body{margin:0;padding:0;background:${input.tokens.colors.background}}
img{max-width:100%;height:auto}</style>
</head>
<body>
${html}
</body>
</html>
`;
    entries.unshift({ name: "index.html", bytes: new TextEncoder().encode(page) });
    return buildZip(entries);
  }
}

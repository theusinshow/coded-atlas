import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import sharp from "sharp";
import type { RenderedImage, RenderItem, StaticRenderer } from "../../modules/render/static-renderer";
import { fontFaceCss, fontFiles } from "../../render/fonts";
import { DomainError } from "../../shared/errors";
import { getRenderBundle } from "./render-bundle";

/** Origem fictícia interceptada pelo Playwright: nada sai da máquina. */
const ORIGIN = "http://atlas.render";

/**
 * StaticRenderer sobre Playwright: o Chromium roda o bundle do kernel React (o
 * mesmo componente do preview) na dimensão exata do artboard; o Sharp gera
 * JPG/WebP a partir do PNG.
 * Assets e fontes são servidos por interceptação de rota (sem servidor, sem rede).
 */
export class PlaywrightStaticRenderer implements StaticRenderer {
  constructor(private readonly options: { nodeModules?: string; timeoutMs?: number } = {}) {}

  async renderBatch(
    items: readonly RenderItem[],
    options: { loadAsset: (assetId: string) => Promise<{ bytes: Uint8Array; mimeType: string } | null>; signal: AbortSignal }
  ): Promise<RenderedImage[][]> {
    options.signal.throwIfAborted();
    const nodeModules = this.options.nodeModules ?? path.join(process.cwd(), "node_modules");
    const allowedFonts = new Set(fontFiles().map((f) => f.file));
    let browser: Browser | undefined;
    const onAbort = () => void browser?.close().catch(() => undefined); // já fechando: nada a fazer
    options.signal.addEventListener("abort", onAbort, { once: true });
    try {
      const bundle = await getRenderBundle();
      browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
      const results: RenderedImage[][] = [];
      for (const item of items) {
        options.signal.throwIfAborted();
        const { width, height } = item.artboard;
        const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
        page.setDefaultTimeout(this.options.timeoutMs ?? 30_000);
        await page.route(`${ORIGIN}/**`, async (route) => {
          const url = new URL(route.request().url());
          if (url.pathname.startsWith("/asset/")) {
            const asset = await options.loadAsset(decodeURIComponent(url.pathname.slice("/asset/".length)));
            return asset ? route.fulfill({ status: 200, contentType: asset.mimeType, body: Buffer.from(asset.bytes) }) : route.fulfill({ status: 404 });
          }
          if (url.pathname.startsWith("/font/")) {
            const file = decodeURIComponent(url.pathname.slice("/font/".length));
            if (!allowedFonts.has(file)) return route.fulfill({ status: 404 });
            return route.fulfill({ status: 200, contentType: "font/woff2", body: await readFile(path.join(nodeModules, file)) });
          }
          return route.fulfill({ status: 404 });
        });
        // Bloqueia qualquer outra origem (render determinístico e sem rede).
        await page.route((url) => !url.href.startsWith(ORIGIN) && !url.href.startsWith("data:") && !url.href.startsWith("about:"), (route) => route.abort());

        // Dados da peça como JSON seguro dentro de <script> (sem "</script>" possível).
        const payload = JSON.stringify({ artboard: item.artboard, tokens: item.tokens, origin: ORIGIN }).replace(/</g, "\\u003c");
        const html = `<!doctype html><html><head><meta charset="utf-8"><style>${fontFaceCss((f) => `${ORIGIN}/font/${encodeURIComponent(f.file)}`)}
html,body{margin:0;padding:0;background:transparent}</style></head><body><div id="root"></div>
<script>window.__ATLAS_RENDER__=${payload};</script><script>${bundle}</script></body></html>`;
        await page.setContent(html, { waitUntil: "load" });
        await page.waitForSelector("[data-atlas-artboard]");
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => img.addEventListener("load", r, { once: true })))));
        });
        const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width, height } });
        await page.close();

        const images: RenderedImage[] = [];
        for (const format of item.formats) {
          if (format === "png") images.push({ format, bytes: new Uint8Array(png), mimeType: "image/png", extension: "png", width, height });
          else if (format === "jpg") {
            const bytes = await sharp(png).flatten({ background: "#000000" }).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
            images.push({ format, bytes: new Uint8Array(bytes), mimeType: "image/jpeg", extension: "jpg", width, height });
          } else {
            const bytes = await sharp(png).webp({ quality: 90 }).toBuffer();
            images.push({ format, bytes: new Uint8Array(bytes), mimeType: "image/webp", extension: "webp", width, height });
          }
        }
        if (images.length === 0) throw new DomainError("VALIDATION", "Nenhum formato de saída pedido.");
        results.push(images);
      }
      return results;
    } catch (err) {
      if (options.signal.aborted) throw options.signal.reason;
      throw err;
    } finally {
      options.signal.removeEventListener("abort", onAbort);
      await browser?.close().catch(() => undefined);
    }
  }
}

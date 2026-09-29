import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright";
import { fontFaceCss, fontFiles } from "../../render/fonts";

/** Origem fictícia interceptada pelo Playwright: nada sai da máquina. */
export const RENDER_ORIGIN = "http://atlas.render";

export type AssetLoader = (assetId: string) => Promise<{ bytes: Uint8Array; mimeType: string } | null>;

export function renderFontCss(): string {
  return fontFaceCss((f) => `${RENDER_ORIGIN}/font/${encodeURIComponent(f.file)}`);
}

/**
 * Serve assets e fontes para a página de render por interceptação (sem servidor,
 * sem rede) e bloqueia qualquer outra origem. Suporta Range (206) para que
 * <video> consiga posicionar `currentTime` quadro a quadro.
 */
export async function installRenderRoutes(page: Page, options: { loadAsset: AssetLoader; loadOutput?: AssetLoader; projectRoot?: string }): Promise<void> {
  const projectRoot = options.projectRoot ?? process.cwd();
  const allowedFonts = new Set(fontFiles().map((f) => f.file));
  await page.route(`${RENDER_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/asset/") || (url.pathname.startsWith("/output/") && options.loadOutput)) {
      const isOutput = url.pathname.startsWith("/output/");
      const id = decodeURIComponent(url.pathname.slice(isOutput ? "/output/".length : "/asset/".length));
      const asset = isOutput ? await options.loadOutput!(id) : await options.loadAsset(id);
      if (!asset) return route.fulfill({ status: 404 });
      const total = asset.bytes.byteLength;
      const range = /^bytes=(\d*)-(\d*)$/.exec(route.request().headers()["range"] ?? "");
      if (range) {
        const start = range[1] ? Number(range[1]) : 0;
        const end = range[2] ? Math.min(Number(range[2]), total - 1) : total - 1;
        if (start > end || start >= total) return route.fulfill({ status: 416, headers: { "Content-Range": `bytes */${total}` } });
        return route.fulfill({
          status: 206,
          headers: { "Content-Type": asset.mimeType, "Content-Range": `bytes ${start}-${end}/${total}`, "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1) },
          body: Buffer.from(asset.bytes.subarray(start, end + 1)),
        });
      }
      return route.fulfill({ status: 200, headers: { "Content-Type": asset.mimeType, "Accept-Ranges": "bytes" }, body: Buffer.from(asset.bytes) });
    }
    if (url.pathname.startsWith("/font/")) {
      const file = decodeURIComponent(url.pathname.slice("/font/".length));
      if (!allowedFonts.has(file)) return route.fulfill({ status: 404 });
      return route.fulfill({ status: 200, contentType: "font/woff2", body: await readFile(path.join(projectRoot, file)) });
    }
    return route.fulfill({ status: 404 });
  });
  // Bloqueia qualquer outra origem (render determinístico e sem rede).
  await page.route((url) => !url.href.startsWith(RENDER_ORIGIN) && !url.href.startsWith("data:") && !url.href.startsWith("about:"), (route) => route.abort());
}

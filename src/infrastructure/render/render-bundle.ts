import path from "node:path";
import { build } from "esbuild";

const cache = new Map<string, Promise<string>>();

export const RENDER_ENTRIES = {
  /** Artboard estático (imagens). */
  static: path.join("src", "render", "browser-entry.tsx"),
  /** Quadros de motion (vídeo). */
  motion: path.join("src", "render", "motion-entry.tsx"),
  /** Página do case (web/PDF/módulos). */
  case: path.join("src", "render", "case-entry.tsx"),
} as const;

/**
 * Bundle (IIFE) de uma entrada do kernel de render para rodar no Chromium: React +
 * kernel + domínio. Gerado uma vez por processo com esbuild a partir do código-fonte —
 * o render usa exatamente os mesmos componentes do preview do navegador.
 */
export function getRenderBundle(entry: string = path.join(process.cwd(), RENDER_ENTRIES.static)): Promise<string> {
  const absolute = path.isAbsolute(entry) ? entry : path.join(process.cwd(), entry);
  let bundle = cache.get(absolute);
  if (!bundle) {
    bundle = build({
      entryPoints: [absolute],
      bundle: true,
      write: false,
      format: "iife",
      platform: "browser",
      target: "chrome120",
      jsx: "automatic",
      minify: true,
      legalComments: "none",
      define: { "process.env.NODE_ENV": '"production"' },
      logLevel: "silent",
    })
      .then((result) => {
        const file = result.outputFiles[0];
        if (!file) throw new Error("esbuild não gerou o bundle de render");
        return file.text;
      })
      .catch((err: unknown) => {
        cache.delete(absolute); // permite nova tentativa
        throw err;
      });
    cache.set(absolute, bundle);
  }
  return bundle;
}

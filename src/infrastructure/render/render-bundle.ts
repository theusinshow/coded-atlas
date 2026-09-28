import path from "node:path";
import { build } from "esbuild";

let cached: Promise<string> | null = null;

/**
 * Bundle (IIFE) do kernel de render para rodar no Chromium: React + ArtboardView
 * + domínio. Gerado uma vez por processo com esbuild a partir do código-fonte —
 * o render usa exatamente o mesmo componente do preview do navegador.
 */
export function getRenderBundle(entry = path.join(process.cwd(), "src", "render", "browser-entry.tsx")): Promise<string> {
  cached ??= build({
    entryPoints: [entry],
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
      cached = null; // permite nova tentativa
      throw err;
    });
  return cached;
}

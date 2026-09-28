import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regra de dependência (docs/ARCHITECTURE.md): o domínio não importa framework,
 * driver, engine de mídia, SDK de IA nem Node I/O. Este teste falha se alguém
 * acoplar src/core (ou src/shared, usado pelo domínio) a infraestrutura.
 */
const FORBIDDEN = [
  /^next(\/|$)/,
  /^react(-dom)?(\/|$)/,
  /^drizzle-orm/,
  /^better-sqlite3/,
  /^playwright/,
  /^sharp$/,
  /^remotion/,
  /^@remotion\//,
  /^openai/,
  /^fluent-ffmpeg/,
  /^(node:)?(fs|child_process|net|http|https)(\/|$)/,
  /infrastructure\//,
  /^@\/(lib|app|components)\//,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) && !name.endsWith(".test.ts") ? [full] : [];
  });
}

function imports(file: string): string[] {
  const text = readFileSync(file, "utf-8");
  return [...text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);
}

describe("fronteira do domínio", () => {
  const root = path.resolve(__dirname, "..");
  const files = [...sourceFiles(path.join(root, "core")), ...sourceFiles(path.join(root, "shared"))];

  it("encontra os arquivos do domínio", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files.map((f) => [path.relative(root, f), f]))("%s não importa infraestrutura", (_rel, file) => {
    const bad = imports(file).filter((spec) => FORBIDDEN.some((re) => re.test(spec)));
    expect(bad).toEqual([]);
  });
});

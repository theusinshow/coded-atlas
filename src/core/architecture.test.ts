import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regra de dependência (docs/ARCHITECTURE.md): o domínio não importa framework,
 * driver, engine de mídia, SDK de IA nem Node I/O; a camada de aplicação
 * (workers, módulos) depende das portas do domínio, nunca da infraestrutura.
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

/** Aplicação: pode usar Node e o domínio, mas nunca infraestrutura concreta. */
const APP_FORBIDDEN = [
  /^drizzle-orm/,
  /^better-sqlite3/,
  /^playwright/,
  /^sharp$/,
  /^remotion/,
  /^openai/,
  /infrastructure\//,
];

describe("fronteira da aplicação", () => {
  const root = path.resolve(__dirname, "..");
  const files = [...sourceFiles(path.join(root, "workers")), ...sourceFiles(path.join(root, "modules"))];

  it.each(files.map((f) => [path.relative(root, f), f]))("%s não importa infraestrutura", (_rel, file) => {
    const bad = imports(file).filter((spec) => APP_FORBIDDEN.some((re) => re.test(spec)));
    expect(bad).toEqual([]);
  });
});

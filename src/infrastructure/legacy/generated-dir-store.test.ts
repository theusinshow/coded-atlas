import { mkdirSync, mkdtempSync, promises as fs, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import v01 from "../../modules/import/legacy/__fixtures__/catalog-v0.1.json";
import { scanLegacyLibrary } from "../../modules/import/legacy/scan-legacy-library";
import { GeneratedDirStore } from "./generated-dir-store";

let root: string;
let outside: string;

function writeProject(slug: string, catalog: unknown, files: string[] = []): void {
  const dir = path.join(root, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "catalog.json"), typeof catalog === "string" ? catalog : JSON.stringify(catalog));
  for (const file of files) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), "bytes");
  }
}

function catalogFor(slug: string): typeof v01 {
  const json = JSON.stringify(v01).split("/generated/example-com/").join(`/generated/${slug}/`);
  const catalog = JSON.parse(json) as typeof v01;
  catalog.project.slug = slug;
  return catalog;
}

const ALL_FILES = [
  "screenshots/desktop-1440x900.png",
  "screenshots/desktop-fullpage.png",
  "screenshots/mobile-390x844.png",
  "screenshots/mobile-fullpage.png",
  "thumbnails/thumb-main.webp",
  "thumbnails/thumb-mobile.webp",
];

/** Árvore inteira com tamanho e mtime — para provar que a varredura não escreve nada. */
async function fingerprint(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fs.readdir(dir, { recursive: true })) {
    const info = statSync(path.join(dir, entry));
    out.push(`${entry}|${info.size}|${info.mtimeMs}`);
  }
  return out.sort();
}

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "atlas-legacy-"));
  outside = mkdtempSync(path.join(os.tmpdir(), "atlas-legacy-outside-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe("scanLegacyLibrary + GeneratedDirStore", () => {
  it("raiz inexistente = biblioteca vazia", async () => {
    const store = await GeneratedDirStore.open(path.join(root, "nao-existe"));
    expect(await scanLegacyLibrary(store)).toEqual({ scannedFolders: 0, projects: [], issues: [] });
  });

  it("biblioteca mista: válidos entram, o resto é reportado — e nada é escrito", async () => {
    writeProject("completo", catalogFor("completo"), ALL_FILES);
    writeFileSync(path.join(root, "completo", "case-draft.mdx"), "# case");
    writeProject("faltando-arquivos", catalogFor("faltando-arquivos"), ALL_FILES.slice(0, 2));
    writeProject("json-quebrado", "{ nao é json");
    writeProject("formato-errado", { version: "0.1.0", project: {} });
    mkdirSync(path.join(root, "sem-catalogo", "screenshots"), { recursive: true });
    writeProject("Nome Invalido", catalogFor("x"));
    mkdirSync(path.join(root, ".trash", "completo-123"), { recursive: true });
    writeFileSync(path.join(root, ".gitkeep"), "");
    writeFileSync(path.join(root, "arquivo-solto"), "x");

    const before = await fingerprint(root);
    const report = await scanLegacyLibrary(await GeneratedDirStore.open(root));
    expect(await fingerprint(root)).toEqual(before);

    expect(report.scannedFolders).toBe(7); // .trash e .gitkeep ignorados
    expect(report.projects.map((p) => p.slug)).toEqual(["completo", "faltando-arquivos"]);

    const completo = report.projects[0];
    expect(completo.caseDraftPresent).toBe(true);
    expect(completo.fileStatus).toEqual(ALL_FILES.map(() => ({ present: true, byteSize: 5 })));

    const faltando = report.projects[1];
    expect(faltando.caseDraftPresent).toBe(false);
    expect(faltando.fileStatus.filter((s) => !s.present)).toHaveLength(4);

    const summary = report.issues.map((i) => `${i.folder}:${i.severity}:${i.code}`);
    expect(summary).toEqual(
      expect.arrayContaining([
        "Nome Invalido:error:INVALID_FOLDER_NAME",
        "arquivo-solto:error:UNSAFE_FOLDER",
        "faltando-arquivos:warning:FILE_MISSING",
        "formato-errado:error:CATALOG_SCHEMA",
        "json-quebrado:error:CATALOG_INVALID_JSON",
        "sem-catalogo:error:CATALOG_MISSING",
      ])
    );
    expect(summary.filter((s) => s === "faltando-arquivos:warning:FILE_MISSING")).toHaveLength(4);
    expect(summary.some((s) => s.startsWith("completo:"))).toBe(false);
  });

  it("catálogo gigante é recusado sem ser lido", async () => {
    writeProject("gigante", " ".repeat(5 * 1024 * 1024 + 1));
    const report = await scanLegacyLibrary(await GeneratedDirStore.open(root));
    expect(report.issues).toEqual([expect.objectContaining({ folder: "gigante", code: "CATALOG_TOO_LARGE" })]);
  });

  it("pasta que é junction/symlink para fora da raiz é recusada", async () => {
    writeFileSync(path.join(outside, "catalog.json"), JSON.stringify(catalogFor("fuga")));
    try {
      symlinkSync(outside, path.join(root, "fuga"), "junction");
    } catch {
      return; // sistema sem suporte a links
    }
    const report = await scanLegacyLibrary(await GeneratedDirStore.open(root));
    expect(report.projects).toEqual([]);
    expect(report.issues).toEqual([expect.objectContaining({ folder: "fuga", code: "UNSAFE_FOLDER" })]);
  });

  it("arquivo referenciado por junction interna que sai da raiz conta como ausente", async () => {
    writeProject("vaza", catalogFor("vaza"), ALL_FILES.filter((f) => !f.startsWith("thumbnails/")));
    mkdirSync(path.join(outside, "thumbnails"));
    writeFileSync(path.join(outside, "thumbnails", "thumb-main.webp"), "segredo");
    try {
      symlinkSync(path.join(outside, "thumbnails"), path.join(root, "vaza", "thumbnails"), "junction");
    } catch {
      return;
    }
    const store = await GeneratedDirStore.open(root);
    expect(await store.statPublicPath("/generated/vaza/thumbnails/thumb-main.webp")).toBeNull();
    expect(await store.statPublicPath("/generated/../../etc/passwd")).toBeNull();
    expect(await store.statPublicPath("/outra-coisa/x.png")).toBeNull();
  });
});

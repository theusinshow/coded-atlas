import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import v01 from "../../src/modules/import/legacy/__fixtures__/catalog-v0.1.json";

// lib/config.ts lê ATLAS_OUTPUT_DIR no import: o ambiente é preparado antes dos imports dinâmicos.
const outputDir = mkdtempSync(path.join(os.tmpdir(), "atlas-paths-"));
process.env.ATLAS_OUTPUT_DIR = outputDir;
const { projectDir, catalogPath, authStatePath } = await import("./paths");
const { readCatalog, loadCatalog } = await import("./read-catalog");
const { listProjects } = await import("./list-projects");

function writeCatalog(slug: string, content: unknown): void {
  mkdirSync(path.join(outputDir, slug), { recursive: true });
  writeFileSync(path.join(outputDir, slug, "catalog.json"), typeof content === "string" ? content : JSON.stringify(content));
}

beforeAll(() => {
  writeCatalog("valido", { ...v01, project: { ...v01.project, slug: "valido" } });
  writeCatalog("quebrado", "{ nao é json");
  writeCatalog("formato-errado", { version: "0.1.0" });
  mkdirSync(path.join(outputDir, ".trash", "valido-1790000000000"), { recursive: true });
});
afterAll(() => {
  rmSync(outputDir, { recursive: true, force: true });
});

describe("paths centralizados", () => {
  it("slug válido vira caminho dentro de outputDir", () => {
    expect(projectDir("meu-projeto")).toBe(path.join(path.resolve(outputDir), "meu-projeto"));
    expect(catalogPath("meu-projeto")).toBe(path.join(path.resolve(outputDir), "meu-projeto", "catalog.json"));
  });

  it.each(["..", "../x", "a/b", "a\\b", "%2e%2e", "C:\\Windows", "/etc", "", "Maiuscula", ".trash"])(
    "slug %j nunca vira caminho",
    (slug) => {
      expect(() => projectDir(slug)).toThrow(/Invalid slug/);
      expect(() => authStatePath(slug)).toThrow(/Invalid slug/);
    }
  );
});

describe("readCatalog (validação em runtime)", () => {
  it("catálogo válido", async () => {
    const read = await readCatalog("valido");
    expect(read.status).toBe("ok");
    expect((await loadCatalog("valido"))?.project.name).toBe("Example");
  });

  it("JSON quebrado e formato errado → invalid (com motivo), nunca exceção", async () => {
    expect(await readCatalog("quebrado")).toMatchObject({ status: "invalid", reason: expect.stringMatching(/JSON/) });
    expect(await readCatalog("formato-errado")).toMatchObject({ status: "invalid" });
    expect(await loadCatalog("formato-errado")).toBeNull();
  });

  it("inexistente ou slug malicioso → missing", async () => {
    expect(await readCatalog("nao-existe")).toEqual({ status: "missing" });
    expect(await readCatalog("../../etc")).toEqual({ status: "missing" });
  });

  it("biblioteca lista só os válidos (e ignora .trash)", async () => {
    expect((await listProjects()).map((p) => p.slug)).toEqual(["valido"]);
  });
});

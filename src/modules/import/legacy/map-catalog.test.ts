import { describe, expect, it } from "vitest";
import v01 from "./__fixtures__/catalog-v0.1.json";
import v02 from "./__fixtures__/catalog-v0.2-full.json";
import { LegacyCatalogSchema } from "./catalog-schema";
import { mapLegacyCatalog, type LegacyIssueCode } from "./map-catalog";

const clone = <T>(value: T): T => structuredClone(value);
const codes = (issues: { code: LegacyIssueCode }[]) => issues.map((i) => i.code);

describe("LegacyCatalogSchema", () => {
  it.each([
    ["v0.1 (real)", v01],
    ["v0.2 completo", v02],
  ])("aceita %s", (_label, catalog) => {
    expect(LegacyCatalogSchema.safeParse(catalog).success).toBe(true);
  });

  it("tolera chaves desconhecidas (catálogo editado à mão)", () => {
    expect(LegacyCatalogSchema.safeParse({ ...clone(v01), foo: 1 }).success).toBe(true);
  });

  it.each([
    ["sem captures", (c: Record<string, unknown>) => delete c.captures],
    ["sections não é array", (c: Record<string, unknown>) => (c.sections = {})],
    ["caminho não público", (c: typeof v01) => (c.thumbnails.main = "C:\\Users\\x\\thumb.webp")],
    ["cover.source desconhecido", (c: typeof v02) => (c.cover.source = "ai")],
  ])("rejeita %s", (_label, mutate) => {
    const catalog = clone(v02);
    (mutate as (c: typeof v02) => void)(catalog);
    expect(LegacyCatalogSchema.safeParse(catalog).success).toBe(false);
  });
});

describe("mapLegacyCatalog", () => {
  it("v0.1: projeto, source e os 6 arquivos base, sem ressalvas", () => {
    const { snapshot, issues } = mapLegacyCatalog("example-com", v01);
    expect(issues).toEqual([]);
    expect(snapshot?.project).toEqual({
      slug: "example-com",
      name: "Example",
      category: "Site Institucional",
      client: "Example Inc.",
    });
    expect(snapshot?.source).toEqual({ type: "url", locator: "https://example.com" });
    expect(snapshot?.atlasVersion).toBe("0.1.0");
    expect(snapshot?.files.map((f) => f.role)).toEqual([
      "viewport",
      "fullpage",
      "viewport",
      "fullpage",
      "thumbnail",
      "thumbnail",
    ]);
    expect(snapshot?.unmapped.description).toBe("Página de teste para verificação do Fase 6.");
  });

  it("v0.2 completo: todos os tipos de arquivo, outputs e linhagem", () => {
    const { snapshot, issues } = mapLegacyCatalog("acme-studio", v02);
    expect(issues).toEqual([]);
    const byRole = (role: string) => snapshot!.files.filter((f) => f.role === role);

    expect(byRole("section")).toHaveLength(3);
    expect(byRole("section")[0].label).toBe("Hero");
    expect(byRole("page-viewport")).toHaveLength(2);
    expect(byRole("page-fullpage")).toHaveLength(2);
    expect(byRole("state")[0]).toMatchObject({ label: "Menu aberto", kind: "screenshot", target: "asset" });
    expect(byRole("video").map((f) => f.mimeType)).toEqual(["video/webm", "video/webm"]);

    // Composições e mockups são peças finais → Output; o resto é matéria-prima → Asset.
    expect(byRole("composition")).toHaveLength(3);
    expect(byRole("composition")[0]).toMatchObject({ target: "output", format: "png", width: 1080, height: 1080 });
    expect(byRole("mockup").every((f) => f.target === "output")).toBe(true);

    const desktopShot = "/generated/acme-studio/screenshots/desktop-1440x900.png";
    expect(byRole("thumbnail")[0].derivedFrom).toBe(desktopShot);
    expect(byRole("cover")[0]).toMatchObject({ derivedFrom: desktopShot, mimeType: "image/webp", label: "smart-crop" });

    expect(snapshot!.files.every((f) => f.publicPath === `/generated/acme-studio/${f.relativePath}`)).toBe(true);
    expect(snapshot!.files.some((f) => /^[a-zA-Z]:|^\/|\.\./.test(f.relativePath))).toBe(false);
    expect(snapshot!.unmapped).toMatchObject({
      inspection: { techStack: ["Next.js"] },
      extraPageInputs: ["/sobre"],
      stateInputs: [{ name: "Menu aberto", selector: ".menu-toggle" }],
      options: { showcase: true },
    });
  });

  it("capa og-image não tem linhagem interna", () => {
    const catalog = clone(v02);
    catalog.cover.source = "og-image";
    const { snapshot } = mapLegacyCatalog("acme-studio", catalog);
    expect(snapshot!.files.find((f) => f.role === "cover")?.derivedFrom).toBeNull();
  });

  it("catálogo parcial (sem campos opcionais) é aceito", () => {
    const partial = clone(v01) as Record<string, unknown>;
    delete (partial.project as Record<string, unknown>).client;
    delete (partial.project as Record<string, unknown>).description;
    const { snapshot, issues } = mapLegacyCatalog("example-com", partial);
    expect(issues).toEqual([]);
    expect(snapshot?.project.client).toBeUndefined();
    expect(snapshot?.unmapped).toEqual({});
  });

  it("formato inválido → erro CATALOG_SCHEMA, sem snapshot", () => {
    const { snapshot, issues } = mapLegacyCatalog("example-com", { version: "0.1.0" });
    expect(snapshot).toBeNull();
    expect(issues[0]).toMatchObject({ severity: "error", code: "CATALOG_SCHEMA", folder: "example-com" });
  });

  it("slug divergente → warning; a pasta vale", () => {
    const { snapshot, issues } = mapLegacyCatalog("outra-pasta", clone(v01));
    expect(codes(issues)).toContain("SLUG_MISMATCH");
    expect(snapshot?.project.slug).toBe("outra-pasta");
    // os caminhos apontam para /generated/example-com → fora da pasta "outra-pasta"
    expect(snapshot?.files).toEqual([]);
    expect(codes(issues).filter((c) => c === "PATH_OUTSIDE_PROJECT")).toHaveLength(6);
  });

  it.each([
    ["nome vazio", (c: typeof v01) => (c.project.name = "  ")],
    ["URL javascript:", (c: typeof v01) => (c.project.url = "javascript:alert(1)")],
    ["URL file:", (c: typeof v01) => (c.project.url = "file:///etc/passwd")],
  ])("projeto inválido (%s) → erro INVALID_PROJECT", (_label, mutate) => {
    const catalog = clone(v01);
    mutate(catalog);
    const { snapshot, issues } = mapLegacyCatalog("example-com", catalog);
    expect(snapshot).toBeNull();
    expect(codes(issues)).toContain("INVALID_PROJECT");
  });

  it.each([
    ["traversal", "/generated/example-com/../outro/catalog.png", "UNMAPPABLE_PATH"],
    ["traversal codificado", "/generated/example-com/%2e%2e/x.png", "UNMAPPABLE_PATH"],
    ["barra invertida", "/generated/example-com/..\\..\\x.png", "UNMAPPABLE_PATH"],
    ["maiúsculas", "/generated/example-com/screenshots/Desktop.png", "UNMAPPABLE_PATH"],
    ["extensão desconhecida", "/generated/example-com/screenshots/desktop.exe", "UNMAPPABLE_PATH"],
    ["outro projeto", "/generated/outro-projeto/screenshots/desktop.png", "PATH_OUTSIDE_PROJECT"],
  ])("caminho perigoso/estranho (%s) vira warning e é descartado", (_label, badPath, code) => {
    const catalog = clone(v01);
    catalog.captures.desktop.fullpage = badPath;
    const { snapshot, issues } = mapLegacyCatalog("example-com", catalog);
    expect(issues).toEqual([expect.objectContaining({ severity: "warning", code })]);
    expect(snapshot?.files.map((f) => f.publicPath)).not.toContain(badPath);
    expect(snapshot?.files).toHaveLength(5);
  });

  it("caminho repetido → warning DUPLICATE_PATH, mantém a primeira ocorrência", () => {
    const catalog = clone(v01);
    catalog.captures.mobile.fullpage = catalog.captures.desktop.fullpage;
    const { snapshot, issues } = mapLegacyCatalog("example-com", catalog);
    expect(codes(issues)).toEqual(["DUPLICATE_PATH"]);
    expect(snapshot?.files).toHaveLength(5);
  });
});

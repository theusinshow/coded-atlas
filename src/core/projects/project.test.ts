import { describe, expect, it } from "vitest";
import { isDomainError } from "../../shared/errors";
import { newId, ProjectIdSchema, UlidSchema } from "../../shared/id";
import { createProject, ProjectSchema, SlugSchema } from "./project";
import { createSource, SourceSchema } from "./source";

describe("ULID", () => {
  it("gera IDs válidos, únicos e ordenáveis", () => {
    const ids = Array.from({ length: 50 }, () => newId());
    expect(new Set(ids).size).toBe(50);
    expect(ids.every((id) => UlidSchema.safeParse(id).success)).toBe(true);
    expect([...ids].sort()).toEqual(ids); // monotônico mesmo no mesmo milissegundo
  });

  it.each(["", "abc", "01ARZ3NDEKTSV4RRFFQ69G5FA", "01ARZ3NDEKTSV4RRFFQ69G5FAVX", "01ARZ3NDEKTSV4RRFFQ69G5FAU", "../../etc"])(
    "rejeita %j",
    (value) => {
      expect(UlidSchema.safeParse(value).success).toBe(false);
    }
  );
});

describe("SlugSchema", () => {
  it.each(["zion-guincho", "mj-engenharia-flame", "a", "site2026"])("aceita %j", (slug) => {
    expect(SlugSchema.safeParse(slug).success).toBe(true);
  });

  it.each([
    "",
    "..",
    "../",
    "../etc",
    "a/b",
    "a\\b",
    "%2e%2e",
    "%2e%2e%2fetc",
    "C:\\Windows",
    "/etc/passwd",
    "Maiuscula",
    "-borda",
    "borda-",
    "duplo--hifen",
    "com espaço",
    "acentuação",
    "x".repeat(81),
  ])("rejeita %j", (slug) => {
    expect(SlugSchema.safeParse(slug).success).toBe(false);
  });
});

describe("Project", () => {
  it("createProject gera entidade válida com ID, status e timestamps", () => {
    const project = createProject({ slug: "zion-guincho", name: "Zion Guincho", category: "site" });
    expect(ProjectSchema.parse(project)).toEqual(project);
    expect(project.status).toBe("active");
    expect(project.client).toBeNull();
    expect(project.coverAssetId).toBeNull();
    expect(project.createdAt).toBe(project.updatedAt);
  });

  it("slug inválido vira DomainError VALIDATION", () => {
    try {
      createProject({ slug: "../hack", name: "X", category: "site" });
      expect.unreachable();
    } catch (err) {
      expect(isDomainError(err, "VALIDATION")).toBe(true);
    }
  });

  it("rejeita campos desconhecidos (strict)", () => {
    const project = createProject({ slug: "a", name: "A", category: "site" });
    expect(ProjectSchema.safeParse({ ...project, extra: 1 }).success).toBe(false);
  });

  it("rejeita nome vazio e timestamp não-ISO", () => {
    const project = createProject({ slug: "a", name: "A", category: "site" });
    expect(ProjectSchema.safeParse({ ...project, name: "  " }).success).toBe(false);
    expect(ProjectSchema.safeParse({ ...project, createdAt: "ontem" }).success).toBe(false);
  });
});

describe("Source", () => {
  const project = createProject({ slug: "a", name: "A", category: "site" });

  it("aceita URL http(s)", () => {
    const source = createSource({ projectId: project.id, type: "url", locator: "https://example.com" });
    expect(SourceSchema.parse(source)).toEqual(source);
  });

  it.each(["javascript:alert(1)", "file:///etc/passwd", "ftp://x.com", "não é url"])(
    "rejeita locator %j para tipo url",
    (locator) => {
      expect(() => createSource({ projectId: project.id, type: "url", locator })).toThrow();
    }
  );

  it("outros tipos não exigem URL", () => {
    expect(createSource({ projectId: project.id, type: "github", locator: "coded-by-m/site" }).type).toBe("github");
  });
});

describe("VisualProfile", () => {
  it("descarta fontes de sistema/emoji/genéricas e mantém as da marca", async () => {
    const { createVisualProfile, isBrandFont } = await import("../creative/visual-profile");
    expect(["Apple Color Emoji", "Segoe UI Symbol", "Segoe UI", "system-ui", "sans-serif", "Inter Fallback", "Helvetica Neue"].some(isBrandFont)).toBe(false);
    const profile = createVisualProfile({
      projectId: ProjectIdSchema.parse(newId()),
      revision: 1,
      palette: ["#FFF", "#0b2a36", "#0b2a36", "não é cor"],
      fonts: ['"geistMono"', "aktiv-grotesk", "Apple Color Emoji", "Montserrat Fallback", "Roboto"],
      techStack: ["Next.js", "Next.js"],
      source: "inspection",
    });
    expect(profile.palette).toEqual(["#ffffff", "#0b2a36"]);
    expect(profile.fonts).toEqual(["geistMono", "aktiv-grotesk", "Roboto"]);
    expect(profile.techStack).toEqual(["Next.js"]);
    expect(profile.traits).toContain("light");
  });
});

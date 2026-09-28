import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import v01 from "../modules/import/legacy/__fixtures__/catalog-v0.1.json";
import { openDatabase, type AtlasDatabase } from "../infrastructure/db/client";
import { createRepositories, type Repositories } from "../infrastructure/db/repositories";
import { GeneratedDirStore } from "../infrastructure/legacy/generated-dir-store";
import { SharpMediaProbe } from "../infrastructure/sharp/media-probe";
import { thumbCacheKeys, ThumbnailService } from "../infrastructure/sharp/thumbnails";
import { LocalAssetStorage } from "../infrastructure/storage/local-asset-storage";
import {
  createLegacyImportJobHandler,
  ensureLegacyImportQueued,
  type LegacyImportDeps,
} from "../modules/import/legacy/legacy-import-job";
import { importUploads } from "../modules/import/upload";
import { getProjectOverview } from "../modules/projects/overview";
import {
  addSource,
  changeProjectStatus,
  createNewProject,
  deleteProjectPermanently,
  deleteUploadedAsset,
  removeSource,
  setProjectCover,
  type ProjectServiceDeps,
} from "../modules/projects/project-service";
import { isDomainError, type DomainErrorCode } from "../shared/errors";
import { JobWorker } from "../workers/job-worker";

async function expectCode(promise: Promise<unknown>, code: DomainErrorCode): Promise<void> {
  try {
    await promise;
    expect.unreachable(`esperava ${code}`);
  } catch (err) {
    expect(isDomainError(err, code), String(err)).toBe(true);
  }
}

const png = (w: number, h: number, color = "#335577") =>
  sharp({ create: { width: w, height: h, channels: 3, background: color } }).png().toBuffer();

let dir: string;
let database: AtlasDatabase;
let repos: Repositories;
let storage: LocalAssetStorage;
let deps: ProjectServiceDeps;
const probe = new SharpMediaProbe();

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "atlas-2-2-"));
  database = openDatabase({ file: path.join(dir, "atlas.db") });
  repos = createRepositories(database.db);
  storage = await LocalAssetStorage.open(path.join(dir, "storage"));
  deps = { ...repos, storage, derivedCacheKeys: thumbCacheKeys };
});
afterEach(() => {
  database.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("projetos", () => {
  it("slug derivado do nome ganha sufixo; slug explícito em uso → CONFLICT", async () => {
    const a = await createNewProject(deps, { name: "Estúdio Lentz", category: "Site" });
    const b = await createNewProject(deps, { name: "Estúdio Lentz", category: "Site" });
    expect([a.project.slug, b.project.slug]).toEqual(["estudio-lentz", "estudio-lentz-2"]);
    await expectCode(createNewProject(deps, { name: "Outro", category: "Site", slug: "estudio-lentz" }), "CONFLICT");
  });

  it("com URL e captureNow cria source e job de captura", async () => {
    const { project, source, job } = await createNewProject(deps, {
      name: "Zion",
      category: "Site",
      url: "https://zion.example",
      captureNow: true,
    });
    expect(source).toMatchObject({ type: "url", locator: "https://zion.example" });
    expect(job).toMatchObject({ type: "capture", projectId: project.id, payload: { sourceId: source!.id } });
  });

  it("busca ignora acento e caixa, combina termos e trata % e _ como texto", async () => {
    await createNewProject(deps, { name: "Construtora Ávila", category: "Institucional", client: "Grupo Norte" });
    await createNewProject(deps, { name: "Loja 100%", category: "E-commerce" });
    await createNewProject(deps, { name: "Loja Cem", category: "E-commerce" });
    const names = async (text: string) => (await repos.projects.search({ text })).map((p) => p.name).sort();
    expect(await names("avila")).toEqual(["Construtora Ávila"]);
    expect(await names("NORTE constru")).toEqual(["Construtora Ávila"]);
    expect(await names("100%")).toEqual(["Loja 100%"]);
    expect(await names("_")).toEqual([]);
    expect(await repos.projects.categories()).toEqual(["E-commerce", "Institucional"]);
  });

  it("arquivar tira da lista padrão; restaurar devolve; repetir é transição inválida", async () => {
    const { project } = await createNewProject(deps, { name: "Arquivável", category: "Site" });
    await changeProjectStatus(deps, project.id, "archived");
    expect(await repos.projects.search()).toEqual([]);
    expect(await repos.projects.search({ status: "archived" })).toHaveLength(1);
    await expectCode(changeProjectStatus(deps, project.id, "archived"), "INVALID_TRANSITION");
    await changeProjectStatus(deps, project.id, "active");
    expect(await repos.projects.search()).toHaveLength(1);
  });

  it("sources: GitHub normalizado, dev local por URL, duplicata recusada, remoção", async () => {
    const { project } = await createNewProject(deps, { name: "Fontes", category: "Site" });
    const gh = await addSource(deps, project.id, { type: "github", locator: "https://github.com/coded-by-m/site.git" });
    expect(gh.locator).toBe("coded-by-m/site");
    await expectCode(addSource(deps, project.id, { type: "github", locator: "coded-by-m/site" }), "CONFLICT");
    await expectCode(addSource(deps, project.id, { type: "github", locator: "não é repo" }), "VALIDATION");
    const local = await addSource(deps, project.id, { type: "local", locator: "http://localhost:3000", label: "dev" });
    await expectCode(addSource(deps, project.id, { type: "local", locator: "C:\\projetos\\site" }), "VALIDATION");
    await removeSource(deps, project.id, local.id);
    expect((await repos.sources.listByProject(project.id)).map((s) => s.type)).toEqual(["github"]);
  });

  it("exclusão: exige slug digitado, recusa com job ativo, apaga bytes órfãos e preserva compartilhados", async () => {
    const shared = await png(300, 200, "#111111");
    const own = await png(300, 200, "#999999");
    const a = (await createNewProject(deps, { name: "A", category: "Site" })).project;
    const b = (await createNewProject(deps, { name: "B", category: "Site" })).project;
    const upA = await importUploads({ ...deps, probe }, a.id, [{ name: "s.png", bytes: shared }, { name: "o.png", bytes: own }], "screenshot");
    await importUploads({ ...deps, probe }, b.id, [{ name: "s.png", bytes: shared }], "screenshot");
    const thumbs = new ThumbnailService(storage);
    await thumbs.get(upA.created[1], 320); // miniatura em cache também deve sumir

    await expectCode(deleteProjectPermanently(deps, a.id, "errado"), "VALIDATION");
    const job = await createNewProject(deps, { name: "C", category: "Site", url: "https://c.example", captureNow: true });
    await expectCode(deleteProjectPermanently(deps, job.project.id, job.project.slug), "CONFLICT");

    const { bytesRemoved } = await deleteProjectPermanently(deps, a.id, a.slug);
    expect(bytesRemoved).toBe(1);
    expect(await storage.exists(upA.created[1].storageKey)).toBe(false); // exclusivo de A
    expect(await storage.exists(upA.created[0].storageKey)).toBe(true); // também usado por B
    expect(await storage.exists(thumbCacheKeys(upA.created[1].storageKey, upA.created[1].sha256)[0])).toBe(false);
    expect(await repos.projects.getById(a.id)).toBeNull();
  });
});

describe("upload manual", () => {
  it("aceita pelo conteúdo, deduplica, recusa formato errado e não mistura vídeo com imagem", async () => {
    const { project } = await createNewProject(deps, { name: "Uploads", category: "Site" });
    const image = await png(800, 600);
    const first = await importUploads({ ...deps, probe }, project.id, [
      { name: "hero.png", bytes: image },
      { name: "hero-copia.png", bytes: image },
      { name: "texto.png", bytes: new TextEncoder().encode("não sou imagem") },
      { name: "clip.webm", bytes: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]) },
    ], "screenshot");
    expect(first.created).toHaveLength(1);
    expect(first.created[0]).toMatchObject({ width: 800, height: 600, mimeType: "image/png", label: "hero", metadata: { origin: "upload" } });
    expect(first.rejected.map((r) => r.name)).toEqual(["texto.png", "clip.webm"]);

    const again = await importUploads({ ...deps, probe }, project.id, [{ name: "x.png", bytes: image }], "screenshot");
    expect(again.created).toHaveLength(0);
    expect(again.duplicates[0].id).toBe(first.created[0].id);
    expect((await repos.sources.listByProject(project.id)).map((s) => s.type)).toEqual(["upload"]);

    const overview = await getProjectOverview(deps, project.slug);
    expect(overview).toMatchObject({ totalAssets: 1, readiness: { uploads: 1 } });
  });
});

describe("assets: capa, remoção e biblioteca global", () => {
  it("capa só aceita imagem do próprio projeto; remover upload apaga bytes e limpa a capa", async () => {
    const a = (await createNewProject(deps, { name: "Capa A", category: "Site" })).project;
    const b = (await createNewProject(deps, { name: "Capa B", category: "Site" })).project;
    const [imgA] = (await importUploads({ ...deps, probe }, a.id, [{ name: "hero-a.png", bytes: await png(500, 300, "#aa3300") }], "image")).created;
    const [imgB] = (await importUploads({ ...deps, probe }, b.id, [{ name: "hero-b.png", bytes: await png(500, 300, "#0033aa") }], "image")).created;

    expect((await setProjectCover(deps, a.id, imgA.id)).coverAssetId).toBe(imgA.id);
    await expectCode(setProjectCover(deps, a.id, imgB.id), "NOT_FOUND"); // de outro projeto

    await deleteUploadedAsset(deps, a.id, imgA.id);
    expect(await repos.assets.getById(imgA.id)).toBeNull();
    expect(await storage.exists(imgA.storageKey)).toBe(false);
    expect((await repos.projects.getById(a.id))?.coverAssetId).toBeNull();
  });

  it("busca global por texto, tipo e projeto, com paginação", async () => {
    const p = (await createNewProject(deps, { name: "Busca", category: "Site" })).project;
    await importUploads({ ...deps, probe }, p.id, [
      { name: "Hero Principal.png", bytes: await png(100, 100, "#010101") },
      { name: "contato.png", bytes: await png(100, 100, "#020202") },
    ], "image");
    await importUploads({ ...deps, probe }, p.id, [{ name: "logo.png", bytes: await png(100, 100, "#030303") }], "logo");
    expect((await repos.assets.search({ text: "hero" })).items.map((a) => a.label)).toEqual(["Hero Principal"]);
    expect((await repos.assets.search({ kinds: ["logo"] })).total).toBe(1);
    const page1 = await repos.assets.search({ projectId: p.id, limit: 2 });
    const page2 = await repos.assets.search({ projectId: p.id, limit: 2, offset: 2 });
    expect([page1.total, page1.items.length, page2.items.length]).toEqual([3, 2, 1]);
  });
});

describe("importação da biblioteca v1", () => {
  let generated: string;
  let importDeps: LegacyImportDeps;

  async function writeLegacy(slug: string, createdAt = "2026-06-19T02:21:45.344Z"): Promise<void> {
    const json = JSON.stringify(v01).split("/generated/example-com/").join(`/generated/${slug}/`);
    const catalog = {
      ...JSON.parse(json),
      createdAt,
      project: { ...v01.project, slug, name: `Legado ${slug}` },
      inspection: { colors: ["#0B2A36", "#fbfcfd", "#e63946"], fonts: ["Inter", "Inter Fallback"], techStack: ["Next.js"] },
    };
    const root = path.join(generated, slug);
    mkdirSync(path.join(root, "screenshots"), { recursive: true });
    mkdirSync(path.join(root, "thumbnails"), { recursive: true });
    writeFileSync(path.join(root, "catalog.json"), JSON.stringify(catalog));
    writeFileSync(path.join(root, "screenshots", "desktop-1440x900.png"), await png(1440, 900, createdAt.endsWith("Z") ? "#223344" : "#000"));
    writeFileSync(path.join(root, "screenshots", "desktop-fullpage.png"), await png(1440, 3000));
    writeFileSync(path.join(root, "screenshots", "mobile-390x844.png"), await png(390, 844));
    // mobile-fullpage ausente de propósito
    writeFileSync(path.join(root, "thumbnails", "thumb-main.webp"), await sharp(await png(640, 400)).webp().toBuffer());
    writeFileSync(path.join(root, "thumbnails", "thumb-mobile.webp"), await sharp(await png(320, 640)).webp().toBuffer());
  }

  async function runImport() {
    const job = await ensureLegacyImportQueued(importDeps);
    if (!job) return null;
    return new JobWorker({ jobs: repos.jobs, handlers: { import: createLegacyImportJobHandler(importDeps) } }).runOnce();
  }

  beforeEach(async () => {
    generated = path.join(dir, "generated");
    mkdirSync(generated);
    importDeps = { ...repos, ledger: repos.legacyImports, store: await GeneratedDirStore.open(generated), storage, probe };
  });

  it("importa projeto, source, capture, assets com linhagem e capa — sem tocar nos arquivos v1", async () => {
    await writeLegacy("site-antigo");
    const done = await runImport();
    expect(done).toMatchObject({ status: "completed", result: { created: 1, filesImported: 5, filesMissing: 1, failed: 0 } });

    const project = await repos.projects.getBySlug("site-antigo");
    expect(project).toMatchObject({ origin: "legacy", name: "Legado site-antigo", description: "Página de teste para verificação do Fase 6." });
    const assets = await repos.assets.listByProject(project!.id);
    expect(assets.map((a) => a.metadata.role).sort()).toEqual(["fullpage", "thumbnail", "thumbnail", "viewport", "viewport"]);
    const desktop = assets.find((a) => a.metadata.role === "viewport" && a.metadata.device === "desktop")!;
    expect(desktop).toMatchObject({ width: 1440, height: 900, metadata: { origin: "legacy", legacyPath: "/generated/site-antigo/screenshots/desktop-1440x900.png" } });
    expect(assets.find((a) => a.metadata.role === "thumbnail" && a.metadata.device === "desktop")?.parentAssetId).toBe(desktop.id);
    expect(project!.coverAssetId).toBe(desktop.id);
    expect((await repos.captures.listByProject(project!.id))[0]).toMatchObject({ status: "completed" });
    expect(await repos.legacyImports.get("site-antigo")).toMatchObject({ status: "imported", projectId: project!.id });
    // a inspeção do v1 vira VisualProfile (hex normalizado, fontes de fallback fora, traços derivados)
    expect(await repos.visualProfiles.latest(project!.id)).toMatchObject({
      revision: 1,
      source: "legacy",
      palette: ["#0b2a36", "#fbfcfd", "#e63946"],
      fonts: ["Inter"],
      techStack: ["Next.js"],
      traits: expect.arrayContaining(["dark", "colorful", "high-contrast"]),
    });

    // idempotente: nada a fazer na segunda vez
    expect(await ensureLegacyImportQueued(importDeps)).toBeNull();
  });

  it("recaptura no v1 depois da importação vira uma nova captura no mesmo projeto", async () => {
    await writeLegacy("site-vivo");
    await runImport();
    await writeLegacy("site-vivo", "2026-07-01T00:00:00.000+00:00");
    const done = await runImport();
    expect(done).toMatchObject({ result: { refreshed: 1, created: 0 } });
    const project = await repos.projects.getBySlug("site-vivo");
    expect(await repos.captures.listByProject(project!.id)).toHaveLength(2);
  });

  it("projeto importado e depois excluído fica dispensado — não volta", async () => {
    await writeLegacy("descartavel");
    await runImport();
    const project = (await repos.projects.getBySlug("descartavel"))!;
    await deleteProjectPermanently(deps, project.id, project.slug);
    expect(await repos.legacyImports.get("descartavel")).toMatchObject({ status: "dismissed" });
    expect(await ensureLegacyImportQueued(importDeps)).toBeNull();
    expect(await repos.projects.getBySlug("descartavel")).toBeNull();
  });

  it("slug já usado por projeto 2.x → falha registrada, sem derrubar os outros", async () => {
    await createNewProject(deps, { name: "Conflito", category: "Site", slug: "conflito" });
    await writeLegacy("conflito");
    await writeLegacy("tranquilo");
    const done = await runImport();
    expect(done).toMatchObject({ status: "completed", result: { created: 1, failed: 1 } });
    expect(await repos.legacyImports.get("conflito")).toMatchObject({ status: "failed" });
    expect(await repos.projects.getBySlug("tranquilo")).not.toBeNull();
    // não fica retentando a cada inicialização; só sob pedido explícito
    expect(await ensureLegacyImportQueued(importDeps)).toBeNull();
    expect(await ensureLegacyImportQueued(importDeps, ["conflito"])).not.toBeNull();
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Asset } from "../core/assets/asset";
import { createDirection } from "../core/creative/direction";
import { createVisualProfile } from "../core/creative/visual-profile";
import { PresentationContentSchema, type PresentationContent } from "../core/documents/creative-document";
import { addPage, duplicatePage } from "../core/documents/pages";
import { buildPresentation, PRESENTATION_STEPS } from "../core/presentation/storyboard";
import { openDatabase, type AtlasDatabase } from "../infrastructure/db/client";
import { createRepositories, type Repositories } from "../infrastructure/db/repositories";
import { PdfPptxExporter } from "../infrastructure/export/pdf-pptx-exporter";
import { PlaywrightStaticRenderer } from "../infrastructure/render/playwright-static-renderer";
import { SharpMediaProbe } from "../infrastructure/sharp/media-probe";
import { LocalAssetStorage } from "../infrastructure/storage/local-asset-storage";
import { createPresentation, enqueueDocumentRender, saveCanvas } from "../modules/create/document-service";
import { importUploads } from "../modules/import/upload";
import { createNewProject } from "../modules/projects/project-service";
import { createRenderJobHandler } from "../modules/render/render-job";
import { newId } from "../shared/id";
import { JobWorker } from "../workers/job-worker";
import { createStudioStore } from "../../components/studio/store";

let dir: string;
let database: AtlasDatabase;
let repos: Repositories;
let storage: LocalAssetStorage;

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "atlas-pres-"));
  database = openDatabase({ file: path.join(dir, "atlas.db") });
  repos = createRepositories(database.db);
  storage = await LocalAssetStorage.open(path.join(dir, "storage"));
});
afterEach(() => {
  database.close();
  rmSync(dir, { recursive: true, force: true });
});

const png = (w: number, h: number, c: string) => sharp({ create: { width: w, height: h, channels: 3, background: c } }).png().toBuffer();

async function setup(full: boolean) {
  const { project } = await createNewProject({ ...repos, storage }, { name: "Estúdio Norte", category: "Site Institucional", client: "Norte Engenharia", description: "Site para aprovar projetos de engenharia mais rápido.", url: "https://norte.example" });
  const deps = { ...repos, storage, probe: new SharpMediaProbe() };
  const tag = async (bytes: Buffer, metadata: Asset["metadata"], kind: Asset["kind"] = "screenshot") => {
    const up = (await importUploads(deps, project.id, [{ name: "x.png", bytes }], "screenshot")).created[0];
    await repos.assets.create({ ...up, kind, id: newId() as Asset["id"], metadata: { ...up.metadata, ...metadata } });
    await repos.assets.delete(up.id);
  };
  await tag(await png(1440, 900, "#1d3557"), { role: "viewport", device: "desktop" });
  if (full) {
    await tag(await png(390, 844, "#e63946"), { role: "viewport", device: "mobile" });
    for (let i = 1; i <= 3; i++) await tag(await png(1440, 900, `#${i}${i}5577`), { role: "section", device: "desktop", sectionIndex: i, sectionName: `Seção ${i}` }, "section");
    await repos.visualProfiles.create(createVisualProfile({ projectId: project.id, revision: 1, palette: ["#0f1014", "#e63946", "#f1faee"], fonts: [], techStack: [], source: "manual" }));
  }
  return project;
}

describe("storyboard de apresentação", () => {
  it("material completo: 8 slides na ordem clássica com notas; contexto usa a descrição do projeto", async () => {
    const project = await setup(true);
    const assets = await repos.assets.listByProject(project.id);
    const profile = await repos.visualProfiles.latest(project.id);
    const { content, skipped } = buildPresentation({ project, assets, url: "https://norte.example", profile, formatId: "landscape-16x9", style: { mode: "hybrid", profileRevision: 1 } });
    expect(skipped).toEqual([]);
    expect(content.slides.map((s) => s.title)).toEqual(PRESENTATION_STEPS.map((s) => s.title));
    expect(content.slides.every((s) => s.artboard.width === 1920 && s.artboard.height === 1080 && s.notes.length > 20)).toBe(true);
    expect(JSON.stringify(content.slides[1].artboard)).toContain("Site para aprovar projetos de engenharia mais rápido.");
    expect(content.slides[0].notes).toContain("Norte Engenharia");
    expect(content.slides.at(-1)!.notes).toContain("norte.example");
  });

  it("pouco material: pula responsivo/detalhes/destaque/identidade e diz por quê", async () => {
    const project = await setup(false);
    const assets = await repos.assets.listByProject(project.id);
    const { content, skipped } = buildPresentation({ project, assets, url: null, profile: null, formatId: "landscape-16x9", style: { mode: "atlas", profileRevision: null } });
    expect(content.slides.map((s) => s.title)).toEqual(["Capa", "Contexto", "O site", "Encerramento"]);
    expect(skipped).toEqual(["Responsivo: sem material", "Detalhes: sem material", "Destaque: sem material", "Identidade visual: sem material"]);
  });

  it("schema e operações de slide; notas no store do Studio", () => {
    const board = { width: 1920, height: 1080, background: { fill: "background" as const, pattern: "none" as const }, layers: [] };
    const content = PresentationContentSchema.parse({ slides: [{ id: "a", notes: "oi", artboard: board }], style: { mode: "atlas", profileRevision: null }, formatId: "landscape-16x9" });
    expect(addPage(content, { id: "b", notes: "", artboard: board }).slides.map((s) => s.id)).toEqual(["a", "b"]);
    expect(duplicatePage(content, 0, () => "c").slides[1]).toMatchObject({ id: "c", notes: "oi" });
    expect(PresentationContentSchema.safeParse({ ...content, slides: [...content.slides, { id: "x", notes: "", artboard: { ...board, width: 1080 } }] }).success).toBe(false);
    const store = createStudioStore({ doc: content, revision: 1 });
    expect(store.getState().content.artboard.width).toBe(1920);
  });
});

describe("exportação real PDF/PPTX", () => {
  it("apresentação com direção salva → PDF (uma página por slide) + PPTX (com notas) + PNGs", async () => {
    const project = await setup(true);
    const direction = await repos.directions.create(createDirection({ projectId: project.id, name: "Case", tone: "Sóbrio", emphasis: "Engenharia", styleMode: "atlas", accent: "#ff5500", notes: "", planId: null }));
    const { document, skipped } = await createPresentation({ ...repos, sources: repos.sources, directions: repos.directions }, project.id, { directionId: direction.id });
    expect(document.kind).toBe("presentation");
    expect(skipped).toEqual([]);
    const content = (await repos.documents.getRevision(document.id, 1))!.content as PresentationContent;
    expect(content.style).toMatchObject({ mode: "atlas", primary: "#ff5500" });
    // Encurta para o teste e edita uma nota.
    const short: PresentationContent = { ...content, slides: content.slides.slice(0, 3).map((s, i) => (i === 1 ? { ...s, notes: "Nota editada pelo Matheus." } : s)) };
    await saveCanvas(repos, document.id, 1, short);

    const worker = new JobWorker({ jobs: repos.jobs, handlers: { render: createRenderJobHandler({ ...repos, storage, renderer: new PlaywrightStaticRenderer(), exporter: new PdfPptxExporter() }) } });
    const job = await enqueueDocumentRender(repos, document.id, 2, ["pdf", "pptx", "png"]);
    expect(await worker.runOnce()).toMatchObject({ id: job.id, status: "completed", result: { count: 5 } });
    const outputs = await repos.outputs.listByProject(project.id);
    const pdf = outputs.find((o) => o.format === "pdf")!;
    const pptx = outputs.find((o) => o.format === "pptx")!;
    expect(outputs.filter((o) => o.format === "png")).toHaveLength(3);
    expect(pdf).toMatchObject({ mimeType: "application/pdf", width: 1920, height: 1080, metadata: { documentId: document.id, documentRevision: 2 } });

    const parsed = await PDFDocument.load(await storage.get(pdf.storageKey));
    expect(parsed.getPageCount()).toBe(3);
    expect(parsed.getTitle()).toBe("Apresentação · Estúdio Norte");
    expect(parsed.getAuthor()).toBe("Coded by M");
    const [w, h] = [parsed.getPage(0).getWidth(), parsed.getPage(0).getHeight()];
    expect([w, h]).toEqual([1440, 810]);

    const zip = Buffer.from(await storage.get(pptx.storageKey));
    expect(pptx.mimeType).toBe("application/vnd.openxmlformats-officedocument.presentationml.presentation");
    expect(zip.subarray(0, 2).toString()).toBe("PK");
    expect(zip.includes(Buffer.from("ppt/slides/slide3.xml")) && !zip.includes(Buffer.from("ppt/slides/slide4.xml"))).toBe(true);
    expect(zip.includes(Buffer.from("ppt/notesSlides/"))).toBe(true);
  }, 120_000);
});

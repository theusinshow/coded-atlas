import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deterministicPlan } from "../core/brain/plan";
import { buildShortlist } from "../core/brain/context";
import { COMPOSITIONS } from "../core/creative/compositions";
import { createVisualProfile } from "../core/creative/visual-profile";
import { CarouselContentSchema, isCarousel, type CarouselContent } from "../core/documents/creative-document";
import { addPage, blankArtboard, duplicatePage, movePage, removePage, renamePage } from "../core/documents/pages";
import { safeFileName } from "../core/assets/file-names";
import { openDatabase, type AtlasDatabase } from "../infrastructure/db/client";
import { createRepositories, type Repositories } from "../infrastructure/db/repositories";
import { PlaywrightStaticRenderer } from "../infrastructure/render/playwright-static-renderer";
import { SharpMediaProbe } from "../infrastructure/sharp/media-probe";
import { LocalAssetStorage } from "../infrastructure/storage/local-asset-storage";
import { buildZip } from "../infrastructure/zip/zip-builder";
import { generatePlan } from "../modules/brain/plan-service";
import { createBlankCanvas, createBlankCarousel, enqueueDocumentRender, materializePlanAsCarousel, saveCanvas } from "../modules/create/document-service";
import { importUploads } from "../modules/import/upload";
import { createNewProject } from "../modules/projects/project-service";
import { createRenderJobHandler } from "../modules/render/render-job";
import { isDomainError } from "../shared/errors";
import { newId } from "../shared/id";
import { JobWorker } from "../workers/job-worker";
import { createStudioStore } from "../../components/studio/store";

let dir: string;
let database: AtlasDatabase;
let repos: Repositories;
let storage: LocalAssetStorage;

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "atlas-carousel-"));
  database = openDatabase({ file: path.join(dir, "atlas.db") });
  repos = createRepositories(database.db);
  storage = await LocalAssetStorage.open(path.join(dir, "storage"));
});
afterEach(() => {
  database.close();
  rmSync(dir, { recursive: true, force: true });
});

async function setup() {
  const { project } = await createNewProject({ ...repos, storage }, { name: "Estúdio Norte", category: "Site", url: "https://norte.example" });
  const png = await sharp({ create: { width: 1440, height: 900, channels: 3, background: "#1d3557" } }).png().toBuffer();
  await importUploads({ ...repos, storage, probe: new SharpMediaProbe() }, project.id, [{ name: "home.png", bytes: png }], "screenshot");
  await repos.visualProfiles.create(createVisualProfile({ projectId: project.id, revision: 1, palette: ["#fbfcfd", "#1d3557", "#e63946"], fonts: ["Inter"], techStack: [], source: "manual" }));
  return project;
}

const board = { width: 1080, height: 1350, background: { fill: "background" as const, pattern: "none" as const }, layers: [] };
const text = (id: string) => ({ id, type: "text" as const, x: 10, y: 10, width: 500, height: 80, rotation: 0, opacity: 1, visible: true, locked: false, radius: 0, shadow: "none" as const, blur: 0, text: id, font: "display" as const, size: 60, weight: 700 as const, color: "text" as const, align: "left" as const, lineHeight: 1.1, letterSpacing: 0, uppercase: false });
const carousel = (n: number): CarouselContent =>
  CarouselContentSchema.parse({ pages: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, artboard: { ...board, layers: [text(`t${i}`)] } })), style: { mode: "hybrid", profileRevision: null }, formatId: "post-4x5" });

describe("páginas do carrossel (puro)", () => {
  it("adiciona, duplica com ids novos, move, renomeia e remove (nunca fica vazio)", () => {
    let n = 0;
    const id = () => `n${++n}`;
    const c = carousel(3);
    expect(addPage(c, { id: "x", artboard: blankArtboard(board) }, 0).pages.map((p) => p.id)).toEqual(["p0", "x", "p1", "p2"]);
    const dup = duplicatePage(c, 1, id);
    expect(dup.pages.map((p) => p.id)).toEqual(["p0", "p1", "n1", "p2"]);
    expect(dup.pages[2].artboard.layers[0].id).toBe("n2");
    expect(movePage(c, 0, 2).pages.map((p) => p.id)).toEqual(["p1", "p2", "p0"]);
    expect(renamePage(c, 1, "  Mobile  ").pages[1].title).toBe("Mobile");
    expect(removePage(removePage(removePage(c, 0), 0), 0).pages).toHaveLength(1);
  });

  it("schema recusa páginas de tamanhos diferentes e ids repetidos", () => {
    const base = carousel(2);
    expect(CarouselContentSchema.safeParse({ ...base, pages: [base.pages[0], { ...base.pages[1], artboard: { ...board, width: 1080, height: 1080 } }] }).success).toBe(false);
    expect(CarouselContentSchema.safeParse({ ...base, pages: [base.pages[0], { ...base.pages[1], id: "p0" }] }).success).toBe(false);
  });

  it("nomes de arquivo seguros para ZIP/download", () => {
    expect(safeFileName("Carrossel · 01/05 Abertura ../../x", "png", "id")).toBe("carrossel-01-05-abertura-x.png");
    expect(safeFileName(null, "jpg", "01ABC")).toBe("01ABC.jpg");
  });
});

describe("store do Studio: vista da página ativa", () => {
  it("edita só a página ativa, preserva o estilo comum e desfaz trocando de página", () => {
    const store = createStudioStore({ doc: carousel(3), revision: 1 });
    store.getState().setActivePage(1);
    expect(store.getState().content.artboard.layers[0].id).toBe("t1");
    store.getState().apply((c) => ({ ...c, artboard: { ...c.artboard, layers: [] }, style: { ...c.style, mode: "atlas" } }));
    const doc = store.getState().doc as CarouselContent;
    expect(doc.pages.map((p) => p.artboard.layers.length)).toEqual([1, 0, 1]);
    expect(doc.style.mode).toBe("atlas");
    store.getState().setActivePage(2);
    store.getState().undo();
    expect(store.getState().activePage).toBe(1);
    expect((store.getState().doc as CarouselContent).pages[1].artboard.layers).toHaveLength(1);
    store.getState().applyDoc((d) => (isCarousel(d) ? removePage(d, 2) : d), 5);
    expect(store.getState().activePage).toBe(1);
    expect(store.getState().saveState).toBe("dirty");
  });
});

describe("carrossel com banco e render", () => {
  it("carrossel em branco, plano de carrossel termina no fechamento e vira documento de páginas", async () => {
    const project = await setup();
    const blank = await createBlankCarousel(repos, project.id, { formatId: "story-9x16", pages: 4 });
    expect(blank.document).toMatchObject({ kind: "carousel", name: "Carrossel Story 9:16" });
    const stored = (await repos.documents.getRevision(blank.document.id, 1))!.content as CarouselContent;
    expect(stored.pages).toHaveLength(4);
    expect(stored.pages[0].artboard).toMatchObject({ width: 1080, height: 1920 });

    const assets = await repos.assets.listByProject(project.id);
    const plan = deterministicPlan({ request: { goal: "carousel", notes: "", formats: [] }, compositions: COMPOSITIONS, bindingContext: { project, assets, url: null }, shortlist: buildShortlist(assets), hasPalette: true, category: "Site" });
    expect(plan.items[0].compositionId).toBe("project-reveal");
    expect(plan.items.at(-1)!.compositionId).toBe("project-closing");

    const saved = await generatePlan({ ...repos, brain: { gateway: null, pricing: null, budget: { monthlyLimitUsd: null, mode: "warn" }, imageCount: 0 } }, project.id, { request: { goal: "carousel", notes: "", formats: [] }, parentId: null }, new AbortController().signal);
    const { document } = await materializePlanAsCarousel({ ...repos, plans: repos.plans }, saved.id);
    const content = (await repos.documents.getRevision(document.id, 1))!.content as CarouselContent;
    expect(content.pages.map((p) => p.title)).toEqual(saved.items.map((i) => COMPOSITIONS.find((c) => c.id === i.compositionId)!.name));
    expect(content.pages.every((p) => p.artboard.width === 1080 && p.artboard.height === 1350)).toBe(true);

    // Canvas não aceita conteúdo de carrossel (e vice-versa).
    const canvas = await createBlankCanvas(repos, project.id, { formatId: "post-4x5" });
    await expect(saveCanvas(repos, canvas.document.id, 1, content)).rejects.toSatisfy((e: unknown) => isDomainError(e, "VALIDATION"));
  });

  it("render de carrossel: uma peça por página, na ordem, com página no metadata e ZIP", async () => {
    const project = await setup();
    const { document } = await createBlankCarousel(repos, project.id, { formatId: "post-1x1", pages: 3 });
    const content = (await repos.documents.getRevision(document.id, 1))!.content as CarouselContent;
    const titled = { ...content, pages: content.pages.map((p, i) => ({ ...p, title: `Página ${i + 1}`, artboard: { ...p.artboard, layers: [{ ...text(`t${i}`), id: newId() }] } })) };
    await saveCanvas(repos, document.id, 1, titled);
    const job = await enqueueDocumentRender(repos, document.id, 2, ["png"]);
    const worker = new JobWorker({ jobs: repos.jobs, handlers: { render: createRenderJobHandler({ ...repos, storage, renderer: new PlaywrightStaticRenderer() }) } });
    expect(await worker.runOnce()).toMatchObject({ id: job.id, status: "completed", result: { count: 3 } });
    const outputs = (await repos.outputs.listByProject(project.id)).sort((a, b) => (a.metadata.page ?? 0) - (b.metadata.page ?? 0));
    expect(outputs.map((o) => o.metadata.page)).toEqual([0, 1, 2]);
    expect(outputs.map((o) => o.label)).toEqual(["Carrossel Post 1:1 · 01/03 Página 1 · rev 2", "Carrossel Post 1:1 · 02/03 Página 2 · rev 2", "Carrossel Post 1:1 · 03/03 Página 3 · rev 2"]);

    const zip = Buffer.from(await buildZip(await Promise.all(outputs.map(async (o, i) => ({ name: `${i + 1}.png`, bytes: await storage.get(o.storageKey) })))));
    expect(zip.subarray(0, 4).toString("hex")).toBe("504b0304");
    expect(zip.includes(Buffer.from("1.png")) && zip.includes(Buffer.from("3.png"))).toBe(true);
  }, 60_000);
});

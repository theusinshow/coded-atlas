import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ATLAS_TOKENS } from "../core/creative/tokens";
import { createVisualProfile } from "../core/creative/visual-profile";
import { MotionContentSchema, autoAnimate, motionFromArtboards, sceneAt, sceneFrame, totalDurationMs, trackDelta, websiteScrollScene, type MotionContent, type Scene } from "../core/motion/motion";
import { MOTION_PRESET_IDS, MOTION_PRESETS, ease, evaluatePreset } from "../core/motion/presets";
import { duplicatePage } from "../core/documents/pages";
import { LayerSchema, type Layer } from "../core/documents/layer";
import { openDatabase, type AtlasDatabase } from "../infrastructure/db/client";
import { createRepositories, type Repositories } from "../infrastructure/db/repositories";
import { SharpMediaProbe } from "../infrastructure/sharp/media-probe";
import { LocalAssetStorage } from "../infrastructure/storage/local-asset-storage";
import { animateDocument, createBlankCarousel, createWebsiteScroll, saveCanvas } from "../modules/create/document-service";
import { importUploads } from "../modules/import/upload";
import { createNewProject } from "../modules/projects/project-service";
import { isDomainError } from "../shared/errors";
import { MotionFrameView } from "../render/motion-view";
import { createStudioStore } from "../../components/studio/store";


let dir: string;
let database: AtlasDatabase;
let repos: Repositories;
let storage: LocalAssetStorage;

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "atlas-motion-"));
  database = openDatabase({ file: path.join(dir, "atlas.db") });
  repos = createRepositories(database.db);
  storage = await LocalAssetStorage.open(path.join(dir, "storage"));
});
afterEach(() => {
  database.close();
  rmSync(dir, { recursive: true, force: true });
});

const base = { rotation: 0, opacity: 1, visible: true, locked: false, radius: 0, shadow: "none" as const, blur: 0 };
const layers: Layer[] = [
  LayerSchema.parse({ ...base, id: "bg", type: "shape", x: 0, y: 0, width: 1080, height: 1080, fill: "surface" }),
  LayerSchema.parse({ ...base, id: "title", type: "text", x: 80, y: 80, width: 900, height: 120, text: "Título", size: 80 }),
  LayerSchema.parse({ ...base, id: "win", type: "browser", x: 90, y: 300, width: 900, height: 600, assetId: "01M3K0H1GXRCVV5MRNY75J0T4V" }),
  LayerSchema.parse({ ...base, id: "phone", type: "device", x: 800, y: 500, width: 220, height: 460, assetId: null }),
];
const artboard = { width: 1080, height: 1080, background: { fill: "background" as const, pattern: "none" as const }, layers };

describe("presets de movimento", () => {
  it("todo preset de entrada termina na posição final e curvas vão de 0 a 1", () => {
    for (const e of ["linear", "ease-out", "ease-in-out", "spring"] as const) {
      expect(ease(e, 0)).toBeCloseTo(0, 5);
      expect(ease(e, 1)).toBe(1);
    }
    for (const id of MOTION_PRESET_IDS.filter((p) => MOTION_PRESETS[p].kind === "enter")) {
      const end = evaluatePreset(id, 1, 1, 1080);
      expect([end.dx, end.dy, end.rotation, end.blur]).toEqual([0, 0, 0, 0]);
      expect(end.opacity).toBe(1);
    }
    expect(evaluatePreset("fade-up", 0, 1, 1080).opacity).toBe(0);
    expect(evaluatePreset("website-scroll", 0.5, 1, 1080).focusY).toBe(0.5);
  });
});

describe("linha do tempo e quadros", () => {
  const scene = (id: string, durationMs: number): Scene => ({ id, durationMs, artboard, animations: [], transition: { type: "none", durationMs: 0 } });

  it("localiza cena e tempo local; depois do fim fica no último quadro", () => {
    const content = { scenes: [scene("a", 2000), scene("b", 3000)] };
    expect(totalDurationMs(content)).toBe(5000);
    expect(sceneAt(content, 0)).toMatchObject({ index: 0, localMs: 0 });
    expect(sceneAt(content, 2500)).toMatchObject({ index: 1, localMs: 500, startMs: 2000 });
    expect(sceneAt(content, 9999)).toMatchObject({ index: 1, localMs: 3000 });
  });

  it("quadro aplica presets só nas camadas animadas; escala vira transform; transição de entrada", () => {
    const s: Scene = {
      ...scene("a", 4000),
      animations: [
        { id: "t1", layerId: "title", preset: "fade-up", delayMs: 500, durationMs: 1000, easing: "linear", intensity: 1 },
        { id: "t2", layerId: "win", preset: "website-scroll", delayMs: 0, durationMs: 4000, easing: "linear", intensity: 1 },
        { id: "t3", layerId: "phone", preset: "scale-in", delayMs: 0, durationMs: 1000, easing: "linear", intensity: 1 },
      ],
      transition: { type: "fade", durationMs: 500 },
    };
    const start = sceneFrame(s, 0);
    const title0 = start.artboard.layers.find((l) => l.id === "title")!;
    expect(title0.opacity).toBe(0);
    expect(title0.y).toBeGreaterThan(80);
    expect(start.enter.opacity).toBe(0);
    expect(start.scales.phone).toBeCloseTo(0.82, 2);
    expect(start.artboard.layers.find((l) => l.id === "bg")).toBe(layers[0]);

    const mid = sceneFrame(s, 2000);
    expect((mid.artboard.layers.find((l) => l.id === "win") as Extract<Layer, { type: "browser" }>).focusY).toBeCloseTo(0.5, 5);
    const end = sceneFrame(s, 4000);
    expect(end.artboard.layers.find((l) => l.id === "title")).toMatchObject({ x: 80, y: 80, opacity: 1 });
    expect(end.scales.phone).toBeUndefined();
    expect(end.enter).toEqual({ opacity: 1, dx: 0, scale: 1 });
    // Loop cobre o resto da cena a partir do atraso.
    expect(trackDelta({ id: "x", layerId: "phone", preset: "float", delayMs: 0, durationMs: 1000, easing: "linear", intensity: 1 }, 1000, 4000, 1080).dy).toBeGreaterThan(0);
  });

  it("anima automaticamente por tipo de camada (determinístico) e ignora o fundo que cobre a peça", () => {
    const tall = new Map([["01M3K0H1GXRCVV5MRNY75J0T4V", { width: 1440, height: 9000 }]]);
    const tracks = autoAnimate(artboard, 5000, tall);
    expect(tracks.map((t) => `${t.layerId}:${t.preset}`)).toEqual(["title:fade-up", "win:browser-reveal", "win:website-scroll", "phone:device-float"]);
    expect(tracks.map((t) => t.delayMs)).toEqual([150, 290, 1190, 430]);
    expect(autoAnimate(artboard, 5000).map((t) => t.preset)).toContain("smooth-zoom");
  });

  it("schema: cenas do mesmo tamanho, animação precisa apontar para camada existente, máximo 2 min", () => {
    const content = motionFromArtboards({ artboards: [{ artboard }, { artboard, title: "Dois" }], style: { mode: "hybrid", profileRevision: null }, formatId: "post-1x1" });
    expect(content.scenes[1]).toMatchObject({ title: "Dois", transition: { type: "fade" } });
    const broken = { ...content, scenes: [{ ...content.scenes[0], animations: [{ ...content.scenes[0].animations[0], layerId: "fantasma" }] }] };
    expect(MotionContentSchema.safeParse(broken).success).toBe(false);
    const long = { ...content, scenes: Array.from({ length: 5 }, (_, i) => ({ ...content.scenes[0], id: `s${i}`, durationMs: 30_000 })) };
    expect(MotionContentSchema.safeParse(long).success).toBe(false);
  });

  it("duplicar cena remapeia as animações para as camadas copiadas; apagar camada no Studio poda as animações", () => {
    const content: MotionContent = motionFromArtboards({ artboards: [{ artboard }], style: { mode: "hybrid", profileRevision: null }, formatId: "post-1x1" });
    let n = 0;
    const dup = duplicatePage(content, 0, () => `id${++n}`);
    const copy = dup.scenes[1];
    const copyIds = new Set(copy.artboard.layers.map((l) => l.id));
    expect(copy.animations.every((a) => copyIds.has(a.layerId))).toBe(true);
    expect(MotionContentSchema.safeParse(dup).success).toBe(true);

    const store = createStudioStore({ doc: content, revision: 1 });
    store.getState().apply((c) => ({ ...c, artboard: { ...c.artboard, layers: c.artboard.layers.filter((l) => l.id !== "title") } }));
    const scene0 = (store.getState().doc as MotionContent).scenes[0];
    expect(scene0.animations.some((a) => a.layerId === "title")).toBe(false);
    expect(MotionContentSchema.safeParse(store.getState().doc).success).toBe(true);
  });

  it("o quadro renderiza no kernel React (com transição cruzada entre cenas)", () => {
    const content = motionFromArtboards({ artboards: [{ artboard }, { artboard }], style: { mode: "hybrid", profileRevision: null }, formatId: "post-1x1" });
    const html = renderToStaticMarkup(createElement(MotionFrameView, { content, timeMs: content.scenes[0].durationMs + 100, tokens: ATLAS_TOKENS, resolveAsset: () => "data:," }));
    expect(html.match(/data-atlas-artboard/g)?.length).toBe(2);
    expect(html).toContain("Título");
  });
});

describe("motion com banco", () => {
  async function setup() {
    const { project } = await createNewProject({ ...repos, storage }, { name: "Estúdio Norte", category: "Site", url: "https://www.norte.example/" });
    const png = await sharp({ create: { width: 1440, height: 7200, channels: 3, background: "#1d3557" } }).png().toBuffer();
    const up = await importUploads({ ...repos, storage, probe: new SharpMediaProbe() }, project.id, [{ name: "fullpage.png", bytes: png }], "screenshot");
    await repos.visualProfiles.create(createVisualProfile({ projectId: project.id, revision: 1, palette: ["#fbfcfd", "#1d3557"], fonts: [], techStack: [], source: "manual" }));
    return { project, page: up.created[0] };
  }

  it("carrossel → vídeo (páginas viram cenas animadas) e Website Scroll com duração pela altura", async () => {
    const { project, page } = await setup();
    const { document: carousel } = await createBlankCarousel(repos, project.id, { formatId: "story-9x16", pages: 3 });
    const video = await animateDocument(repos, carousel.id);
    expect(video.document).toMatchObject({ kind: "motion", name: "Carrossel Story 9:16 · vídeo" });
    const content = (await repos.documents.getRevision(video.document.id, 1))!.content as MotionContent;
    expect(content.scenes).toHaveLength(3);
    expect(content.scenes[0].artboard).toMatchObject({ width: 1080, height: 1920 });
    await expect(animateDocument(repos, video.document.id)).rejects.toSatisfy((e: unknown) => isDomainError(e, "VALIDATION"));

    const scroll = await createWebsiteScroll({ ...repos, sources: repos.sources }, project.id, { assetId: page.id, formatId: "story-9x16" });
    const sc = (await repos.documents.getRevision(scroll.document.id, 1))!.content as MotionContent;
    const scene = sc.scenes[0];
    expect(scene.durationMs).toBe(Math.round(3000 + 5 * 900));
    const browser = scene.artboard.layers[0] as Extract<Layer, { type: "browser" }>;
    expect(browser).toMatchObject({ type: "browser", assetId: page.id, url: "norte.example" });
    expect(scene.animations.map((a) => a.preset)).toEqual(["browser-reveal", "website-scroll"]);
    // Salvar um vídeo editado passa pela mesma validação de conteúdo.
    const edited: MotionContent = { ...sc, scenes: [{ ...scene, durationMs: 9000 }] };
    expect((await saveCanvas(repos, scroll.document.id, 1, edited)).revision.revision).toBe(2);
    const websiteScroll = websiteScrollScene({ width: 1920, height: 1080, asset: { id: page.id, width: 1440, height: 1440 } });
    expect(websiteScroll.durationMs).toBe(5000);
  });
});

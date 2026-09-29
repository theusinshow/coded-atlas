import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Asset } from "../core/assets/asset";
import { createVisualProfile } from "../core/creative/visual-profile";
import type { MotionContent } from "../core/motion/motion";
import { buildRecipe, getRecipe, pickScrollPage, VIDEO_RECIPES } from "../core/motion/recipes";
import { openDatabase, type AtlasDatabase } from "../infrastructure/db/client";
import { createRepositories, type Repositories } from "../infrastructure/db/repositories";
import { SharpMediaProbe } from "../infrastructure/sharp/media-probe";
import { LocalAssetStorage } from "../infrastructure/storage/local-asset-storage";
import { createVideoFromRecipe } from "../modules/create/document-service";
import { importUploads } from "../modules/import/upload";
import { createNewProject } from "../modules/projects/project-service";
import { isDomainError } from "../shared/errors";
import { newId } from "../shared/id";

let dir: string;
let database: AtlasDatabase;
let repos: Repositories;
let storage: LocalAssetStorage;

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "atlas-recipes-"));
  database = openDatabase({ file: path.join(dir, "atlas.db") });
  repos = createRepositories(database.db);
  storage = await LocalAssetStorage.open(path.join(dir, "storage"));
});
afterEach(() => {
  database.close();
  rmSync(dir, { recursive: true, force: true });
});

const png = (w: number, h: number, c: string) => sharp({ create: { width: w, height: h, channels: 3, background: c } }).png().toBuffer();

async function setup(withMobile: boolean, withFullpage: boolean) {
  const { project } = await createNewProject({ ...repos, storage }, { name: "Estúdio Norte", category: "Site", url: "https://norte.example" });
  const deps = { ...repos, storage, probe: new SharpMediaProbe() };
  const tag = async (bytes: Buffer, metadata: Asset["metadata"]) => {
    const up = (await importUploads(deps, project.id, [{ name: "x.png", bytes }], "screenshot")).created[0];
    await repos.assets.create({ ...up, id: newId() as Asset["id"], metadata: { ...up.metadata, ...metadata } });
    await repos.assets.delete(up.id);
  };
  await tag(await png(1440, 900, "#1d3557"), { role: "viewport", device: "desktop" });
  if (withMobile) await tag(await png(390, 844, "#e63946"), { role: "viewport", device: "mobile" });
  if (withFullpage) await tag(await png(1440, 6000, "#457b9d"), { role: "fullpage", device: "desktop" });
  await repos.visualProfiles.create(createVisualProfile({ projectId: project.id, revision: 1, palette: ["#0f1014", "#e63946"], fonts: [], techStack: [], source: "manual" }));
  return project;
}

describe("receitas de vídeo", () => {
  it("Website Reveal Reel: 5 cenas na ordem, scroll da página inteira, abertura sem transição", async () => {
    const project = await setup(true, true);
    const assets = await repos.assets.listByProject(project.id);
    const { content, skipped } = buildRecipe(getRecipe("website-reveal-reel")!, { project, assets, url: "https://norte.example", profile: null, formatId: "story-9x16", style: { mode: "atlas", profileRevision: null } });
    expect(skipped).toEqual([]);
    expect(content.scenes.map((s) => s.title)).toEqual(["Abertura", "Desktop", "Mobile", "Scroll", "Fechamento"]);
    expect(content.scenes[0].transition.type).toBe("none");
    expect(content.scenes[4].transition.type).toBe("zoom");
    expect(content.scenes[3].animations.map((a) => a.preset)).toEqual(["browser-reveal", "website-scroll"]);
    expect(content.scenes.every((s) => s.artboard.width === 1080 && s.artboard.height === 1920)).toBe(true);
  });

  it("pula passos sem material e diz por quê; sem nada utilizável é erro de validação", async () => {
    const project = await setup(false, false);
    const assets = await repos.assets.listByProject(project.id);
    expect(pickScrollPage(assets, "any")).toBeNull();
    const { content, skipped } = buildRecipe(getRecipe("quick-showcase")!, { project, assets, url: null, profile: null, formatId: "landscape-16x9", style: { mode: "atlas", profileRevision: null } });
    expect(content.scenes.map((s) => s.title)).toEqual(["Site", "Fechamento"]);
    expect(skipped).toEqual(["Scroll: nenhuma página inteira capturada"]);
    const result = await createVideoFromRecipe({ ...repos, sources: repos.sources }, project.id, { recipeId: "mobile-first", formatId: "story-9x16" });
    expect(result.skipped.some((s) => s.startsWith("Telas"))).toBe(true);
    await expect(createVideoFromRecipe({ ...repos, sources: repos.sources }, project.id, { recipeId: "nao-existe", formatId: "story-9x16" })).rejects.toSatisfy((e: unknown) => isDomainError(e, "NOT_FOUND"));
  });

  it("serviço cria o documento de motion com o nome da receita e todas as receitas cabem no limite", async () => {
    const project = await setup(true, true);
    const { document } = await createVideoFromRecipe({ ...repos, sources: repos.sources }, project.id, { recipeId: "website-reveal-reel", formatId: "post-4x5" });
    expect(document).toMatchObject({ kind: "motion", name: "Revelação do site · Estúdio Norte" });
    const content = (await repos.documents.getRevision(document.id, 1))!.content as MotionContent;
    const total = content.scenes.reduce((s, x) => s + x.durationMs, 0);
    const recipe = getRecipe("website-reveal-reel")!;
    expect(total / 1000).toBeGreaterThanOrEqual(recipe.durationRange[0]);
    expect(total / 1000).toBeLessThanOrEqual(recipe.durationRange[1]);
    expect(VIDEO_RECIPES.every((r) => r.formats.length > 0 && r.steps.length >= 3)).toBe(true);
  });
});

describe("áudio por assinatura de bytes", () => {
  it("reconhece MP3, WAV, OGG e M4A e recusa áudio enviado como imagem", async () => {
    const probe = new SharpMediaProbe();
    expect(await probe.probe(new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0]))).toMatchObject({ kind: "audio", mimeType: "audio/mpeg" });
    expect(await probe.probe(new Uint8Array([0xff, 0xfb, 0x90, 0x44]))).toMatchObject({ kind: "audio", extension: "mp3" });
    const wav = new Uint8Array(12);
    wav.set([0x52, 0x49, 0x46, 0x46], 0);
    wav.set([0x57, 0x41, 0x56, 0x45], 8);
    expect(await probe.probe(wav)).toMatchObject({ mimeType: "audio/wav" });
    expect(await probe.probe(new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0]))).toMatchObject({ mimeType: "audio/ogg" });
    const m4a = new Uint8Array(12);
    m4a.set([0x66, 0x74, 0x79, 0x70], 4);
    m4a.set([0x4d, 0x34, 0x41, 0x20], 8);
    expect(await probe.probe(m4a)).toMatchObject({ mimeType: "audio/mp4", extension: "m4a" });

    const { project } = await createNewProject({ ...repos, storage }, { name: "Estúdio Sul", category: "Site" });
    const result = await importUploads({ ...repos, storage, probe }, project.id, [{ name: "trilha.mp3", bytes: new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 1, 2]) }], "image");
    expect(result.rejected[0].reason).toBe("áudio enviado como imagem");
  });
});

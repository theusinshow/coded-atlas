import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Asset } from "../core/assets/asset";
import { createDirection } from "../core/creative/direction";
import { createMemory } from "../core/creative/memory";
import { createVisualProfile } from "../core/creative/visual-profile";
import type { CarouselContent } from "../core/documents/creative-document";
import type { MotionContent } from "../core/motion/motion";
import { KIT_PRESETS } from "../core/kits/media-kit";
import { openDatabase, type AtlasDatabase } from "../infrastructure/db/client";
import { createRepositories, type Repositories } from "../infrastructure/db/repositories";
import { PlaywrightStaticRenderer } from "../infrastructure/render/playwright-static-renderer";
import { SharpMediaProbe } from "../infrastructure/sharp/media-probe";
import { LocalAssetStorage } from "../infrastructure/storage/local-asset-storage";
import { importUploads } from "../modules/import/upload";
import { enqueueKitRender, generateMediaKit, removeKitItem, swapKitItemVisual, type KitDeps } from "../modules/kits/kit-service";
import { createNewProject } from "../modules/projects/project-service";
import { createRenderJobHandler } from "../modules/render/render-job";
import { isDomainError } from "../shared/errors";
import { newId } from "../shared/id";
import { JobWorker } from "../workers/job-worker";

let dir: string;
let database: AtlasDatabase;
let repos: Repositories;
let storage: LocalAssetStorage;

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "atlas-kit-"));
  database = openDatabase({ file: path.join(dir, "atlas.db") });
  repos = createRepositories(database.db);
  storage = await LocalAssetStorage.open(path.join(dir, "storage"));
});
afterEach(() => {
  database.close();
  rmSync(dir, { recursive: true, force: true });
});

const png = (w: number, h: number, c: string) => sharp({ create: { width: w, height: h, channels: 3, background: c } }).png().toBuffer();
const kitDeps = (): KitDeps => ({ ...repos, composition: repos });

async function setup() {
  const { project } = await createNewProject({ ...repos, storage }, { name: "Estúdio Norte", category: "Site", url: "https://norte.example" });
  const deps = { ...repos, storage, probe: new SharpMediaProbe() };
  const tag = async (bytes: Buffer, metadata: Asset["metadata"]) => {
    const up = (await importUploads(deps, project.id, [{ name: "x.png", bytes }], "screenshot")).created[0];
    await repos.assets.create({ ...up, id: newId() as Asset["id"], metadata: { ...up.metadata, ...metadata } });
    await repos.assets.delete(up.id);
  };
  await tag(await png(1440, 900, "#1d3557"), { role: "viewport", device: "desktop" });
  await tag(await png(390, 844, "#e63946"), { role: "viewport", device: "mobile" });
  await tag(await png(1440, 5000, "#457b9d"), { role: "fullpage", device: "desktop" });
  await repos.visualProfiles.create(createVisualProfile({ projectId: project.id, revision: 1, palette: ["#0f1014", "#e63946"], fonts: [], techStack: [], source: "manual" }));
  return project;
}

describe("Media Kit", () => {
  it("presets têm itens únicos, peças e ao menos um vídeo", () => {
    for (const p of KIT_PRESETS) {
      expect(new Set(p.items.map((i) => i.id)).size).toBe(p.items.length);
      const kinds = new Set(p.items.map((i) => i.kind));
      expect(kinds.has("composition") && kinds.has("video")).toBe(true);
    }
  });

  it("gera o kit de lançamento com UMA direção em todos os itens; memória troca a composição vetada", async () => {
    const project = await setup();
    const direction = await repos.directions.create(createDirection({ projectId: project.id, name: "Lançamento", tone: "Sóbrio", emphasis: "Engenharia", styleMode: "atlas", accent: "#ff5500", notes: "", planId: null }));
    await repos.memory.create(createMemory({ scope: "project", projectId: project.id, polarity: "avoid", subject: "composition", value: "desktop-mobile" }));

    const kit = await generateMediaKit(kitDeps(), project.id, { presetId: "launch-kit", directionId: direction.id });
    expect(kit).toMatchObject({ name: "Kit de lançamento · Estúdio Norte", status: "ready", directionId: direction.id, direction: { styleMode: "atlas", accent: "#ff5500" } });
    expect(kit.items.map((i) => i.presetItemId)).toEqual(["post", "carousel", "story", "cover", "reel"]);
    expect(kit.items.every((i) => i.instanceId || i.documentId)).toBe(true);

    const post = await repos.compositionInstances.getById(kit.items[0].instanceId as never);
    expect(post).toMatchObject({ compositionId: "desktop-hero", styleMode: "atlas", overrides: { primary: "#ff5500" }, formatId: "post-4x5" });
    expect(kit.items[0].note).toContain("desktop-mobile");

    const carousel = await repos.documents.getById(kit.items[1].documentId as never);
    const carouselContent = (await repos.documents.getRevision(carousel!.id, 1))!.content as CarouselContent;
    expect(carouselContent.pages).toHaveLength(5);
    expect(carouselContent.style).toMatchObject({ mode: "atlas", primary: "#ff5500" });

    const reel = await repos.documents.getById(kit.items[4].documentId as never);
    expect(reel?.kind).toBe("motion");
    expect(((await repos.documents.getRevision(reel!.id, 1))!.content as MotionContent).style).toMatchObject({ mode: "atlas", primary: "#ff5500" });
  });

  it("render em lote: imagens de todos os itens (vídeo vira pôsteres) marcadas com o kit; status e bloqueio", async () => {
    const project = await setup();
    const kit = await generateMediaKit(kitDeps(), project.id, { presetId: "social-kit" });
    const job = await enqueueKitRender(kitDeps(), kit.id, { image: "jpg", video: false, quality: "final" });
    expect((await repos.kits.getById(kit.id))!.status).toBe("rendering");
    await expect(enqueueKitRender(kitDeps(), kit.id, { image: "png", video: false, quality: "final" })).rejects.toSatisfy((e: unknown) => isDomainError(e, "CONFLICT"));

    const worker = new JobWorker({ jobs: repos.jobs, handlers: { render: createRenderJobHandler({ ...repos, storage, renderer: new PlaywrightStaticRenderer() }) } });
    const done = await worker.runOnce();
    expect(done).toMatchObject({ id: job.id, status: "completed", result: { kitId: kit.id } });
    const after = (await repos.kits.getById(kit.id))!;
    expect(after).toMatchObject({ status: "rendered", lastRenderJobId: job.id });

    const outputs = (await repos.outputs.listByProject(project.id)).filter((o) => o.metadata.mediaKitId === kit.id);
    expect(outputs.every((o) => o.format === "jpg" && o.jobId === job.id)).toBe(true);
    const perItem = new Map(kit.items.map((i) => [i.id, outputs.filter((o) => o.metadata.kitItemId === i.id).length]));
    expect(perItem.get(kit.items[0].id)).toBe(1); // post 1:1
    expect(perItem.get(kit.items[3].id)).toBe(4); // carrossel de 4 páginas
    expect(perItem.get(kit.items[4].id)).toBeGreaterThanOrEqual(2); // reel sem vídeo: um pôster por cena
    // Documentos renderizados ficam fixados (a revisão do render não é reescrita).
    const carousel = await repos.documents.getById(kit.items[3].documentId as never);
    expect((await repos.documents.getRevision(carousel!.id, carousel!.headRevision))!.pinned).toBe(true);
    // Terminado, pode renderizar de novo.
    await expect(enqueueKitRender(kitDeps(), kit.id, { image: "png", video: false, quality: "final" })).resolves.toBeTruthy();
  }, 120_000);

  it("sem imagens no projeto: erro claro", async () => {
    const { project } = await createNewProject({ ...repos, storage }, { name: "Vazio", category: "Site" });
    await expect(generateMediaKit(kitDeps(), project.id, { presetId: "launch-kit" })).rejects.toSatisfy((e: unknown) => isDomainError(e, "VALIDATION"));
  });

  describe("trocar visual e tirar peça", () => {
    it("trocar visual: próxima composição usável, mesmo formato e estilo; a instância antiga sai", async () => {
      const project = await setup();
      const kit = await generateMediaKit(kitDeps(), project.id, { presetId: "portfolio-kit" });
      const hero = kit.items.find((i) => i.presetItemId === "hero")!;
      const before = (await repos.compositionInstances.getById(hero.instanceId as never))!;
      expect(before.compositionId).toBe("desktop-hero");

      const swapped = await swapKitItemVisual(kitDeps(), kit.id, hero.id);
      const item = swapped.items.find((i) => i.id === hero.id)!;
      expect(item.instanceId).not.toBe(hero.instanceId);
      const after = (await repos.compositionInstances.getById(item.instanceId as never))!;
      expect(after.compositionId).toBe("floating-devices");
      expect(after).toMatchObject({ formatId: before.formatId, styleMode: before.styleMode });
      expect(await repos.compositionInstances.getById(hero.instanceId as never)).toBeNull();
      expect((await repos.kits.getById(kit.id))!.items.find((i) => i.id === hero.id)!.instanceId).toBe(item.instanceId);

      // Troca sucessiva percorre as alternativas e volta ao começo.
      const seen = new Set([before.compositionId, after.compositionId]);
      let current = swapped;
      for (let n = 0; n < 12; n++) {
        current = await swapKitItemVisual(kitDeps(), kit.id, hero.id);
        const id = (await repos.compositionInstances.getById(current.items.find((i) => i.id === hero.id)!.instanceId as never))!.compositionId;
        if (id === "desktop-hero") break;
        seen.add(id);
      }
      expect((await repos.compositionInstances.getById(current.items.find((i) => i.id === hero.id)!.instanceId as never))!.compositionId).toBe("desktop-hero");
      expect(seen.size).toBeGreaterThanOrEqual(2);
    });

    it("trocar visual recusa item que não é composição", async () => {
      const project = await setup();
      const kit = await generateMediaKit(kitDeps(), project.id, { presetId: "portfolio-kit" });
      const video = kit.items.find((i) => i.kind === "video")!;
      await expect(swapKitItemVisual(kitDeps(), kit.id, video.id)).rejects.toSatisfy((e: unknown) => isDomainError(e, "VALIDATION"));
    });

    it("tirar peça remove o item e sua instância; o último item não sai", async () => {
      const project = await setup();
      const kit = await generateMediaKit(kitDeps(), project.id, { presetId: "portfolio-kit" });
      const first = kit.items[0];
      const after = await removeKitItem(kitDeps(), kit.id, first.id);
      expect(after.items.map((i) => i.id)).not.toContain(first.id);
      expect(after.items).toHaveLength(kit.items.length - 1);
      expect(await repos.compositionInstances.getById(first.instanceId as never)).toBeNull();

      let current = after;
      while (current.items.length > 1) current = await removeKitItem(kitDeps(), kit.id, current.items[0].id);
      await expect(removeKitItem(kitDeps(), kit.id, current.items[0].id)).rejects.toSatisfy((e: unknown) => isDomainError(e, "VALIDATION"));
    });

    it("kit renderizado volta a pronto ao mudar; renderizando, recusa", async () => {
      const project = await setup();
      const kit = await generateMediaKit(kitDeps(), project.id, { presetId: "portfolio-kit" });
      await repos.kits.update({ ...kit, status: "rendered" });
      const changed = await removeKitItem(kitDeps(), kit.id, kit.items[1].id);
      expect(changed.status).toBe("ready");

      await enqueueKitRender(kitDeps(), kit.id, { image: "png", video: false, quality: "final" });
      const hero = changed.items.find((i) => i.presetItemId === "hero")!;
      await expect(swapKitItemVisual(kitDeps(), kit.id, hero.id)).rejects.toSatisfy((e: unknown) => isDomainError(e, "CONFLICT"));
      await expect(removeKitItem(kitDeps(), kit.id, hero.id)).rejects.toSatisfy((e: unknown) => isDomainError(e, "CONFLICT"));
    });
  });
});

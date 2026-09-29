import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createVisualProfile } from "../core/creative/visual-profile";
import { openDatabase, type AtlasDatabase } from "../infrastructure/db/client";
import { createRepositories, type Repositories } from "../infrastructure/db/repositories";
import { PlaywrightStaticRenderer } from "../infrastructure/render/playwright-static-renderer";
import { SharpMediaProbe } from "../infrastructure/sharp/media-probe";
import { ThumbnailService } from "../infrastructure/sharp/thumbnails";
import { LocalAssetStorage } from "../infrastructure/storage/local-asset-storage";
import { createInstance, deleteInstance, enqueueRender, updateInstance } from "../modules/create/composition-service";
import { importUploads } from "../modules/import/upload";
import { createNewProject } from "../modules/projects/project-service";
import { createRenderJobHandler } from "../modules/render/render-job";
import { isDomainError } from "../shared/errors";
import { JobWorker } from "../workers/job-worker";

let dir: string;
let database: AtlasDatabase;
let repos: Repositories;
let storage: LocalAssetStorage;

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "atlas-compose-"));
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
  const png = (w: number, h: number, c: string) => sharp({ create: { width: w, height: h, channels: 3, background: c } }).png().toBuffer();
  const up = await importUploads({ ...repos, storage, probe: new SharpMediaProbe() }, project.id, [{ name: "home.png", bytes: await png(1440, 900, "#1d3557") }], "screenshot");
  await repos.visualProfiles.create(createVisualProfile({ projectId: project.id, revision: 1, palette: ["#fbfcfd", "#1d3557", "#e63946"], fonts: ["Inter"], techStack: [], source: "manual" }));
  return { project, upload: up.created[0] };
}

describe("fluxo de composição: instância → render job → Outputs", () => {
  it("cria com auto-binding, edita, renderiza PNG+JPG+WebP e grava Outputs rastreáveis", async () => {
    const { project, upload } = await setup();
    const instance = await createInstance(repos, project.id, { compositionId: "desktop-hero", formatId: "post-1x1" });
    expect(instance).toMatchObject({ name: "Destaque desktop", compositionVersion: 1, variant: "centered", styleMode: "hybrid", visualProfileRevision: 1 });
    expect(instance.bindings.desktop).toEqual({ assetId: upload.id });
    expect(instance.bindings.title).toEqual({ text: "Estúdio Norte" });
    expect(instance.bindings.url).toEqual({ text: "norte.example" });

    const edited = await updateInstance(repos, instance.id, { formatId: "story-9x16", variant: "bleed", bindings: { title: { text: "Novo site" } } });
    expect(edited).toMatchObject({ formatId: "story-9x16", variant: "bleed", bindings: { title: { text: "Novo site" }, desktop: { assetId: upload.id } } });

    const job = await enqueueRender(repos, instance.id, ["png", "jpg", "webp"]);
    const worker = new JobWorker({ jobs: repos.jobs, handlers: { render: createRenderJobHandler({ ...repos, storage, renderer: new PlaywrightStaticRenderer() }) } });
    const done = await worker.runOnce();
    expect(done).toMatchObject({ id: job.id, status: "completed", result: { count: 3 } });

    const outputs = await repos.outputs.listByProject(project.id);
    expect(outputs.map((o) => o.format).sort()).toEqual(["jpg", "png", "webp"]);
    for (const o of outputs) {
      expect(o).toMatchObject({ width: 1080, height: 1920, jobId: job.id, sourceAssetIds: [upload.id], metadata: { origin: "render", compositionId: "desktop-hero", instanceId: instance.id, formatId: "story-9x16" } });
      expect(o.storageKey).toMatch(/^renders\//);
      const meta = await sharp(await storage.get(o.storageKey)).metadata();
      expect([meta.width, meta.height]).toEqual([1080, 1920]);
    }

    // Miniatura de peça final mostra a imagem inteira (a de grade corta imagens altas no topo).
    const png = outputs.find((o) => o.format === "png")!;
    const thumbs = new ThumbnailService(storage);
    const whole = await sharp(Buffer.from((await thumbs.get(png, 320, "whole"))!)).metadata();
    const grid = await sharp(Buffer.from((await thumbs.get(png, 320))!)).metadata();
    expect([whole.width, whole.height]).toEqual([320, 569]);
    expect([grid.width, grid.height]).toEqual([320, 200]);

    // Excluir a instância não apaga as peças já renderizadas (Output é imutável).
    await deleteInstance(repos, instance.id);
    expect(await repos.compositionInstances.getById(instance.id)).toBeNull();
    expect(await repos.outputs.listByProject(project.id)).toHaveLength(3);
  }, 60_000);

  it("recusa formato não suportado, variante inexistente e imagem de outro projeto", async () => {
    const { project } = await setup();
    const other = await setup();
    const instance = await createInstance(repos, project.id, { compositionId: "editorial-split" });
    for (const [patch, label] of [
      [{ variant: "nao-existe" }, "variante"],
      [{ bindings: { image: { assetId: other.upload.id } } }, "asset de outro projeto"],
      [{ bindings: { image: { text: "oi" } } }, "texto em slot de imagem"],
    ] as const) {
      try {
        await updateInstance(repos, instance.id, patch);
        expect.unreachable(label);
      } catch (err) {
        expect(isDomainError(err, "VALIDATION"), label).toBe(true);
      }
    }
    await expect(createInstance(repos, project.id, { compositionId: "inexistente" })).rejects.toSatisfy((e: unknown) => isDomainError(e, "NOT_FOUND"));
  });
});

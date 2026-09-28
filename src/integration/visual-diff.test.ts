import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Asset } from "../core/assets/asset";
import { openDatabase, type AtlasDatabase } from "../infrastructure/db/client";
import { createRepositories, type Repositories } from "../infrastructure/db/repositories";
import { SharpMediaProbe } from "../infrastructure/sharp/media-probe";
import { SharpPixelmatchDiffer } from "../infrastructure/sharp/visual-differ";
import { LocalAssetStorage } from "../infrastructure/storage/local-asset-storage";
import { importUploads } from "../modules/import/upload";
import { changedPercent, createVisualDiffJobHandler, requestVisualDiff } from "../modules/capture/visual-diff";
import { createNewProject } from "../modules/projects/project-service";
import { newId } from "../shared/id";
import { JobWorker } from "../workers/job-worker";

let dir: string;
let database: AtlasDatabase;
let repos: Repositories;
let storage: LocalAssetStorage;

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "atlas-diff-"));
  database = openDatabase({ file: path.join(dir, "atlas.db") });
  repos = createRepositories(database.db);
  storage = await LocalAssetStorage.open(path.join(dir, "storage"));
});
afterEach(() => {
  database.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Página 200×100 escura; `patch` pinta um bloco claro de 20×10 (1% da área). */
const page = (patch: boolean, height = 100) =>
  sharp({ create: { width: 200, height, channels: 3, background: "#0f1014" } })
    .composite(patch ? [{ input: { create: { width: 20, height: 10, channels: 3, background: "#ffffff" } }, left: 0, top: 0 }] : [])
    .png()
    .toBuffer();

async function setup() {
  const { project } = await createNewProject({ ...repos, storage }, { name: "Site Vigiado", category: "Site" });
  const deps = { ...repos, storage, probe: new SharpMediaProbe() };
  const shot = async (bytes: Buffer, metadata: Asset["metadata"]) => {
    // Bytes iguais deduplicam no upload: reaproveita o registro existente como base (bytes são os mesmos).
    const result = await importUploads(deps, project.id, [{ name: "x.png", bytes }], "screenshot");
    const up = result.created[0] ?? result.duplicates[0];
    const asset = await repos.assets.create({ ...up, id: newId() as Asset["id"], metadata: { origin: "capture", ...metadata } });
    if (result.created[0]) await repos.assets.delete(up.id);
    return asset;
  };
  return { project, shot };
}

const worker = () =>
  new JobWorker({ jobs: repos.jobs, handlers: { diff: createVisualDiffJobHandler({ assets: repos.assets, jobs: repos.jobs, storage, differ: new SharpPixelmatchDiffer() }) } });

describe("diff visual", () => {
  it("percentual com 2 casas", () => {
    expect(changedPercent(200, 20_000)).toBe(1);
    expect(changedPercent(1, 3)).toBe(33.33);
    expect(changedPercent(0, 0)).toBe(0);
  });

  it("compara duas capturas: Asset derivado com imagem, % alterado e linhagem; mesmo par reaproveita", async () => {
    const { project, shot } = await setup();
    const before = await shot(await page(false), { role: "viewport", device: "desktop", viewport: "200x100" });
    const after = await shot(await page(true), { role: "viewport", device: "desktop", viewport: "200x100" });

    const job = await requestVisualDiff(repos, before.id, after.id);
    expect(job).toMatchObject({ type: "diff", destructive: false, projectId: project.id });
    const done = await worker().runOnce();
    expect(done?.status).toBe("completed");
    expect(done?.result).toMatchObject({ percent: 1, changedPixels: 200, reused: false });

    const diff = (await repos.assets.listByProject(project.id)).find((a) => a.metadata.role === "diff")!;
    expect(diff).toMatchObject({ kind: "image", mimeType: "image/png", width: 200, height: 100, parentAssetId: after.id, metadata: { origin: "derived", comparedTo: before.id, changedPercent: 1, device: "desktop" } });
    expect(diff.label).toMatch(/^Diferença 1% · desktop · viewport$/);
    const { data } = await sharp(Buffer.from(await storage.get(diff.storageKey))).extract({ left: 5, top: 5, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2]]).toEqual([255, 90, 60]); // região alterada destacada

    await requestVisualDiff(repos, before.id, after.id);
    expect((await worker().runOnce())?.result).toMatchObject({ assetId: diff.id, reused: true });
    expect((await repos.assets.listByProject(project.id)).filter((a) => a.metadata.role === "diff")).toHaveLength(1);
  });

  it("página que mudou de altura é redimensionada para a base; idênticas dão 0%", async () => {
    const { shot } = await setup();
    const base = await shot(await page(false), { role: "fullpage", device: "mobile" });
    const same = await shot(await page(false, 100), { role: "fullpage", device: "mobile", viewport: "x" });
    const taller = await shot(await page(false, 180), { role: "fullpage", device: "mobile", viewport: "y" });
    await requestVisualDiff(repos, base.id, same.id);
    expect((await worker().runOnce())?.result).toMatchObject({ percent: 0 });
    await requestVisualDiff(repos, base.id, taller.id);
    const done = await worker().runOnce();
    expect(done?.status).toBe("completed");
    expect(done?.result).toMatchObject({ percent: 0 });
  });

  it("recusa par inválido: mesmo asset, devices diferentes, não-captura, outro projeto", async () => {
    const { shot } = await setup();
    const desktop = await shot(await page(false), { role: "viewport", device: "desktop" });
    const mobile = await shot(await page(true), { role: "viewport", device: "mobile" });
    const upload = await shot(await page(true), { role: "upload" });
    await expect(requestVisualDiff(repos, desktop.id, desktop.id)).rejects.toThrow(/diferentes/);
    await expect(requestVisualDiff(repos, desktop.id, mobile.id)).rejects.toThrow(/mesmo device/);
    await expect(requestVisualDiff(repos, desktop.id, upload.id)).rejects.toThrow(/fotos de página/);
    const other = await setup();
    const foreign = await other.shot(await page(true), { role: "viewport", device: "desktop" });
    await expect(requestVisualDiff(repos, desktop.id, foreign.id)).rejects.toThrow(/mesmo projeto/);
    expect(await repos.jobs.listByProject(desktop.projectId)).toHaveLength(0);
  });
});

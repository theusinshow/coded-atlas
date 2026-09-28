import { mkdtempSync, promises as fs, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type AtlasDatabase } from "../infrastructure/db/client";
import { createRepositories, type Repositories } from "../infrastructure/db/repositories";
import { PlaywrightCaptureEngine } from "../infrastructure/playwright/playwright-capture-engine";
import { sha256Bytes } from "../infrastructure/storage/hash";
import { LocalAssetStorage } from "../infrastructure/storage/local-asset-storage";
import { createCaptureJobHandler } from "../modules/capture/capture-job";
import { queueUrlCapture } from "../modules/capture/queue-url-capture";
import { JobWorker } from "../workers/job-worker";

/**
 * Fatia vertical 2.1.F de ponta a ponta, com Chromium real contra um site local:
 * projeto → source URL → job → worker → Playwright → AssetStorage → SQLite → recarga.
 */
const VIEWPORT = { label: "desktop", width: 800, height: 600, deviceScaleFactor: 1 };

let server: Server;
let baseUrl: string;
const pending: { end: () => void }[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/slow") {
      pending.push(res); // nunca responde: a navegação fica presa até ser cancelada
      return;
    }
    if (req.url === "/missing") {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html><body style="margin:0;background:#0f1014">
      <h1 style="color:#e8e8ea;font:48px sans-serif;padding:40px">Fixture Atlas</h1></body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  for (const res of pending) res.end();
  await new Promise((resolve) => server.close(resolve));
});

let dir: string;
let dbFile: string;
let database: AtlasDatabase;
let repos: Repositories;
let storage: LocalAssetStorage;

function makeWorker(settle: boolean): JobWorker {
  const engine = new PlaywrightCaptureEngine({ headless: true, navTimeoutMs: 30_000, userAgent: "AtlasTest", settle });
  return new JobWorker({
    jobs: repos.jobs,
    heartbeatIntervalMs: 50,
    handlers: {
      capture: createCaptureJobHandler({ ...repos, storage, engine, viewport: VIEWPORT, timeoutMs: 60_000 }),
    },
  });
}

async function storedFiles(): Promise<string[]> {
  const root = path.join(dir, "storage");
  return (await fs.readdir(root, { recursive: true, withFileTypes: true }))
    .filter((e) => e.isFile())
    .map((e) => path.relative(root, path.join(e.parentPath, e.name)).split(path.sep).join("/"));
}

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "atlas-slice-"));
  dbFile = path.join(dir, "atlas.db");
  database = openDatabase({ file: dbFile });
  repos = createRepositories(database.db);
  storage = await LocalAssetStorage.open(path.join(dir, "storage"));
});
afterEach(() => {
  database.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("fatia vertical de captura", () => {
  it("create project → source → job → captura real → AssetStorage → SQLite → recarga", async () => {
    const { project, source, job } = await queueUrlCapture(repos, {
      slug: "fixture",
      name: "Fixture",
      category: "site",
      url: `${baseUrl}/`,
    });

    const done = await makeWorker(true).runOnce(); // settle=true: usa as rotinas de estabilidade do v1
    expect(done).toMatchObject({ id: job.id, status: "completed", progress: 100 });

    // Recarrega tudo por uma conexão nova, como outro processo faria.
    const reopened = openDatabase({ file: dbFile });
    try {
      const r = createRepositories(reopened.db);
      const [asset] = await r.assets.listByProject(project.id);
      expect(asset).toMatchObject({ kind: "screenshot", mimeType: "image/png", width: 800, height: 600 });
      expect(asset.storageKey).toMatch(/^captures\/[a-f0-9]{2}\/[a-f0-9]{64}\.png$/);

      const [capture] = await r.captures.listByProject(project.id);
      expect(capture).toMatchObject({ status: "completed", sourceId: source.id, jobId: job.id, type: "device" });
      expect(await r.assets.listByCapture(capture.id)).toEqual([asset]);
      expect((await r.projects.getById(project.id))?.coverAssetId).toBe(asset.id);
      expect((await r.jobs.getById(job.id))?.result).toMatchObject({ assetIds: [asset.id], captureId: capture.id });

      const bytes = await storage.get(asset.storageKey);
      expect(sha256Bytes(bytes)).toBe(asset.sha256);
      expect(bytes.byteLength).toBe(asset.byteSize);

      const rows = reopened.sqlite.prepare("SELECT storage_key FROM assets").all() as { storage_key: string }[];
      expect(rows.every((row) => !/^[a-zA-Z]:|^\/|\\/.test(row.storage_key))).toBe(true); // nenhum caminho absoluto
    } finally {
      reopened.close();
    }
    expect(await storedFiles()).toEqual([expect.stringMatching(/^captures\//)]);
  }, 60_000);

  it("recaptura da mesma URL reaproveita projeto e source; bytes iguais deduplicam", async () => {
    const input = { slug: "fixture", name: "Fixture", category: "site", url: `${baseUrl}/` };
    const first = await queueUrlCapture(repos, input);
    await makeWorker(false).runOnce();
    const second = await queueUrlCapture(repos, input);
    await makeWorker(false).runOnce();

    expect(second.project.id).toBe(first.project.id);
    expect(second.source.id).toBe(first.source.id);
    const assets = await repos.assets.listByProject(first.project.id);
    expect(assets).toHaveLength(2); // duas capturas = dois Assets (imutáveis)…
    expect(new Set(assets.map((a) => a.storageKey)).size).toBe(1); // …que compartilham os mesmos bytes
  }, 60_000);

  it("cancelar no meio da navegação fecha o navegador e não deixa Asset nem bytes", async () => {
    const { project, job } = await queueUrlCapture(repos, {
      slug: "lento",
      name: "Lento",
      category: "site",
      url: `${baseUrl}/slow`,
    });
    const started = Date.now();
    const running = makeWorker(false).runOnce();

    // Espera o navegador estar de fato preso na navegação.
    while (pending.length === 0) await new Promise((r) => setTimeout(r, 20));
    await repos.jobs.requestCancel(job.id);
    const final = await running;

    expect(final).toMatchObject({ status: "cancelled", error: { code: "CANCELLED" } });
    expect(Date.now() - started).toBeLessThan(20_000); // não esperou o timeout de navegação (30 s)
    const [capture] = await repos.captures.listByProject(project.id);
    expect(capture).toMatchObject({ status: "cancelled", error: { code: "CANCELLED" } });
    expect(await repos.assets.listByProject(project.id)).toEqual([]);
    expect(await storedFiles()).toEqual([]);
  }, 60_000);

  it("site respondendo 404 → job e capture falham, nada é guardado", async () => {
    const { project } = await queueUrlCapture(repos, {
      slug: "sumiu",
      name: "Sumiu",
      category: "site",
      url: `${baseUrl}/missing`,
    });
    const final = await makeWorker(false).runOnce();
    expect(final).toMatchObject({ status: "failed", error: { code: "VALIDATION" } });
    expect((await repos.captures.listByProject(project.id))[0]).toMatchObject({ status: "failed" });
    expect(await repos.assets.listByProject(project.id)).toEqual([]);
    expect(await storedFiles()).toEqual([]);
  }, 60_000);
});

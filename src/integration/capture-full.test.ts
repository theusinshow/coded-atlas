import { mkdtempSync, promises as fs, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CAPTURE_PROFILES, type CapturePlan } from "../core/assets/capture-plan";
import { createJob } from "../core/jobs/job";
import { openDatabase, type AtlasDatabase } from "../infrastructure/db/client";
import { createRepositories, type Repositories } from "../infrastructure/db/repositories";
import { PlaywrightCaptureEngine } from "../infrastructure/playwright/playwright-capture-engine";
import { SharpImageTransformer } from "../infrastructure/sharp/image-transformer";
import { LocalAssetStorage } from "../infrastructure/storage/local-asset-storage";
import { createCaptureJobHandler, COVER_SIZE } from "../modules/capture/capture-job";
import { createNewProject } from "../modules/projects/project-service";
import { JobWorker } from "../workers/job-worker";

const PAGE = `<!doctype html><html><head><style>
  body{margin:0;font-family:Georgia,serif;background:#0b2a36;color:#fbfcfd}
  header,section,footer{min-height:500px;padding:40px}
  .cta{background:#e63946;color:#fff;padding:12px}
  #menu{display:none;position:fixed;inset:0;background:#e63946} body.open #menu{display:block}
</style></head><body>
  <header id="hero"><h1>Hero do fixture</h1><button id="abrir" onclick="document.body.classList.add('open')">Menu</button><a class="cta">Contato</a></header>
  <section id="servicos" class="services"><h2>Serviços</h2></section>
  <section id="about"><h2>Sobre nós</h2></section>
  <footer><p>Rodapé</p></footer>
  <div id="menu">menu aberto</div>
</body></html>`;

let server: Server;
let base: string;
beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/nao-existe") return void res.writeHead(404).end("nope");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(req.url === "/sobre" ? "<html><body style='margin:0;background:#fbfcfd'><h1>Página Sobre</h1></body></html>" : PAGE);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
});

let dir: string;
let database: AtlasDatabase;
let repos: Repositories;
let storage: LocalAssetStorage;

const VIEWPORTS = {
  desktop: { label: "desktop", width: 1000, height: 600, deviceScaleFactor: 1 },
  mobile: { label: "mobile", width: 390, height: 700, deviceScaleFactor: 1 },
};

function worker(): JobWorker {
  const engine = new PlaywrightCaptureEngine({
    headless: true,
    navTimeoutMs: 20_000,
    userAgent: "AtlasTest",
    settle: false,
    limits: { sectionDelayMs: 30, stateSettleMs: 50 },
  });
  return new JobWorker({
    jobs: repos.jobs,
    heartbeatIntervalMs: 50,
    handlers: {
      capture: createCaptureJobHandler({ ...repos, storage, engine, images: new SharpImageTransformer(), viewports: VIEWPORTS, timeoutMs: 120_000 }),
    },
  });
}

async function queue(plan: CapturePlan, url = `${base}/`) {
  const { project, source } = await createNewProject({ ...repos, storage }, { name: `Full ${Date.now()}`, category: "Site", url });
  const job = await repos.jobs.create(createJob({ type: "capture", projectId: project.id, payload: { sourceId: source!.id, plan } }));
  return { project, job };
}

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "atlas-full-"));
  database = openDatabase({ file: path.join(dir, "atlas.db") });
  repos = createRepositories(database.db);
  storage = await LocalAssetStorage.open(path.join(dir, "storage"));
});
afterEach(() => {
  database.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("captura completa (2.3)", () => {
  it("desktop + mobile, página inteira, seções nomeadas, página extra, estado, vídeo, capa derivada e VisualProfile", async () => {
    const plan: CapturePlan = {
      ...CAPTURE_PROFILES.complete,
      pages: ["/sobre", "/nao-existe", "javascript:alert(1)"],
      states: [
        { name: "Menu aberto", selector: "#abrir" },
        { name: "Inexistente", selector: "#nao-tem" },
      ],
    };
    const { project, job } = await queue(plan);
    const done = await worker().runOnce();
    expect(done).toMatchObject({ id: job.id, status: "completed" });

    const assets = await repos.assets.listByProject(project.id);
    const byRole = (role: string, device?: string) => assets.filter((a) => a.metadata.role === role && (!device || a.metadata.device === device));

    expect(byRole("viewport", "desktop")[0]).toMatchObject({ width: 1000, height: 600, kind: "screenshot" });
    expect(byRole("viewport", "mobile")[0]).toMatchObject({ width: 390, height: 700 });
    expect(byRole("fullpage")).toHaveLength(2);
    const sectionNames = byRole("section", "desktop").map((a) => a.metadata.sectionName);
    expect(sectionNames).toEqual(expect.arrayContaining(["Hero", "Serviços", "Sobre"]));
    expect(byRole("section", "desktop").every((a) => a.kind === "section" && typeof a.metadata.sectionIndex === "number")).toBe(true);
    expect(byRole("page-viewport").map((a) => a.metadata.pagePath)).toEqual(["/sobre", "/sobre"]);
    expect(byRole("state")[0]).toMatchObject({ label: "Menu aberto", metadata: { stateName: "Menu aberto" } });
    expect(byRole("scroll-video").map((a) => a.mimeType)).toEqual(["video/webm", "video/webm"]);

    const [cover] = byRole("cover");
    expect(cover).toMatchObject({ width: COVER_SIZE.width, height: COVER_SIZE.height, mimeType: "image/webp", metadata: { origin: "derived" } });
    expect(cover.parentAssetId).toBe(byRole("viewport", "desktop")[0].id);
    expect((await repos.projects.getById(project.id))?.coverAssetId).toBe(cover.id);

    const profile = await repos.visualProfiles.latest(project.id);
    expect(profile).toMatchObject({ revision: 1, source: "inspection" });
    expect(profile!.palette).toContain("#0b2a36");
    expect(profile!.traits).toContain("dark");

    // Falhas parciais viram avisos no resultado — a captura em si concluiu.
    const warnings = (done!.result as { warnings: { code: string }[] }).warnings.map((w) => w.code);
    expect(warnings).toEqual(expect.arrayContaining(["PAGE_CAPTURE_FAILED", "STATE_CAPTURE_FAILED"]));
    expect(warnings.filter((c) => c === "PAGE_CAPTURE_FAILED").length).toBeGreaterThanOrEqual(2); // 404 + javascript:

    // Tudo endereçado por conteúdo; vídeos em namespace próprio.
    expect(assets.every((a) => /^(captures|videos)\/[a-f0-9]{2}\/[a-f0-9]{64}\.(png|webp|webm)$/.test(a.storageKey))).toBe(true);
  }, 120_000);

  it("segunda captura cria VisualProfile revisão 2 e não troca a capa escolhida", async () => {
    const plan: CapturePlan = { ...CAPTURE_PROFILES.quick, devices: ["desktop"], sections: false };
    const { project } = await queue(plan);
    await worker().runOnce();
    const firstCover = (await repos.projects.getById(project.id))!.coverAssetId;
    const source = (await repos.sources.listByProject(project.id))[0];
    await repos.jobs.create(createJob({ type: "capture", projectId: project.id, payload: { sourceId: source.id, plan } }));
    await worker().runOnce();
    expect((await repos.visualProfiles.latest(project.id))?.revision).toBe(2);
    expect((await repos.projects.getById(project.id))!.coverAssetId).toBe(firstCover);
  }, 120_000);

  it("cancelar no meio da captura completa não deixa assets nem bytes", async () => {
    const plan: CapturePlan = { ...CAPTURE_PROFILES.complete };
    const { project, job } = await queue(plan);
    const running = worker().runOnce();
    // espera a primeira atualização de progresso da engine (navegador aberto)
    for (;;) {
      const current = await repos.jobs.getById(job.id);
      if (current && current.progress >= 5) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    await repos.jobs.requestCancel(job.id);
    const final = await running;
    expect(final?.status).toBe("cancelled");
    expect(await repos.assets.listByProject(project.id)).toEqual([]);
    const files = (await fs.readdir(path.join(dir, "storage"), { recursive: true, withFileTypes: true })).filter((e) => e.isFile());
    expect(files).toEqual([]);
  }, 120_000);
});

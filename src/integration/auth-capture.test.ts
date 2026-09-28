import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type AtlasDatabase } from "../infrastructure/db/client";
import { createRepositories, type Repositories } from "../infrastructure/db/repositories";
import { FileSessionStore } from "../infrastructure/playwright/file-session-store";
import { PlaywrightCaptureEngine } from "../infrastructure/playwright/playwright-capture-engine";
import { SharpImageTransformer } from "../infrastructure/sharp/image-transformer";
import { LocalAssetStorage } from "../infrastructure/storage/local-asset-storage";
import { createCaptureJobHandler } from "../modules/capture/capture-job";
import { queueUrlCapture } from "../modules/capture/queue-url-capture";
import { summarizeSession } from "../modules/capture/session-store";
import { deleteProjectPermanently } from "../modules/projects/project-service";
import { isDomainError } from "../shared/errors";
import type { ProjectId } from "../shared/id";
import { JobWorker } from "../workers/job-worker";

/** Site de teste: sem o cookie de sessão mostra o login (vermelho); com ele, a área logada (verde). */
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    const logged = /(?:^|;\s*)atlas_session=ok(?:;|$)/.test(req.headers.cookie ?? "");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html><body style="margin:0;background:${logged ? "#00c853" : "#d50000"}"><h1>${logged ? "Área logada" : "Login"}</h1></body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

let dir: string;
let database: AtlasDatabase;
let repos: Repositories;
let storage: LocalAssetStorage;
let sessions: FileSessionStore;

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "atlas-auth-"));
  database = openDatabase({ file: path.join(dir, "atlas.db") });
  repos = createRepositories(database.db);
  storage = await LocalAssetStorage.open(path.join(dir, "storage"));
  sessions = new FileSessionStore(path.join(dir, "auth"));
});
afterEach(() => {
  database.close();
  rmSync(dir, { recursive: true, force: true });
});

const VIEWPORT = { label: "desktop", width: 400, height: 300, deviceScaleFactor: 1 };

function worker(): JobWorker {
  return new JobWorker({
    jobs: repos.jobs,
    handlers: {
      capture: createCaptureJobHandler({
        ...repos,
        storage,
        engine: new PlaywrightCaptureEngine({ headless: true, navTimeoutMs: 30_000, userAgent: "AtlasTest" }),
        images: new SharpImageTransformer(),
        viewports: { desktop: VIEWPORT, mobile: { ...VIEWPORT, label: "mobile" } },
        timeoutMs: 60_000,
        sessions,
      }),
    },
  });
}

async function centerColor(projectId: ProjectId): Promise<"green" | "red"> {
  const assets = await repos.assets.listByProject(projectId);
  const latest = assets.filter((a) => a.metadata.role === "viewport").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const { data } = await sharp(Buffer.from(await storage.get(latest.storageKey))).extract({ left: 200, top: 200, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  return data[1] > data[0] ? "green" : "red";
}

const loggedIn = (host: string) => ({
  cookies: [{ name: "atlas_session", value: "ok", domain: host, path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" }],
  origins: [{ origin: baseUrl, localStorage: [{ name: "token", value: "segredo" }] }],
});

describe("captura autenticada", () => {
  it("sem sessão fotografa o login; com a sessão salva, a área logada; remover volta ao anônimo", async () => {
    const { project, job } = await queueUrlCapture(repos, { slug: "app", name: "App", category: "software", url: `${baseUrl}/painel` });
    expect((await worker().runOnce())?.status).toBe("completed");
    expect(await centerColor(project.id)).toBe("red");
    expect((await repos.jobs.getById(job.id))?.result).toMatchObject({ authenticated: false });

    const info = await sessions.save(project.id, loggedIn("127.0.0.1"));
    expect(info).toMatchObject({ cookieCount: 1, domains: [new URL(baseUrl).host, "127.0.0.1"].sort() });
    const second = await queueUrlCapture(repos, { slug: "app", name: "App", category: "software", url: `${baseUrl}/painel` });
    expect((await worker().runOnce())?.status).toBe("completed");
    expect(await centerColor(project.id)).toBe("green");
    expect((await repos.jobs.getById(second.job.id))?.result).toMatchObject({ authenticated: true });

    expect(await sessions.remove(project.id)).toBe(true);
    expect(await sessions.remove(project.id)).toBe(false);
    await queueUrlCapture(repos, { slug: "app", name: "App", category: "software", url: `${baseUrl}/painel` });
    await worker().runOnce();
    expect(await centerColor(project.id)).toBe("red");
  }, 90_000);

  it("a sessão fica fora do storage, com nome = ID do projeto, e o resumo nunca expõe valores", async () => {
    const { project } = await queueUrlCapture(repos, { slug: "app", name: "App", category: "software", url: `${baseUrl}/` });
    await sessions.save(project.id, loggedIn("127.0.0.1"));
    const file = path.join(dir, "auth", `${project.id}.json`);
    expect(existsSync(file)).toBe(true);
    expect(existsSync(path.join(dir, "storage", "auth"))).toBe(false);
    const info = await sessions.info(project.id);
    expect(JSON.stringify(info)).not.toMatch(/segredo|"ok"/);
    expect(JSON.stringify(summarizeSession(loggedIn("x.example"), "2026-01-01T00:00:00.000Z"))).not.toContain("segredo");

    writeFileSync(file, "{ quebrado");
    await expect(sessions.get(project.id)).rejects.toThrow(/corrompida/);
    await expect(sessions.get("../../etc/passwd" as ProjectId)).rejects.toSatisfy((e: unknown) => isDomainError(e) && e.code === "VALIDATION");
    expect(await sessions.info("01ARZ3NDEKTSV4RRFFQ69G5FAV" as ProjectId)).toBeNull();
    expect(readFileSync(file, "utf8")).toBe("{ quebrado");
  });

  it("excluir o projeto apaga a sessão", async () => {
    const { project } = await queueUrlCapture(repos, { slug: "app", name: "App", category: "software", url: `${baseUrl}/` });
    await sessions.save(project.id, loggedIn("127.0.0.1"));
    await worker().runOnce(); // sem job ativo: a exclusão exige isso
    await deleteProjectPermanently({ ...repos, storage, sessions }, project.id, "app");
    expect(existsSync(path.join(dir, "auth", `${project.id}.json`))).toBe(false);
  });
});

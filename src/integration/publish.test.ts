import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOutput, type Output, type OutputFormat, type OutputMetadata } from "../core/assets/output";
import { contentStorageKey } from "../core/assets/storage-key";
import { createVisualProfile } from "../core/creative/visual-profile";
import { packagePaths } from "../core/publish/export";
import { openDatabase, type AtlasDatabase } from "../infrastructure/db/client";
import { createRepositories, type Repositories } from "../infrastructure/db/repositories";
import { GithubApiDestination, LocalFolderDestination, githubConfigFromEnv } from "../infrastructure/publish/destinations";
import { LocalAssetStorage } from "../infrastructure/storage/local-asset-storage";
import { buildZip } from "../infrastructure/zip/zip-builder";
import { createNewProject, deleteProjectPermanently } from "../modules/projects/project-service";
import { createExportJobHandler, deliveryStamp, requestPackage, requestPortfolio, type ExportDeps } from "../modules/publish/export-service";
import { isDomainError } from "../shared/errors";
import { JobWorker } from "../workers/job-worker";

let dir: string;
let database: AtlasDatabase;
let repos: Repositories;
let storage: LocalAssetStorage;

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "atlas-publish-"));
  database = openDatabase({ file: path.join(dir, "atlas.db") });
  repos = createRepositories(database.db);
  storage = await LocalAssetStorage.open(path.join(dir, "storage"));
});
afterEach(() => {
  database.close();
  rmSync(dir, { recursive: true, force: true });
});

const MIME: Record<OutputFormat, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", mp4: "video/mp4", webm: "video/webm", pdf: "application/pdf", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", zip: "application/zip" };

async function addOutput(projectId: Output["projectId"], format: OutputFormat, label: string, dims: [number, number] | null, metadata: OutputMetadata = {}): Promise<Output> {
  const bytes = new TextEncoder().encode(`${label}-${format}-${Math.random()}`);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const storageKey = contentStorageKey("renders", sha256, format);
  await storage.put(storageKey, bytes);
  return repos.outputs.create(createOutput({ projectId, format, mimeType: MIME[format], storageKey, sha256, byteSize: bytes.byteLength, width: dims?.[0] ?? null, height: dims?.[1] ?? null, label, metadata: { origin: "render", ...metadata } }));
}

function deps(overrides: Partial<ExportDeps> = {}): ExportDeps {
  return {
    ...repos,
    storage,
    folder: new LocalFolderDestination(path.join(dir, "exports")),
    github: new GithubApiDestination(null),
    zip: (files) => buildZip(files.map((f) => ({ name: f.path, bytes: f.bytes }))),
    ...overrides,
  };
}

async function setup(name = "Estúdio Norte") {
  const { project } = await createNewProject({ ...repos, storage }, { name, category: "Landing Page", url: `https://${name.split(" ")[1].toLowerCase()}.example` });
  await repos.visualProfiles.create(createVisualProfile({ projectId: project.id, revision: 1, palette: ["#0f1014", "#e63946"], fonts: [], techStack: ["Next.js"], source: "manual" }));
  const hero = await addOutput(project.id, "png", "Hero desktop", [1440, 900]);
  const story = await addOutput(project.id, "png", "Story", [1080, 1920]);
  const reel = await addOutput(project.id, "mp4", "Reel", [1080, 1920]);
  const deck = await addOutput(project.id, "pdf", "Apresentação", null);
  const web = await addOutput(project.id, "zip", "Case página web", null, { caseModule: "web" });
  return { project, hero, story, reel, deck, web };
}

async function run(d: ExportDeps) {
  const worker = new JobWorker({ jobs: repos.jobs, handlers: { export: createExportJobHandler(d) } });
  return worker.runOnce();
}

describe("Publish & Portfolio", () => {
  it("caminhos do pacote: pasta por tipo, nomes legíveis e únicos", () => {
    const outputs = [
      { id: "01AAAAAAAAAAAAAAAAAAAAAAA1", format: "png", label: "Hero · desktop", metadata: {} },
      { id: "01AAAAAAAAAAAAAAAAAAAAAAB2", format: "png", label: "Hero · desktop", metadata: {} },
      { id: "01AAAAAAAAAAAAAAAAAAAAAAC3", format: "mp4", label: "Reel", metadata: {} },
      { id: "01AAAAAAAAAAAAAAAAAAAAAAD4", format: "zip", label: "../../etc/passwd", metadata: {} },
    ] as unknown as Output[];
    const paths = packagePaths(outputs, "norte/");
    expect([...paths.values()]).toEqual(["norte/imagens/hero-desktop.png", "norte/imagens/hero-desktop-aaaab2.png", "norte/videos/reel.mp4", "norte/web/etc-passwd.zip"]);
    // Horário local: o mesmo instante montado a partir dos componentes locais.
    expect(deliveryStamp(new Date(2026, 8, 28, 14, 5, 9, 123).toISOString())).toBe("2026-09-28-140509");
    expect(deliveryStamp(new Date(2026, 0, 2, 3, 4, 5).toISOString())).toBe("2026-01-02-030405");
  });

  it("pacote como ZIP: registro + job, pastas por tipo, manifest e download guardado no storage", async () => {
    const { project, hero, reel, deck, web } = await setup();
    const { record, job } = await requestPackage(deps(), { projectId: project.id, outputIds: [hero.id, reel.id, deck.id, web.id, hero.id], destination: "download" });
    expect(record).toMatchObject({ kind: "package", status: "queued", jobId: job.id, name: "Estúdio Norte · pacote" });
    expect(record.outputIds).toHaveLength(4);
    expect(job).toMatchObject({ type: "export", destructive: false, projectId: project.id });

    const done = await run(deps());
    expect(done?.status).toBe("completed");
    const delivered = await repos.exports.getById(record.id);
    expect(delivered).toMatchObject({ status: "delivered", result: { files: 5 } });
    const zip = await storage.get(delivered!.result.archive!.storageKey);
    const text = Buffer.from(zip).toString("latin1");
    for (const name of ["imagens/hero-desktop.png", "videos/reel.mp4", "documentos/apresentacao.pdf", "web/case-pagina-web.zip", "manifest.json"]) expect(text).toContain(name);
    expect(createHash("sha256").update(zip).digest("hex")).toBe(delivered!.result.archive!.sha256);
  });

  it("pacote numa pasta local: arquivos reais, confinados, e nunca sobrescreve", async () => {
    const { project, hero, story } = await setup();
    const { record } = await requestPackage(deps(), { projectId: project.id, outputIds: [hero.id, story.id], destination: "folder" });
    expect((await run(deps()))?.status).toBe("completed");
    const delivered = (await repos.exports.getById(record.id))!;
    expect(delivered.result.folder).toMatch(/^estudio-norte-\d{4}-\d{2}-\d{2}-\d{6}$/);
    const root = path.join(dir, "exports", delivered.result.folder!);
    expect(existsSync(path.join(root, "imagens", "hero-desktop.png"))).toBe(true);
    const manifest = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));
    expect(manifest).toMatchObject({ generator: "Coded Atlas", version: 2, project: { slug: "estudio-norte", url: "https://norte.example" } });
    expect(manifest.files.map((f: { path: string }) => f.path)).toEqual(["imagens/hero-desktop.png", "imagens/story.png"]);
    expect(JSON.stringify(manifest)).not.toContain(dir.replace(/\\/g, "\\\\"));

    const folder = new LocalFolderDestination(path.join(dir, "exports"));
    const bytes = new Uint8Array([1]);
    await expect(folder.deliver(delivered.result.folder!, [{ path: "manifest.json", bytes }])).rejects.toThrow();
    for (const bad of ["../fora", "/abs", "a/../../b", "c:\\x", "ok"]) {
      const target = bad === "ok" ? folder.deliver("ok", [{ path: "../escape.txt", bytes }]) : folder.deliver(bad, [{ path: "x.txt", bytes }]);
      await expect(target).rejects.toSatisfy((e: unknown) => isDomainError(e) && e.code === "PATH_OUTSIDE_ROOT");
    }
    expect(existsSync(path.join(dir, "fora"))).toBe(false);
    expect(existsSync(path.join(dir, "exports", "escape.txt"))).toBe(false);
  });

  it("recusa peças de outro projeto, seleção vazia e GitHub sem configuração", async () => {
    const a = await setup();
    const b = await setup("Casa Sul");
    await expect(requestPackage(deps(), { projectId: a.project.id, outputIds: [b.hero.id], destination: "download" })).rejects.toThrow(/não pertencem/);
    await expect(requestPackage(deps(), { projectId: a.project.id, outputIds: [], destination: "download" })).rejects.toThrow(/ao menos uma/);
    await expect(requestPackage(deps(), { projectId: a.project.id, outputIds: [a.hero.id], destination: "github" })).rejects.toThrow(/GitHub não configurado/);
    expect(await repos.exports.listRecent(10)).toHaveLength(0);
  });

  it("portfólio: uma pasta por projeto e portfolio.json com os campos do manifesto v1", async () => {
    const a = await setup();
    const b = await setup("Casa Sul");
    const { record, job } = await requestPortfolio(deps(), { outputIds: [a.hero.id, a.story.id, a.reel.id, a.web.id, b.hero.id], destination: "folder" });
    expect(record).toMatchObject({ projectId: null, kind: "portfolio", name: "Portfólio · 2 projetos" });
    expect(job.projectId).toBeNull();
    expect((await run(deps()))?.status).toBe("completed");
    const delivered = (await repos.exports.getById(record.id))!;
    expect(delivered.result.folder).toMatch(/^portfolio-/);
    const root = path.join(dir, "exports", delivered.result.folder!);
    const portfolio = JSON.parse(readFileSync(path.join(root, "portfolio.json"), "utf8"));
    expect(portfolio.projects).toHaveLength(2);
    const norte = portfolio.projects.find((p: { slug: string }) => p.slug === "estudio-norte");
    expect(norte).toMatchObject({
      name: "Estúdio Norte",
      category: "Landing Page",
      url: "https://norte.example",
      thumbnail: "estudio-norte/imagens/hero-desktop.png",
      thumbnailMobile: "estudio-norte/imagens/story.png",
      palette: ["#0f1014", "#e63946"],
      techStack: ["Next.js"],
      hasVideo: true,
      atlasVersion: "2",
      case: "estudio-norte/web/case-pagina-web.zip",
    });
    expect(norte.pieces.map((p: { path: string }) => p.path)).toEqual(["estudio-norte/imagens/hero-desktop.png", "estudio-norte/imagens/story.png", "estudio-norte/videos/reel.mp4"]);
    expect(existsSync(path.join(root, "casa-sul", "imagens", "hero-desktop.png"))).toBe(true);
    expect(await repos.exports.listByProject(null)).toHaveLength(1);
  });

  it("GitHub: um commit com todos os arquivos (blobs → tree → commit → ref) sob a pasta configurada", async () => {
    const { project, hero } = await setup();
    const calls: { method: string; url: string; body: Record<string, unknown> | null }[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      calls.push({ method: init?.method ?? "GET", url, body });
      const route = url.replace("https://api.github.com/repos/codedbym/portfolio", "");
      const reply = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
      if (route.startsWith("/git/ref/heads/")) return reply({ object: { sha: "base-commit" } });
      if (route === "/git/commits/base-commit") return reply({ tree: { sha: "base-tree" } });
      if (route === "/git/blobs") return reply({ sha: `blob-${calls.length}` });
      if (route === "/git/trees") return reply({ sha: "new-tree" });
      if (route === "/git/commits") return reply({ sha: "new-commit", html_url: "https://github.com/codedbym/portfolio/commit/new-commit" });
      if (route.startsWith("/git/refs/heads/")) return reply({});
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    const config = githubConfigFromEnv({ ATLAS_GITHUB_TOKEN: "t0k3n", ATLAS_GITHUB_REPO: "codedbym/portfolio", ATLAS_GITHUB_PATH: "/content/atlas/" });
    expect(config).toMatchObject({ repo: "codedbym/portfolio", branch: "main", basePath: "content/atlas" });
    expect(githubConfigFromEnv({ ATLAS_GITHUB_TOKEN: "x", ATLAS_GITHUB_REPO: "not a repo" })).toBeNull();
    const github = new GithubApiDestination({ ...config!, fetch: fakeFetch });

    const d = deps({ github });
    const { record } = await requestPackage(d, { projectId: project.id, outputIds: [hero.id], destination: "github" });
    expect((await run(d))?.status).toBe("completed");
    expect((await repos.exports.getById(record.id))?.result).toMatchObject({ commitUrl: "https://github.com/codedbym/portfolio/commit/new-commit", files: 2 });
    const tree = calls.find((c) => c.url.endsWith("/git/trees"))!.body as { base_tree: string; tree: { path: string }[] };
    expect(tree.base_tree).toBe("base-tree");
    expect(tree.tree.map((t) => t.path)).toEqual(["content/atlas/estudio-norte/imagens/hero-desktop.png", "content/atlas/estudio-norte/manifest.json"]);
    const commit = calls.find((c) => c.url.endsWith("/git/commits") && c.method === "POST")!.body!;
    expect(commit).toMatchObject({ parents: ["base-commit"], tree: "new-tree", message: "Coded Atlas: Estúdio Norte · pacote" });
    expect(calls.at(-1)).toMatchObject({ method: "PATCH", body: { sha: "new-commit", force: false } });
    expect(calls.every((c) => !c.url.includes("t0k3n"))).toBe(true);
  });

  it("falha na entrega marca a exportação como falha com a mensagem; excluir o projeto apaga o ZIP", async () => {
    const { project, hero } = await setup();
    const failing = new GithubApiDestination({ token: "t", repo: "a/b", branch: "main", basePath: "atlas", fetch: (async () => new Response("bad credentials", { status: 401 })) as typeof fetch });
    const d = deps({ github: failing });
    const { record } = await requestPackage(d, { projectId: project.id, outputIds: [hero.id], destination: "github" });
    expect((await run(d))?.status).toBe("failed");
    expect(await repos.exports.getById(record.id)).toMatchObject({ status: "failed", result: { error: expect.stringContaining("401") } });

    const zip = await requestPackage(deps(), { projectId: project.id, outputIds: [hero.id], destination: "download" });
    await run(deps());
    const key = (await repos.exports.getById(zip.record.id))!.result.archive!.storageKey;
    expect(await storage.exists(key)).toBe(true);
    await deleteProjectPermanently({ ...repos, storage, exports: repos.exports }, project.id, project.slug);
    expect(await storage.exists(key)).toBe(false);
    expect(await repos.exports.getById(zip.record.id)).toBeNull();
  });
});

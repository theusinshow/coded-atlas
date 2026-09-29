import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOutput, type Output } from "../core/assets/output";
import { contentStorageKey } from "../core/assets/storage-key";
import type { SocialPostId } from "../core/social/social-post";
import { openDatabase, type AtlasDatabase } from "../infrastructure/db/client";
import { createRepositories, type Repositories } from "../infrastructure/db/repositories";
import { LocalAssetStorage } from "../infrastructure/storage/local-asset-storage";
import { createNewProject, deleteProjectPermanently } from "../modules/projects/project-service";
import { createPost, deletePost, fitsKind, listPlanner, movePost, setPostStatus, updatePost } from "../modules/social/social-service";
import { isDomainError } from "../shared/errors";

let dir: string;
let database: AtlasDatabase;
let repos: Repositories;
let storage: LocalAssetStorage;

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "atlas-social-"));
  database = openDatabase({ file: path.join(dir, "atlas.db") });
  repos = createRepositories(database.db);
  storage = await LocalAssetStorage.open(path.join(dir, "storage"));
});
afterEach(() => {
  database.close();
  rmSync(dir, { recursive: true, force: true });
});

async function piece(projectId: Output["projectId"], format: "png" | "mp4", w: number, h: number, label: string, durationMs: number | null = null) {
  const bytes = new TextEncoder().encode(`${label}${Math.random()}`);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const storageKey = contentStorageKey("renders", sha256, format);
  await storage.put(storageKey, bytes);
  return repos.outputs.create(createOutput({ projectId, format, mimeType: format === "png" ? "image/png" : "video/mp4", storageKey, sha256, byteSize: bytes.byteLength, width: w, height: h, durationMs, label, metadata: { origin: "render" } }));
}

async function setup() {
  const { project } = await createNewProject({ ...repos, storage }, { name: "MJ Engenharia", category: "Landing Page" });
  return {
    project,
    square: await piece(project.id, "png", 1080, 1080, "Quadrado"),
    portrait: await piece(project.id, "png", 1080, 1350, "Retrato"),
    portrait2: await piece(project.id, "png", 1080, 1350, "Retrato 2"),
    story: await piece(project.id, "png", 1080, 1920, "Story"),
    reel: await piece(project.id, "mp4", 1080, 1920, "Reel", 20_000),
  };
}

describe("Social — planejador do Instagram", () => {
  it("cria posts: título e hashtags sugeridos, feed com o mais novo no topo, stories à parte", async () => {
    const s = await setup();
    const first = await createPost(repos, { kind: "post", outputIds: [s.portrait.id] });
    expect(first).toMatchObject({ status: "draft", title: "MJ Engenharia · Post", hashtags: ["codedbym", "webdesign", "desenvolvimentoweb", "landingpage", "conversao"] });
    const carousel = await createPost(repos, { kind: "carousel", outputIds: [s.portrait.id, s.portrait2.id, s.portrait.id] });
    expect(carousel.outputIds).toHaveLength(2); // repetidas saem
    await createPost(repos, { kind: "story", outputIds: [s.story.id] });
    const { feed, stories } = await listPlanner(repos);
    expect(feed.map((p) => p.post.id)).toEqual([carousel.id, first.id]);
    expect(stories).toHaveLength(1);
    expect(feed[0]).toMatchObject({ projects: ["MJ Engenharia"], missing: 0, check: { errors: [] } });
  });

  it("pronto exige peças válidas e legenda dentro do limite; publicado registra a data; editar peças volta a rascunho", async () => {
    const s = await setup();
    const bad = await createPost(repos, { kind: "carousel", outputIds: [s.portrait.id, s.square.id] });
    await expect(setPostStatus(repos, bad.id, "ready")).rejects.toThrow(/mesma proporção/);
    await updatePost(repos, bad.id, { outputIds: [s.portrait.id, s.portrait2.id], caption: "Engenharia preventiva que passa na primeira análise.", hashtags: "#ppci, #spda #PPCI", plannedFor: "2026-10-02" });
    const ready = await setPostStatus(repos, bad.id, "ready");
    expect(ready).toMatchObject({ status: "ready", hashtags: ["ppci", "spda"], plannedFor: "2026-10-02" });
    const posted = await setPostStatus(repos, bad.id, "posted");
    expect(posted.postedAt).not.toBeNull();
    expect((await setPostStatus(repos, bad.id, "draft")).postedAt).toBeNull();
    await setPostStatus(repos, bad.id, "ready");
    expect((await updatePost(repos, bad.id, { outputIds: [s.portrait2.id, s.portrait.id] })).status).toBe("draft");
    await expect(updatePost(repos, bad.id, { caption: "x".repeat(2300) })).rejects.toSatisfy((e: unknown) => isDomainError(e) && e.code === "VALIDATION");
  });

  it("reordena o grid e apaga", async () => {
    const s = await setup();
    const a = await createPost(repos, { kind: "post", outputIds: [s.portrait.id] });
    const b = await createPost(repos, { kind: "post", outputIds: [s.square.id] });
    const c = await createPost(repos, { kind: "reel", outputIds: [s.reel.id] });
    const order = async () => (await listPlanner(repos)).feed.map((p) => p.post.id);
    expect(await order()).toEqual([c.id, b.id, a.id]);
    await movePost(repos, a.id, "earlier");
    expect(await order()).toEqual([c.id, a.id, b.id]);
    await movePost(repos, c.id, "earlier"); // já é o primeiro: nada muda
    expect(await order()).toEqual([c.id, a.id, b.id]);
    await deletePost(repos, b.id);
    expect(await order()).toEqual([c.id, a.id]);
    await expect(deletePost(repos, "01ARZ3NDEKTSV4RRFFQ69G5FAV" as SocialPostId)).rejects.toThrow(/não encontrado/);
  });

  it("peça apagada com o projeto vira aviso bloqueante no post (não quebra o planejador)", async () => {
    const s = await setup();
    const post = await createPost(repos, { kind: "post", outputIds: [s.portrait.id] });
    await deleteProjectPermanently({ ...repos, storage }, s.project.id, s.project.slug);
    const { feed } = await listPlanner(repos);
    expect(feed[0]).toMatchObject({ missing: 1, pieces: [] });
    await expect(setPostStatus(repos, post.id, "ready")).rejects.toThrow(/não existe mais/);
  });

  it("seletor: cada tipo só oferece peças que servem", async () => {
    const s = await setup();
    expect(fitsKind("post", s.portrait)).toBe(true);
    expect(fitsKind("post", s.story)).toBe(false);
    expect(fitsKind("story", s.story)).toBe(true);
    expect(fitsKind("reel", s.reel)).toBe(true);
    expect(fitsKind("reel", s.portrait)).toBe(false);
    expect(fitsKind("carousel", s.square)).toBe(true);
  });
});

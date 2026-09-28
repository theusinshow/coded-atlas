import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAsset } from "../../core/assets/asset";
import { createCapture } from "../../core/assets/capture";
import { createOutput } from "../../core/assets/output";
import { parseStorageKey } from "../../core/assets/storage-key";
import { createJob } from "../../core/jobs/job";
import { createProject } from "../../core/projects/project";
import { createSource } from "../../core/projects/source";
import { isDomainError, type DomainErrorCode } from "../../shared/errors";
import { JobIdSchema, newId, ProjectIdSchema, type AssetId, type ProjectId } from "../../shared/id";
import { DEFAULT_MIGRATIONS_FOLDER, openDatabase, type AtlasDatabase } from "./client";
import journal from "./migrations/meta/_journal.json";
import { createRepositories, type Repositories } from "./repositories";

const SHA = "b".repeat(64);

async function expectCode(promise: Promise<unknown>, code: DomainErrorCode): Promise<void> {
  try {
    await promise;
    expect.unreachable(`esperava ${code}`);
  } catch (err) {
    expect(isDomainError(err, code), String(err)).toBe(true);
  }
}

let dir: string;
let database: AtlasDatabase;
let repos: Repositories;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "atlas-db-"));
  database = openDatabase({ file: path.join(dir, "atlas.db") });
  repos = createRepositories(database.db);
});
afterEach(() => {
  database.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("openDatabase", () => {
  it("inicializa do zero com as tabelas da fundação, WAL e foreign keys", () => {
    const tables = (
      database.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .all() as { name: string }[]
    ).map((t) => t.name);
    expect(tables).toEqual([
      "__drizzle_migrations",
      "asset_relations",
      "assets",
      "captures",
      "jobs",
      "legacy_imports",
      "outputs",
      "projects",
      "sources",
    ]);
    expect(database.sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(database.sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("reabrir é idempotente e preserva dados", async () => {
    const project = await repos.projects.create(createProject({ slug: "a", name: "A", category: "site" }));
    database.close();
    database = openDatabase({ file: path.join(dir, "atlas.db") });
    repos = createRepositories(database.db);
    expect(await repos.projects.getById(project.id)).toEqual(project);
    const count = database.sqlite.prepare("SELECT COUNT(*) AS n FROM __drizzle_migrations").get() as { n: number };
    expect(count.n).toBe(journal.entries.length);
  });

  it("banco de uma versão anterior recebe só as migrations novas, sem perder dados", async () => {
    // Simula o Atlas de 2.1.A: pasta de migrations só com a primeira entrada.
    const oldFolder = path.join(dir, "migrations-v0");
    cpSync(DEFAULT_MIGRATIONS_FOLDER, oldFolder, { recursive: true });
    writeFileSync(
      path.join(oldFolder, "meta", "_journal.json"),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) })
    );
    const oldFile = path.join(dir, "antigo.db");
    const old = openDatabase({ file: oldFile, migrationsFolder: oldFolder });
    // Linhas gravadas como o Atlas 2.1.A gravava (colunas daquela época).
    const projectId = "01J9YYYYYYYYYYYYYYYYYYYYYY";
    old.sqlite.exec(
      `INSERT INTO projects (id, slug, name, client, category, status, cover_asset_id, schema_version, created_at, updated_at)
       VALUES ('${projectId}', 'a', 'A', NULL, 'site', 'active', NULL, 1, '2026-09-27T00:00:00.000Z', '2026-09-27T00:00:00.000Z');
       INSERT INTO jobs (id, project_id, type, status, progress, payload, attempts, created_at, updated_at)
       VALUES ('01J9ZZZZZZZZZZZZZZZZZZZZZZ', '${projectId}', 'capture', 'queued', 0, '{}', 0,
               '2026-09-27T00:00:00.000Z', '2026-09-27T00:00:00.000Z');`
    );
    old.close();

    const upgraded = openDatabase({ file: oldFile });
    const upgradedRepos = createRepositories(upgraded.db);
    // Colunas novas recebem os defaults: origem "atlas", sem descrição.
    expect(await upgradedRepos.projects.getById(ProjectIdSchema.parse(projectId))).toMatchObject({
      slug: "a",
      origin: "atlas",
      description: null,
    });
    const legacyJob = await upgradedRepos.jobs.getById(JobIdSchema.parse("01J9ZZZZZZZZZZZZZZZZZZZZZZ"));
    expect(legacyJob).toMatchObject({ status: "queued", destructive: false }); // default da coluna nova
    const applied = upgraded.sqlite.prepare("SELECT COUNT(*) AS n FROM __drizzle_migrations").get() as { n: number };
    expect(applied.n).toBe(journal.entries.length);
    upgraded.close();
  });

  it("banco de versão mais nova → DB_SCHEMA_MISMATCH (sem tocar nos dados)", () => {
    database.sqlite
      .prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)")
      .run("f".repeat(64), 9_999_999_999_999);
    database.close();
    try {
      database = openDatabase({ file: path.join(dir, "atlas.db") });
      expect.unreachable();
    } catch (err) {
      expect(isDomainError(err, "DB_SCHEMA_MISMATCH")).toBe(true);
    }
    database = openDatabase({ file: ":memory:" }); // para o afterEach
  });

  it("migration aplicada e editada → DB_SCHEMA_MISMATCH", () => {
    database.sqlite.prepare("UPDATE __drizzle_migrations SET hash = ?").run("0".repeat(64));
    database.close();
    expect(() => openDatabase({ file: path.join(dir, "atlas.db") })).toThrow(/alterada/);
    database = openDatabase({ file: ":memory:" });
  });
});

describe("repositórios", () => {
  it("Project/Source/Asset fazem round-trip", async () => {
    const project = await repos.projects.create(
      createProject({ slug: "zion-guincho", name: "Zion Guincho", category: "site", client: "Zion" })
    );
    const source = await repos.sources.create(
      createSource({ projectId: project.id, type: "url", locator: "https://zion.example" })
    );
    const asset = await repos.assets.create(
      createAsset({
        projectId: project.id,
        kind: "screenshot",
        storageKey: parseStorageKey(`assets/bb/${SHA}.png`),
        sha256: SHA,
        mimeType: "image/png",
        byteSize: 2048,
        width: 2880,
        height: 1800,
      })
    );

    expect(await repos.projects.getById(project.id)).toEqual(project);
    expect(await repos.projects.getBySlug("zion-guincho")).toEqual(project);
    expect(await repos.sources.getById(source.id)).toEqual(source);
    expect(await repos.sources.listByProject(project.id)).toEqual([source]);
    expect(await repos.assets.getById(asset.id)).toEqual(asset);
    expect(await repos.assets.listByProject(project.id)).toEqual([asset]);
    expect(await repos.assets.findBySha256(project.id, SHA)).toEqual([asset]);
  });

  it("slug duplicado → CONFLICT", async () => {
    await repos.projects.create(createProject({ slug: "dup", name: "A", category: "site" }));
    await expectCode(repos.projects.create(createProject({ slug: "dup", name: "B", category: "site" })), "CONFLICT");
  });

  it("update de projeto renova updatedAt e mantém createdAt; archived some da listagem padrão", async () => {
    const project = await repos.projects.create(createProject({ slug: "a", name: "A", category: "site" }));
    await new Promise((r) => setTimeout(r, 5));
    const updated = await repos.projects.update({
      ...project,
      name: "A2",
      status: "archived",
      createdAt: "2000-01-01T00:00:00.000Z", // tentativa de reescrever createdAt é ignorada
    });
    expect(updated.createdAt).toBe(project.createdAt);
    expect(updated.updatedAt > project.updatedAt).toBe(true);
    expect(await repos.projects.list()).toEqual([]);
    expect(await repos.projects.list({ includeArchived: true })).toEqual([updated]);
    await expectCode(repos.projects.update({ ...project, id: newId() as ProjectId }), "NOT_FOUND");
  });

  it("FK: source de projeto inexistente → VALIDATION", async () => {
    const orphan = createSource({ projectId: newId() as ProjectId, type: "url", locator: "https://x.com" });
    await expectCode(repos.sources.create(orphan), "VALIDATION");
  });

  it("entrada inválida é barrada antes do banco", async () => {
    const project = createProject({ slug: "a", name: "A", category: "site" });
    await expectCode(repos.projects.create({ ...project, slug: "../x" }), "VALIDATION");
    expect(await repos.projects.list()).toEqual([]);
  });

  it("linha corrompida no banco é detectada na leitura", async () => {
    const project = await repos.projects.create(createProject({ slug: "a", name: "A", category: "site" }));
    database.sqlite.prepare("UPDATE projects SET slug = '../../etc' WHERE id = ?").run(project.id);
    await expectCode(repos.projects.getById(project.id), "VALIDATION");
  });

  it("JSON persistido corrompido é detectado na leitura", async () => {
    const job = await repos.jobs.create(createJob({ type: "capture" }));
    database.sqlite.prepare("UPDATE jobs SET payload = '{quebrado' WHERE id = ?").run(job.id);
    await expectCode(repos.jobs.getById(job.id), "VALIDATION");
    database.sqlite.prepare(`UPDATE jobs SET payload = '"texto"' WHERE id = ?`).run(job.id);
    await expectCode(repos.jobs.getById(job.id), "VALIDATION");
  });

  it("Capture + Assets ligados + Output fazem round-trip; cascata ao remover projeto", async () => {
    const project = await repos.projects.create(createProject({ slug: "p", name: "P", category: "site" }));
    const source = await repos.sources.create(
      createSource({ projectId: project.id, type: "url", locator: "https://p.example" })
    );
    const job = await repos.jobs.create(createJob({ type: "capture", projectId: project.id }));
    const capture = await repos.captures.create(
      createCapture({
        projectId: project.id,
        sourceId: source.id,
        jobId: job.id,
        type: "device",
        params: { url: source.locator, fullPage: true },
      })
    );
    const parent = await repos.assets.create(
      createAsset({
        projectId: project.id,
        captureId: capture.id,
        kind: "screenshot",
        storageKey: parseStorageKey(`assets/bb/${SHA}.png`),
        sha256: SHA,
        mimeType: "image/png",
        byteSize: 10,
      })
    );
    const thumb = await repos.assets.create(
      createAsset({
        projectId: project.id,
        parentAssetId: parent.id,
        kind: "image",
        storageKey: parseStorageKey(`thumbnails/cc/${"c".repeat(64)}.webp`),
        sha256: "c".repeat(64),
        mimeType: "image/webp",
        byteSize: 5,
      })
    );
    const relation = await repos.assets.addRelation({
      fromAssetId: thumb.id,
      toAssetId: parent.id,
      type: "thumbnail-of",
      createdAt: new Date().toISOString(),
    });
    const output = await repos.outputs.create(
      createOutput({
        projectId: project.id,
        jobId: job.id,
        format: "webp",
        mimeType: "image/webp",
        storageKey: thumb.storageKey,
        sha256: thumb.sha256,
        byteSize: thumb.byteSize,
        sourceAssetIds: [parent.id, thumb.id],
      })
    );

    expect(await repos.captures.getById(capture.id)).toEqual(capture);
    expect(await repos.assets.listByCapture(capture.id)).toEqual([parent]);
    expect(await repos.assets.listRelations(parent.id)).toEqual([relation]);
    expect(await repos.outputs.getById(output.id)).toEqual(output);

    const running = await repos.captures.update({ ...capture, status: "running", startedAt: new Date().toISOString() });
    expect(await repos.captures.getById(capture.id)).toEqual(running);

    await expectCode(
      repos.assets.addRelation({ ...relation, toAssetId: newId() as AssetId }),
      "VALIDATION"
    );

    database.sqlite.prepare("DELETE FROM projects WHERE id = ?").run(project.id);
    expect(await repos.assets.listByProject(project.id)).toEqual([]);
    expect(await repos.outputs.listByProject(project.id)).toEqual([]);
    expect(await repos.jobs.getById(job.id)).toBeNull();
  });

  it("Job: transição persistida, inválida rejeitada sem alterar o registro", async () => {
    const job = await repos.jobs.create(createJob({ type: "capture" }));
    const preparing = await repos.jobs.transition(job.id, "preparing");
    const running = await repos.jobs.transition(job.id, "running", { progress: 30, message: "desktop" });
    expect(running.startedAt).not.toBeNull();
    expect(await repos.jobs.getById(job.id)).toEqual(running);
    expect(preparing.status).toBe("preparing");

    await expectCode(repos.jobs.transition(job.id, "queued"), "INVALID_TRANSITION");
    expect(await repos.jobs.getById(job.id)).toEqual(running);

    const done = await repos.jobs.transition(job.id, "completed");
    expect(done.progress).toBe(100);
    await expectCode(repos.jobs.transition(job.id, "running"), "INVALID_TRANSITION");
    await expectCode(repos.jobs.transition(newId() as typeof job.id, "preparing"), "NOT_FOUND");
  });

  it("nenhuma coluna guarda caminho absoluto (storage_key validada)", async () => {
    const project = await repos.projects.create(createProject({ slug: "p", name: "P", category: "site" }));
    const asset = createAsset({
      projectId: project.id,
      kind: "screenshot",
      storageKey: parseStorageKey(`assets/bb/${SHA}.png`),
      sha256: SHA,
      mimeType: "image/png",
      byteSize: 1,
    });
    await expectCode(
      repos.assets.create({ ...asset, storageKey: "C:/Users/x/a.png" as typeof asset.storageKey }),
      "VALIDATION"
    );
  });
});

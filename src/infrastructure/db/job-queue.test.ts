import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createJob, type Job } from "../../core/jobs/job";
import { createProject, type Project } from "../../core/projects/project";
import { isDomainError, type DomainErrorCode } from "../../shared/errors";
import { openDatabase, type AtlasDatabase } from "./client";
import { createRepositories, type Repositories } from "./repositories";

async function expectCode(promise: Promise<unknown>, code: DomainErrorCode): Promise<void> {
  try {
    await promise;
    expect.unreachable(`esperava ${code}`);
  } catch (err) {
    expect(isDomainError(err, code), String(err)).toBe(true);
  }
}

const tick = () => new Promise((r) => setTimeout(r, 3)); // garante createdAt/heartbeat distintos
const future = () => new Date(Date.now() + 60_000).toISOString();
const past = () => new Date(Date.now() - 60_000).toISOString();

let dir: string;
let dbFile: string;
let database: AtlasDatabase;
let repos: Repositories;
let project: Project;

async function enqueue(projectId: Project["id"] | null = project.id): Promise<Job> {
  await tick();
  return repos.jobs.create(createJob({ type: "capture", projectId }));
}

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "atlas-jobs-"));
  dbFile = path.join(dir, "atlas.db");
  database = openDatabase({ file: dbFile });
  repos = createRepositories(database.db);
  project = await repos.projects.create(createProject({ slug: "p", name: "P", category: "site" }));
});
afterEach(() => {
  database.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("claimNext", () => {
  it("reserva o mais antigo: preparing, lock, heartbeat e attempts", async () => {
    const first = await enqueue(null);
    await enqueue(null);
    const claimed = await repos.jobs.claimNext("w1", ["capture"]);
    expect(claimed).toMatchObject({ id: first.id, status: "preparing", lockedBy: "w1", attempts: 1 });
    expect(claimed?.heartbeatAt).not.toBeNull();
    expect(await repos.jobs.getById(first.id)).toEqual(claimed);
  });

  it("fila vazia, tipos vazios → null", async () => {
    expect(await repos.jobs.claimNext("w1", ["capture"])).toBeNull();
    await enqueue();
    expect(await repos.jobs.claimNext("w1", [])).toBeNull();
  });

  it("dois destrutivos do mesmo projeto nunca ficam ativos juntos; outro projeto segue livre", async () => {
    const other = await repos.projects.create(createProject({ slug: "outro", name: "O", category: "site" }));
    const a = await enqueue();
    const b = await enqueue();
    const c = await enqueue(other.id);

    expect((await repos.jobs.claimNext("w1", ["capture"]))?.id).toBe(a.id);
    // b é do mesmo projeto que a (ativo) → pulado; c é de outro projeto.
    expect((await repos.jobs.claimNext("w2", ["capture"]))?.id).toBe(c.id);
    expect(await repos.jobs.claimNext("w3", ["capture"])).toBeNull();

    await repos.jobs.markRunning(a.id, "w1");
    await repos.jobs.finish(a.id, "w1", { status: "completed", result: {} });
    expect((await repos.jobs.claimNext("w3", ["capture"]))?.id).toBe(b.id);
  });

  it("índice único parcial barra no banco um segundo destrutivo ativo", async () => {
    const a = await enqueue();
    const b = await enqueue();
    await repos.jobs.claimNext("w1", ["capture"]);
    expect(() =>
      database.sqlite.prepare("UPDATE jobs SET status = 'running' WHERE id = ?").run(b.id)
    ).toThrow(/UNIQUE/);
    expect((await repos.jobs.getById(a.id))?.status).toBe("preparing");
  });

  it("corrida entre 4 processos: cada job é reservado exatamente uma vez", async () => {
    const total = 40;
    for (let i = 0; i < total; i++) await repos.jobs.create(createJob({ type: "capture", projectId: null }));
    const goFile = path.join(dir, "go");
    const script = path.join(__dirname, "__fixtures__", "claim-race-worker.ts");

    const children = Array.from({ length: 4 }, (_, i) => {
      const child = spawn(process.execPath, ["--import", "tsx", script, dbFile, `proc-${i}`, goFile], {
        cwd: process.cwd(),
      });
      let out = "";
      let err = "";
      child.stdout.on("data", (d: Buffer) => (out += d.toString()));
      child.stderr.on("data", (d: Buffer) => (err += d.toString()));
      const ready = new Promise<void>((resolve) => {
        const check = () => (out.includes("ready") ? resolve() : setTimeout(check, 10));
        check();
      });
      const done = new Promise<string[]>((resolve, reject) =>
        child.on("close", (code) =>
          code === 0 ? resolve(JSON.parse(out.trim().split("\n").pop() ?? "[]") as string[]) : reject(new Error(err))
        )
      );
      return { ready, done };
    });

    await Promise.all(children.map((c) => c.ready));
    writeFileSync(goFile, "");
    const results = await Promise.all(children.map((c) => c.done));

    const all = results.flat();
    // houve disputa de verdade (não foi um processo esvaziando a fila sozinho)
    expect(results.filter((r) => r.length > 0).length).toBeGreaterThanOrEqual(3);
    expect(all).toHaveLength(total);
    expect(new Set(all).size).toBe(total);
    const rows = database.sqlite.prepare("SELECT status, attempts FROM jobs").all() as { status: string; attempts: number }[];
    expect(rows.every((r) => r.status === "completed" && r.attempts === 1)).toBe(true);
  }, 60_000);
});

describe("dono do job", () => {
  it("heartbeat/progresso só valem para o dono", async () => {
    const job = await enqueue();
    await repos.jobs.claimNext("w1", ["capture"]);
    await repos.jobs.markRunning(job.id, "w1");

    expect(await repos.jobs.reportProgress(job.id, "w1", 42.4, "desktop")).toEqual({ owned: true, cancelRequested: false });
    expect(await repos.jobs.getById(job.id)).toMatchObject({ progress: 42, message: "desktop" });

    expect(await repos.jobs.reportProgress(job.id, "intruso", 99)).toEqual({ owned: false, cancelRequested: false });
    expect(await repos.jobs.heartbeat(job.id, "intruso")).toEqual({ owned: false, cancelRequested: false });
    expect((await repos.jobs.getById(job.id))?.progress).toBe(42);

    await expectCode(repos.jobs.markRunning(job.id, "intruso"), "CONFLICT");
    await expectCode(repos.jobs.finish(job.id, "intruso", { status: "completed", result: {} }), "CONFLICT");
  });

  it("progresso é limitado a 0–100", async () => {
    const job = await enqueue();
    await repos.jobs.claimNext("w1", ["capture"]);
    await repos.jobs.reportProgress(job.id, "w1", 150);
    expect((await repos.jobs.getById(job.id))?.progress).toBe(100);
    await repos.jobs.reportProgress(job.id, "w1", -5);
    expect((await repos.jobs.getById(job.id))?.progress).toBe(0);
  });

  it("finish grava resultado ou erro; terminal não aceita mais nada", async () => {
    const job = await enqueue();
    await repos.jobs.claimNext("w1", ["capture"]);
    await repos.jobs.markRunning(job.id, "w1");
    const failed = await repos.jobs.finish(job.id, "w1", {
      status: "failed",
      error: { code: "CAPTURE_FAILED", message: "site fora do ar" },
    });
    expect(failed).toMatchObject({ status: "failed", error: { code: "CAPTURE_FAILED" } });
    expect(failed.finishedAt).not.toBeNull();
    expect(await repos.jobs.heartbeat(job.id, "w1")).toEqual({ owned: false, cancelRequested: false });
    await expectCode(repos.jobs.finish(job.id, "w1", { status: "completed", result: {} }), "CONFLICT");
  });
});

describe("requestCancel", () => {
  it("queued → cancelled na hora", async () => {
    const job = await enqueue();
    const cancelled = await repos.jobs.requestCancel(job.id);
    expect(cancelled).toMatchObject({ status: "cancelled", error: { code: "CANCELLED" } });
    expect(cancelled.cancelRequestedAt).not.toBeNull();
    expect(await repos.jobs.claimNext("w1", ["capture"])).toBeNull();
  });

  it("ativo → pedido persistido que o dono enxerga no heartbeat e no progresso", async () => {
    const job = await enqueue();
    await repos.jobs.claimNext("w1", ["capture"]);
    await repos.jobs.markRunning(job.id, "w1");
    const requested = await repos.jobs.requestCancel(job.id);
    expect(requested.status).toBe("running");
    expect(requested.cancelRequestedAt).not.toBeNull();
    expect(await repos.jobs.heartbeat(job.id, "w1")).toEqual({ owned: true, cancelRequested: true });
    expect(await repos.jobs.reportProgress(job.id, "w1", 50)).toEqual({ owned: true, cancelRequested: true });
    // idempotente
    expect((await repos.jobs.requestCancel(job.id)).cancelRequestedAt).toBe(requested.cancelRequestedAt);
  });

  it("terminal → sem mudança", async () => {
    const job = await enqueue();
    await repos.jobs.claimNext("w1", ["capture"]);
    await repos.jobs.markRunning(job.id, "w1");
    const done = await repos.jobs.finish(job.id, "w1", { status: "completed", result: {} });
    expect(await repos.jobs.requestCancel(job.id)).toEqual(done);
  });

  it("job inexistente → NOT_FOUND", async () => {
    const job = createJob({ type: "capture" });
    await expectCode(repos.jobs.requestCancel(job.id), "NOT_FOUND");
  });
});

describe("recoverStale + reinício", () => {
  it("ativos sem heartbeat recente viram failed (STALE) ou cancelled; o resto fica intacto", async () => {
    const other = await repos.projects.create(createProject({ slug: "o", name: "O", category: "site" }));
    const staleRunning = await enqueue();
    const staleCancelled = await enqueue(other.id);
    const queued = await enqueue(null);

    await repos.jobs.claimNext("morto", ["capture"]);
    await repos.jobs.markRunning(staleRunning.id, "morto");
    await repos.jobs.claimNext("morto", ["capture"]);
    await repos.jobs.requestCancel(staleCancelled.id);

    expect(await repos.jobs.recoverStale(past())).toEqual([]); // heartbeats são recentes
    const recovered = await repos.jobs.recoverStale(future());
    expect(recovered.map((j) => [j.id, j.status, j.error?.code])).toEqual([
      [staleRunning.id, "failed", "STALE"],
      [staleCancelled.id, "cancelled", "CANCELLED"],
    ]);
    expect((await repos.jobs.getById(queued.id))?.status).toBe("queued");
    // projeto liberado: o destrutivo seguinte pode rodar
    const next = await enqueue();
    expect((await repos.jobs.claimNext("novo", ["capture"]))?.id).toBe(queued.id);
    expect((await repos.jobs.claimNext("novo", ["capture"]))?.id).toBe(next.id);
  });

  it("estado da fila sobrevive a fechar e reabrir o banco", async () => {
    const job = await enqueue();
    await repos.jobs.claimNext("w1", ["capture"]);
    await repos.jobs.markRunning(job.id, "w1");
    await repos.jobs.reportProgress(job.id, "w1", 30, "mobile");
    const before = await repos.jobs.getById(job.id);

    database.close();
    database = openDatabase({ file: dbFile });
    repos = createRepositories(database.db);

    expect(await repos.jobs.getById(job.id)).toEqual(before);
    const [recovered] = await repos.jobs.recoverStale(future());
    expect(recovered).toMatchObject({ id: job.id, status: "failed", progress: 30 });
  });
});

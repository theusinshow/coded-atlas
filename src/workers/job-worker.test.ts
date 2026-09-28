import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createJob, type Job } from "../core/jobs/job";
import { createProject, type Project } from "../core/projects/project";
import { openDatabase, type AtlasDatabase } from "../infrastructure/db/client";
import { createRepositories, type Repositories } from "../infrastructure/db/repositories";
import { DomainError } from "../shared/errors";
import { JobWorker, type JobHandler, type JobHandlers } from "./job-worker";

const FAST = { pollIntervalMs: 10, heartbeatIntervalMs: 10, staleAfterMs: 5_000 };

let dir: string;
let database: AtlasDatabase;
let repos: Repositories;
let project: Project;

function worker(handlers: JobHandlers, extra: Partial<typeof FAST> = {}): JobWorker {
  return new JobWorker({ jobs: repos.jobs, handlers, ...FAST, ...extra });
}

async function enqueue(): Promise<Job> {
  return repos.jobs.create(createJob({ type: "capture", projectId: project.id, payload: { url: "https://x.example" } }));
}

/** Espera até `predicate` ser verdade (ou falha após `ms`). */
async function until(predicate: () => Promise<boolean> | boolean, ms = 3_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error("timeout esperando condição");
    await new Promise((r) => setTimeout(r, 5));
  }
}

/**
 * Handler que simula trabalho real ligado ao signal (como o Chromium: fechar o
 * navegador no abort faz a operação em andamento rejeitar) e registra o cleanup.
 */
function blockingHandler(state: { started: boolean; cleanedUp: boolean }): JobHandler {
  return {
    run: async (ctx) => {
      state.started = true;
      try {
        await new Promise<never>((_resolve, reject) => {
          ctx.signal.addEventListener("abort", () => reject(new Error("Target page, context or browser has been closed")), {
            once: true,
          });
        });
      } finally {
        state.cleanedUp = true;
      }
    },
  };
}

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "atlas-worker-"));
  database = openDatabase({ file: path.join(dir, "atlas.db") });
  repos = createRepositories(database.db);
  project = await repos.projects.create(createProject({ slug: "p", name: "P", category: "site" }));
});
afterEach(() => {
  database.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("JobWorker.runOnce", () => {
  it("executa, persiste progresso e conclui com o resultado do handler", async () => {
    const job = await enqueue();
    const seen: Job["status"][] = [];
    const done = await worker({
      capture: {
        run: async (ctx) => {
          seen.push((await repos.jobs.getById(ctx.job.id))!.status);
          await ctx.progress(40, "desktop");
          const mid = await repos.jobs.getById(ctx.job.id);
          expect(mid).toMatchObject({ progress: 40, message: "desktop" });
          return { assets: 2 };
        },
      },
    }).runOnce();

    expect(seen).toEqual(["running"]);
    expect(done).toMatchObject({ id: job.id, status: "completed", progress: 100, result: { assets: 2 }, error: null });
    expect(done?.startedAt).not.toBeNull();
    expect(done?.finishedAt).not.toBeNull();
  });

  it("sem job elegível → null; sem handler para o tipo → job não é reservado", async () => {
    expect(await worker({ capture: { run: async () => undefined } }).runOnce()).toBeNull();
    const job = await enqueue();
    expect(await worker({}).runOnce()).toBeNull();
    expect((await repos.jobs.getById(job.id))?.status).toBe("queued");
  });

  it("erro do handler → failed com código do DomainError ou HANDLER_FAILED", async () => {
    await enqueue();
    const failed = await worker({
      capture: { run: async () => Promise.reject(new DomainError("VALIDATION", "payload ruim")) },
    }).runOnce();
    expect(failed).toMatchObject({ status: "failed", error: { code: "VALIDATION", message: "payload ruim" } });

    await enqueue();
    const crashed = await worker({ capture: { run: async () => Promise.reject(new TypeError("boom")) } }).runOnce();
    expect(crashed).toMatchObject({ status: "failed", error: { code: "HANDLER_FAILED", message: "boom" } });
  });

  it("cancelamento pedido durante a execução chega ao trabalho real, limpa e termina cancelled", async () => {
    const job = await enqueue();
    const state = { started: false, cleanedUp: false };
    const running = worker({ capture: blockingHandler(state) }).runOnce();

    await until(() => state.started);
    await repos.jobs.requestCancel(job.id); // o que a API fará: só persiste o pedido
    const final = await running;

    expect(state.cleanedUp).toBe(true);
    expect(final).toMatchObject({ status: "cancelled", error: { code: "CANCELLED" } });
  });

  it("cancelamento também é notado no progresso (sem esperar o heartbeat)", async () => {
    const job = await enqueue();
    let abortedAfterProgress = false;
    const final = await worker(
      {
        capture: {
          run: async (ctx) => {
            await repos.jobs.requestCancel(job.id);
            await ctx.progress(10);
            abortedAfterProgress = ctx.signal.aborted;
            ctx.throwIfAborted();
          },
        },
      },
      { heartbeatIntervalMs: 60_000 }
    ).runOnce();
    expect(abortedAfterProgress).toBe(true);
    expect(final?.status).toBe("cancelled");
  });

  it("timeout aborta o trabalho e falha com TIMEOUT", async () => {
    await enqueue();
    const state = { started: false, cleanedUp: false };
    const final = await worker({ capture: { ...blockingHandler(state), timeoutMs: 30 } }).runOnce();
    expect(state.cleanedUp).toBe(true);
    expect(final).toMatchObject({ status: "failed", error: { code: "TIMEOUT" } });
  });

  it("se outro processo assumiu o job (lock perdido), o worker aborta e não sobrescreve", async () => {
    const job = await enqueue();
    const state = { started: false, cleanedUp: false };
    const running = worker({ capture: blockingHandler(state) }).runOnce();
    await until(() => state.started);

    // Outro processo acha que este worker morreu:
    await repos.jobs.recoverStale(new Date(Date.now() + 60_000).toISOString());
    const final = await running;

    expect(state.cleanedUp).toBe(true);
    expect(final).toMatchObject({ id: job.id, status: "failed", error: { code: "STALE" } });
    expect(await repos.jobs.getById(job.id)).toEqual(final);
  });
});

describe("JobWorker loop", () => {
  it("start processa a fila em ordem; stop interrompe o job atual como INTERRUPTED", async () => {
    const other = await repos.projects.create(createProject({ slug: "o", name: "O", category: "site" }));
    const first = await enqueue();
    const second = await repos.jobs.create(createJob({ type: "capture", projectId: other.id }));
    const order: string[] = [];
    const state = { started: false, cleanedUp: false };
    const blocking = blockingHandler(state);

    const w = worker({
      capture: {
        run: async (ctx) => {
          order.push(ctx.job.id);
          if (ctx.job.id === second.id) return blocking.run(ctx);
        },
      },
    });
    w.start();
    await until(() => state.started);
    await w.stop();

    expect(order).toEqual([first.id, second.id]);
    expect((await repos.jobs.getById(first.id))?.status).toBe("completed");
    expect(await repos.jobs.getById(second.id)).toMatchObject({ status: "failed", error: { code: "INTERRUPTED" } });
    expect(state.cleanedUp).toBe(true);
  });

  it("ao iniciar, recupera jobs abandonados por um worker morto e segue a fila", async () => {
    const orphan = await enqueue();
    await repos.jobs.claimNext("worker-morto", ["capture"]);
    await repos.jobs.markRunning(orphan.id, "worker-morto");
    const next = await enqueue(); // mesmo projeto: bloqueado até o órfão ser resolvido

    const w = worker({ capture: { run: async () => ({ ok: true }) } }, { staleAfterMs: -1_000 });
    w.start();
    await until(async () => (await repos.jobs.getById(next.id))?.status === "completed");
    await w.stop();

    expect(await repos.jobs.getById(orphan.id)).toMatchObject({ status: "failed", error: { code: "STALE" } });
  });

  it("recupera também órfãos que só ficam stale depois que o worker já subiu", async () => {
    const orphan = await enqueue();
    await repos.jobs.claimNext("worker-morto", ["capture"]);
    await repos.jobs.markRunning(orphan.id, "worker-morto"); // heartbeat fresco: ainda não é stale

    const w = worker({ capture: { run: async () => undefined } }, { staleAfterMs: 150 });
    w.start();
    await new Promise((r) => setTimeout(r, 40));
    expect((await repos.jobs.getById(orphan.id))?.status).toBe("running"); // no start ainda não venceu
    await until(async () => (await repos.jobs.getById(orphan.id))?.status === "failed");
    await w.stop();
    expect((await repos.jobs.getById(orphan.id))?.error?.code).toBe("STALE");
  });

  it("cancelamento pedido entre o claim e o início não chama o handler", async () => {
    const job = await enqueue();
    let called = false;
    const jobs = repos.jobs;
    // Intercepta markRunning para simular o pedido chegando nesse intervalo.
    const racing = Object.create(jobs) as typeof jobs;
    racing.markRunning = async (id, workerId) => {
      await jobs.requestCancel(id);
      return jobs.markRunning(id, workerId);
    };
    const final = await new JobWorker({
      jobs: racing,
      handlers: { capture: { run: async () => void (called = true) } },
      ...FAST,
    }).runOnce();
    expect(called).toBe(false);
    expect(final).toMatchObject({ id: job.id, status: "cancelled" });
  });
});

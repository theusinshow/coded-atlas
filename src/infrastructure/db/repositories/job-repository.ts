import { and, asc, eq, inArray, isNull, lt, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import {
  ACTIVE_JOB_STATUSES,
  JobSchema,
  transitionJob,
  type Job,
  type JobStatus,
  type JobTransitionPatch,
  type JobType,
} from "../../../core/jobs/job";
import type { JobOutcome, JobPulse, JobRepository } from "../../../core/jobs/repository";
import { DomainError } from "../../../shared/errors";
import type { JobId, ProjectId } from "../../../shared/id";
import { nowIso, parseOrThrow, type Timestamp } from "../../../shared/validation";
import type { AtlasDb } from "../client";
import { jobs } from "../schema";
import { run, toDomain } from "./support";

type Tx = Parameters<Parameters<AtlasDb["transaction"]>[0]>[0];

const activeJobs = alias(jobs, "active_jobs");
const NOT_OWNED: JobPulse = { owned: false, cancelRequested: false };

export class SqliteJobRepository implements JobRepository {
  constructor(private readonly db: AtlasDb) {}

  async create(job: Job): Promise<Job> {
    const value = parseOrThrow(JobSchema, job, "Job");
    run("Job", () => this.db.insert(jobs).values(value).run());
    return value;
  }

  async getById(id: JobId): Promise<Job | null> {
    const row = run("Job", () => this.db.select().from(jobs).where(eq(jobs.id, id)).get());
    return row ? toDomain(JobSchema, row, "Job") : null;
  }

  async listByProject(projectId: ProjectId): Promise<Job[]> {
    const rows = run("Job", () =>
      this.db.select().from(jobs).where(eq(jobs.projectId, projectId)).orderBy(asc(jobs.id)).all()
    );
    return rows.map((row) => toDomain(JobSchema, row, "Job"));
  }

  async transition(id: JobId, to: JobStatus, patch: JobTransitionPatch = {}): Promise<Job> {
    return this.write((tx) => save(tx, transitionJob(load(tx, id), to, patch)));
  }

  async claimNext(workerId: string, types: readonly JobType[]): Promise<Job | null> {
    if (types.length === 0) return null;
    return this.write((tx) => {
      const row = tx
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.status, "queued"),
            inArray(jobs.type, [...types]),
            or(
              eq(jobs.destructive, false),
              isNull(jobs.projectId),
              notExists(
                tx
                  .select({ one: sql`1` })
                  .from(activeJobs)
                  .where(
                    and(
                      eq(activeJobs.projectId, jobs.projectId),
                      eq(activeJobs.destructive, true),
                      inArray(activeJobs.status, [...ACTIVE_JOB_STATUSES])
                    )
                  )
              )
            )
          )
        )
        .orderBy(asc(jobs.createdAt), asc(jobs.id))
        .limit(1)
        .get();
      if (!row) return null;

      const job = transitionJob(toDomain(JobSchema, row, "Job"), "preparing");
      return save(tx, { ...job, attempts: job.attempts + 1, lockedBy: workerId, lockedAt: job.updatedAt, heartbeatAt: job.updatedAt });
    });
  }

  async markRunning(id: JobId, workerId: string): Promise<Job> {
    return this.write((tx) => save(tx, transitionJob(loadOwned(tx, id, workerId), "running")));
  }

  async heartbeat(id: JobId, workerId: string): Promise<JobPulse> {
    return this.write((tx) => {
      const job = load(tx, id);
      if (!isOwner(job, workerId)) return NOT_OWNED;
      tx.update(jobs).set({ heartbeatAt: nowIso() }).where(eq(jobs.id, id)).run();
      return { owned: true, cancelRequested: job.cancelRequestedAt !== null };
    });
  }

  async reportProgress(id: JobId, workerId: string, progress: number, message?: string | null): Promise<JobPulse> {
    return this.write((tx) => {
      const job = load(tx, id);
      if (!isOwner(job, workerId)) return NOT_OWNED;
      const now = nowIso();
      save(tx, {
        ...job,
        progress: Math.max(0, Math.min(100, Math.round(progress))),
        ...(message === undefined ? {} : { message: message === null ? null : message.slice(0, 500) }),
        heartbeatAt: now,
        updatedAt: now,
      });
      return { owned: true, cancelRequested: job.cancelRequestedAt !== null };
    });
  }

  async finish(id: JobId, workerId: string, outcome: JobOutcome): Promise<Job> {
    return this.write((tx) => {
      const job = loadOwned(tx, id, workerId);
      const patch: JobTransitionPatch =
        outcome.status === "completed" ? { result: outcome.result, error: null } : { error: outcome.error };
      return save(tx, transitionJob(job, outcome.status, patch));
    });
  }

  async requestCancel(id: JobId): Promise<Job> {
    return this.write((tx) => {
      const job = load(tx, id);
      if (job.status === "queued") {
        const cancelled = transitionJob(job, "cancelled", {
          error: { code: "CANCELLED", message: "Cancelado antes de começar." },
        });
        return save(tx, { ...cancelled, cancelRequestedAt: cancelled.updatedAt });
      }
      if (isActive(job) && job.cancelRequestedAt === null) {
        const now = nowIso();
        return save(tx, { ...job, cancelRequestedAt: now, updatedAt: now });
      }
      return job; // terminal ou já pedido: idempotente
    });
  }

  async recoverStale(staleBefore: Timestamp): Promise<Job[]> {
    return this.write((tx) => {
      const rows = tx
        .select()
        .from(jobs)
        .where(
          and(
            inArray(jobs.status, [...ACTIVE_JOB_STATUSES]),
            or(isNull(jobs.heartbeatAt), lt(jobs.heartbeatAt, staleBefore))
          )
        )
        .orderBy(asc(jobs.id))
        .all();
      return rows.map((row) => {
        const job = toDomain(JobSchema, row, "Job");
        return save(
          tx,
          job.cancelRequestedAt !== null
            ? transitionJob(job, "cancelled", {
                error: { code: "CANCELLED", message: "Cancelado; o worker parou antes de confirmar." },
              })
            : transitionJob(job, "failed", {
                error: { code: "STALE", message: "O worker parou de responder (processo encerrado?)." },
              })
        );
      });
    });
  }

  /** Transação síncrona IMMEDIATE: pega o lock de escrita antes de ler — atômico entre processos. */
  private write<T>(op: (tx: Tx) => T): Promise<T> {
    return Promise.resolve(run("Job", () => this.db.transaction(op, { behavior: "immediate" })));
  }
}

function load(tx: Tx, id: JobId): Job {
  const row = tx.select().from(jobs).where(eq(jobs.id, id)).get();
  if (!row) throw new DomainError("NOT_FOUND", `Job ${id} não existe.`, { id });
  return toDomain(JobSchema, row, "Job");
}

function loadOwned(tx: Tx, id: JobId, workerId: string): Job {
  const job = load(tx, id);
  if (!isOwner(job, workerId)) {
    throw new DomainError("CONFLICT", `Worker ${workerId} não detém mais o job ${id}.`, {
      id,
      workerId,
      lockedBy: job.lockedBy,
      status: job.status,
    });
  }
  return job;
}

function isActive(job: Job): boolean {
  return (ACTIVE_JOB_STATUSES as readonly JobStatus[]).includes(job.status);
}

function isOwner(job: Job, workerId: string): boolean {
  return isActive(job) && job.lockedBy === workerId;
}

/** Valida e grava o estado inteiro (id e createdAt nunca mudam). */
function save(tx: Tx, job: Job): Job {
  const value = parseOrThrow(JobSchema, job, "Job");
  tx.update(jobs)
    .set({ ...value, id: undefined, createdAt: undefined })
    .where(eq(jobs.id, value.id))
    .run();
  return value;
}

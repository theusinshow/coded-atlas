import { asc, eq } from "drizzle-orm";
import { JobSchema, transitionJob, type Job, type JobStatus, type JobTransitionPatch } from "../../../core/jobs/job";
import type { JobRepository } from "../../../core/jobs/repository";
import { DomainError } from "../../../shared/errors";
import type { JobId, ProjectId } from "../../../shared/id";
import { parseOrThrow } from "../../../shared/validation";
import type { AtlasDb } from "../client";
import { jobs } from "../schema";
import { run, toDomain } from "./support";

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
    // Transação síncrona (better-sqlite3): ler + validar + gravar sem intercalação.
    return run("Job", () =>
      this.db.transaction((tx) => {
        const row = tx.select().from(jobs).where(eq(jobs.id, id)).get();
        if (!row) throw new DomainError("NOT_FOUND", `Job ${id} não existe.`, { id });
        const next = transitionJob(toDomain(JobSchema, row, "Job"), to, patch);
        tx.update(jobs)
          .set({ ...next, id: undefined, createdAt: undefined })
          .where(eq(jobs.id, id))
          .run();
        return next;
      })
    );
  }
}

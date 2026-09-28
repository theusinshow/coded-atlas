import { z } from "zod";
import { newId, JobIdSchema, ProjectIdSchema, type ProjectId } from "../../shared/id";
import { DomainError } from "../../shared/errors";
import { TimestampSchema, nowIso, parseOrThrow } from "../../shared/validation";

/**
 * Job: unidade de trabalho pesado executada fora da request HTTP por um worker
 * local (src/workers). Estado, lock, heartbeat, progresso e pedido de
 * cancelamento são persistidos no SQLite — sobrevivem a reinício de processo.
 */
export const JobTypeSchema = z.enum(["capture", "import", "render", "plan", "copy", "export", "diff"]);
export type JobType = z.infer<typeof JobTypeSchema>;

/**
 * Destrutivo = substitui o estado válido de um projeto (ex.: recaptura). Dois jobs
 * destrutivos do mesmo projeto nunca rodam ao mesmo tempo (claim + índice único parcial).
 */
export const JOB_TYPE_POLICY: Record<JobType, { destructive: boolean }> = {
  capture: { destructive: true },
  import: { destructive: false }, // importação v1: só lê o legado e cria registros novos
  render: { destructive: false }, // render só cria Outputs novos (imutáveis)
  plan: { destructive: false }, // Atlas Brain: só cria um plano (rascunho), nada é aplicado sozinho
  copy: { destructive: false }, // Atlas Brain: preenche só trechos vazios do case (revisão nova)
  export: { destructive: false }, // entrega: lê Outputs e grava fora (ZIP novo, pasta nova, commit)
  diff: { destructive: false }, // diff visual: só cria um Asset derivado novo
};

export const JobStatusSchema = z.enum(["queued", "preparing", "running", "completed", "failed", "cancelled"]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const TERMINAL_JOB_STATUSES: readonly JobStatus[] = ["completed", "failed", "cancelled"];
/** Estados em que um worker detém o job (lock + heartbeat). */
export const ACTIVE_JOB_STATUSES = ["preparing", "running"] as const satisfies readonly JobStatus[];

const TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  queued: ["preparing", "failed", "cancelled"],
  preparing: ["running", "failed", "cancelled"],
  running: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL_JOB_STATUSES.includes(status);
}

const JsonObjectSchema = z.record(z.string(), z.unknown());

export const JobErrorSchema = z.strictObject({
  code: z.string().min(1).max(60),
  message: z.string().max(2000),
});
export type JobError = z.infer<typeof JobErrorSchema>;

export const JobSchema = z.strictObject({
  id: JobIdSchema,
  projectId: ProjectIdSchema.nullable(),
  type: JobTypeSchema,
  status: JobStatusSchema,
  destructive: z.boolean(),
  progress: z.number().int().min(0).max(100),
  message: z.string().max(500).nullable(),
  payload: JsonObjectSchema,
  result: JsonObjectSchema.nullable(),
  error: JobErrorSchema.nullable(),
  attempts: z.number().int().nonnegative(),
  cancelRequestedAt: TimestampSchema.nullable(),
  lockedBy: z.string().max(120).nullable(),
  lockedAt: TimestampSchema.nullable(),
  heartbeatAt: TimestampSchema.nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  startedAt: TimestampSchema.nullable(),
  finishedAt: TimestampSchema.nullable(),
});
export type Job = z.infer<typeof JobSchema>;

export interface NewJobInput {
  type: JobType;
  projectId?: ProjectId | null;
  payload?: Record<string, unknown>;
}

export function createJob(input: NewJobInput): Job {
  const now = nowIso();
  return parseOrThrow(
    JobSchema,
    {
      id: newId(),
      projectId: input.projectId ?? null,
      type: input.type,
      status: "queued",
      destructive: JOB_TYPE_POLICY[input.type].destructive,
      progress: 0,
      message: null,
      payload: input.payload ?? {},
      result: null,
      error: null,
      attempts: 0,
      cancelRequestedAt: null,
      lockedBy: null,
      lockedAt: null,
      heartbeatAt: null,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      finishedAt: null,
    },
    "Job"
  );
}

export interface JobTransitionPatch {
  progress?: number;
  message?: string | null;
  result?: Record<string, unknown> | null;
  error?: JobError | null;
}

/**
 * Aplica uma transição de estado (pura). Lança INVALID_TRANSITION se a mudança
 * não for permitida. Preenche `startedAt` ao entrar em running e `finishedAt`
 * ao chegar num estado terminal; `completed` força progresso 100.
 */
export function transitionJob(job: Job, to: JobStatus, patch: JobTransitionPatch = {}): Job {
  if (!canTransition(job.status, to)) {
    throw new DomainError("INVALID_TRANSITION", `Job ${job.id}: ${job.status} → ${to} não é permitido`, {
      jobId: job.id,
      from: job.status,
      to,
    });
  }
  const now = nowIso();
  return parseOrThrow(
    JobSchema,
    {
      ...job,
      ...patch,
      status: to,
      progress: to === "completed" ? 100 : (patch.progress ?? job.progress),
      updatedAt: now,
      startedAt: to === "running" && job.startedAt === null ? now : job.startedAt,
      finishedAt: isTerminal(to) ? now : null,
    },
    "Job"
  );
}

import type { JobId, ProjectId } from "../../shared/id";
import type { Timestamp } from "../../shared/validation";
import type { Job, JobError, JobStatus, JobTransitionPatch, JobType } from "./job";

/** Resposta de um sinal de vida do worker: ainda é dono do job? pediram cancelamento? */
export interface JobPulse {
  owned: boolean;
  cancelRequested: boolean;
}

export type JobOutcome =
  | { status: "completed"; result: Record<string, unknown> }
  | { status: "failed"; error: JobError }
  | { status: "cancelled"; error: JobError };

export interface JobQuery {
  types?: readonly JobType[];
  statuses?: readonly JobStatus[];
  projectId?: ProjectId;
  limit?: number;
}

export interface JobRepository {
  create(job: Job): Promise<Job>;
  getById(id: JobId): Promise<Job | null>;
  listByProject(projectId: ProjectId): Promise<Job[]>;
  /** Mais recentes primeiro. */
  listRecent(query?: JobQuery): Promise<Job[]>;
  /**
   * Transição administrativa (sem checar dono). Lê, aplica `transitionJob` e grava
   * atomicamente. NOT_FOUND / INVALID_TRANSITION.
   */
  transition(id: JobId, to: JobStatus, patch?: JobTransitionPatch): Promise<Job>;

  // ── Fila ──────────────────────────────────────────────────────────────────
  /**
   * Reserva atomicamente (BEGIN IMMEDIATE — vale entre processos) o job `queued`
   * mais antigo de um dos `types`, pulando destrutivos cujo projeto já tem outro
   * destrutivo ativo. queued → preparing, grava lock/heartbeat, incrementa attempts.
   */
  claimNext(workerId: string, types: readonly JobType[]): Promise<Job | null>;
  /** preparing → running (só o dono). */
  markRunning(id: JobId, workerId: string): Promise<Job>;
  /** Renova o heartbeat se `workerId` ainda for o dono. */
  heartbeat(id: JobId, workerId: string): Promise<JobPulse>;
  /** Persiste progresso (0–100) e mensagem se `workerId` ainda for o dono; renova o heartbeat. */
  reportProgress(id: JobId, workerId: string, progress: number, message?: string | null): Promise<JobPulse>;
  /** Estado final gravado pelo dono. CONFLICT se o lock foi perdido. */
  finish(id: JobId, workerId: string, outcome: JobOutcome): Promise<Job>;
  /**
   * Pedido de cancelamento persistido. queued → cancelled na hora; ativo → marca
   * `cancelRequestedAt` para o worker observar; terminal → devolve sem mudar.
   */
  requestCancel(id: JobId): Promise<Job>;
  /**
   * Jobs ativos cujo heartbeat é anterior a `staleBefore` (worker morto): viram
   * `failed` (STALE), ou `cancelled` se já havia pedido de cancelamento.
   */
  recoverStale(staleBefore: Timestamp): Promise<Job[]>;
}

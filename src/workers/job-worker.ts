import type { Job, JobError, JobType } from "../core/jobs/job";
import type { JobOutcome, JobRepository } from "../core/jobs/repository";
import { DomainError, isDomainError } from "../shared/errors";
import { newId } from "../shared/id";
import { silentLogger, type Logger } from "../shared/logger";

/**
 * O que um handler de job recebe. O contrato de cancelamento é o `signal`:
 * ele aborta quando o usuário pede cancelamento (observado via heartbeat ou
 * progresso), quando o tempo máximo estoura ou quando o worker é desligado.
 * O handler deve repassá-lo ao trabalho real (ex.: fechar o Chromium no abort)
 * e limpar o que criou.
 */
export interface JobContext {
  readonly job: Job;
  readonly signal: AbortSignal;
  readonly logger: Logger;
  /** Persiste progresso 0–100 (+ mensagem) e aproveita para checar cancelamento. */
  progress(progress: number, message?: string): Promise<void>;
  /** Lança o motivo do abort se o job já foi interrompido. */
  throwIfAborted(): void;
}

export interface JobHandler {
  run(ctx: JobContext): Promise<Record<string, unknown> | void>;
  /** Tempo máximo; ao estourar, o signal aborta com TIMEOUT e o job falha. */
  timeoutMs?: number;
}

export type JobHandlers = Partial<Record<JobType, JobHandler>>;

export const DEFAULT_WORKER_TIMING = {
  pollIntervalMs: 1_000,
  heartbeatIntervalMs: 2_000,
  /** Sem heartbeat há mais que isso = worker morto. Bem acima do intervalo de heartbeat. */
  staleAfterMs: 30_000,
} as const;

export interface JobWorkerOptions {
  jobs: JobRepository;
  handlers: JobHandlers;
  workerId?: string;
  logger?: Logger;
  pollIntervalMs?: number;
  heartbeatIntervalMs?: number;
  staleAfterMs?: number;
}

/** Motivos de abort — viram o estado final do job. */
type AbortReason =
  | { kind: "cancelled" }
  | { kind: "timeout"; timeoutMs: number }
  | { kind: "shutdown" }
  | { kind: "lost-lock" };

const ABORT_ERRORS: Record<AbortReason["kind"], (reason: AbortReason) => DomainError> = {
  cancelled: () => new DomainError("CANCELLED", "Job cancelado."),
  timeout: (r) =>
    new DomainError("TIMEOUT", "Job excedeu o tempo máximo.", r.kind === "timeout" ? { timeoutMs: r.timeoutMs } : {}),
  shutdown: () => new DomainError("CANCELLED", "Worker desligado durante o job."),
  "lost-lock": () => new DomainError("CONFLICT", "Worker perdeu o controle do job."),
};

/**
 * Executor local de jobs persistidos. Roda em qualquer processo Node, sem
 * depender de request HTTP: reserva um job por vez no SQLite, mantém o heartbeat,
 * repassa cancelamento/timeout/desligamento via AbortSignal e grava o estado final.
 */
export class JobWorker {
  readonly workerId: string;
  private readonly jobs: JobRepository;
  private readonly handlers: JobHandlers;
  private readonly logger: Logger;
  private readonly timing: { pollIntervalMs: number; heartbeatIntervalMs: number; staleAfterMs: number };
  private abortCurrent: ((reason: AbortReason) => void) | null = null;
  private loop: Promise<void> | null = null;
  private stopping = false;
  private wake: (() => void) | null = null;

  constructor(options: JobWorkerOptions) {
    this.jobs = options.jobs;
    this.handlers = options.handlers;
    this.workerId = options.workerId ?? `worker-${newId()}`;
    this.logger = (options.logger ?? silentLogger).child(this.workerId);
    this.timing = {
      pollIntervalMs: options.pollIntervalMs ?? DEFAULT_WORKER_TIMING.pollIntervalMs,
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? DEFAULT_WORKER_TIMING.heartbeatIntervalMs,
      staleAfterMs: options.staleAfterMs ?? DEFAULT_WORKER_TIMING.staleAfterMs,
    };
  }

  /** Marca como falhos/cancelados os jobs deixados por workers mortos. */
  async recoverStale(): Promise<Job[]> {
    const staleBefore = new Date(Date.now() - this.timing.staleAfterMs).toISOString();
    const recovered = await this.jobs.recoverStale(staleBefore);
    for (const job of recovered) this.logger.warn("job abandonado recuperado", { jobId: job.id, status: job.status });
    return recovered;
  }

  /** Recupera jobs abandonados e passa a processar a fila até `stop()`. */
  start(): void {
    if (this.loop) return;
    this.stopping = false;
    this.loop = this.runLoop();
  }

  /** Para de pegar jobs; o job em execução é interrompido (falha como INTERRUPTED). */
  async stop(): Promise<void> {
    this.stopping = true;
    this.abortCurrent?.({ kind: "shutdown" });
    this.wake?.();
    await this.loop;
    this.loop = null;
  }

  /** Reserva e executa um job. `null` se não havia job elegível. */
  async runOnce(): Promise<Job | null> {
    const types = Object.keys(this.handlers) as JobType[];
    const job = await this.jobs.claimNext(this.workerId, types);
    return job ? this.execute(job) : null;
  }

  private async runLoop(): Promise<void> {
    await this.recoverStale().catch((err: unknown) => this.logger.error("falha ao recuperar jobs", { error: err }));
    while (!this.stopping) {
      let job: Job | null = null;
      try {
        job = await this.runOnce();
      } catch (err) {
        this.logger.error("falha no ciclo do worker", { error: err });
      }
      if (!job && !this.stopping) await this.sleep(this.timing.pollIntervalMs);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        resolve();
      }
      this.wake = done;
    });
  }

  private async execute(claimed: Job): Promise<Job> {
    const handler = this.handlers[claimed.type];
    const log = this.logger.child(claimed.id);
    const controller = new AbortController();
    let reason: AbortReason | null = null;
    const abort = (next: AbortReason) => {
      if (reason) return;
      reason = next;
      controller.abort(ABORT_ERRORS[next.kind](next));
    };
    this.abortCurrent = abort;

    const pulse = setInterval(() => {
      this.jobs
        .heartbeat(claimed.id, this.workerId)
        .then((p) => {
          if (!p.owned) abort({ kind: "lost-lock" });
          else if (p.cancelRequested) abort({ kind: "cancelled" });
        })
        .catch((err: unknown) => log.error("falha no heartbeat", { error: err }));
    }, this.timing.heartbeatIntervalMs);
    const timeout = handler?.timeoutMs
      ? setTimeout(() => abort({ kind: "timeout", timeoutMs: handler.timeoutMs! }), handler.timeoutMs)
      : undefined;

    try {
      if (!handler) throw new DomainError("NOT_FOUND", `Sem handler para jobs do tipo ${claimed.type}.`);
      const running = await this.jobs.markRunning(claimed.id, this.workerId);
      // Cancelamento pedido entre o claim e o início: não chega a chamar o handler.
      if (running.cancelRequestedAt) abort({ kind: "cancelled" });
      controller.signal.throwIfAborted();
      log.info("job iniciado", { type: claimed.type, attempt: claimed.attempts });

      const ctx: JobContext = {
        job: claimed,
        signal: controller.signal,
        logger: log,
        throwIfAborted: () => controller.signal.throwIfAborted(),
        progress: async (progress, message) => {
          const p = await this.jobs.reportProgress(claimed.id, this.workerId, progress, message);
          if (!p.owned) abort({ kind: "lost-lock" });
          else if (p.cancelRequested) abort({ kind: "cancelled" });
        },
      };
      // Se o handler terminou, o trabalho foi concluído — mesmo que um cancelamento
      // tenha chegado tarde demais para interrompê-lo.
      const result = (await handler.run(ctx)) ?? {};
      return await this.settle(claimed, { status: "completed", result }, log);
    } catch (err) {
      return await this.settle(claimed, outcomeFor(reason, err), log);
    } finally {
      clearInterval(pulse);
      clearTimeout(timeout);
      this.abortCurrent = null;
    }
  }

  private async settle(claimed: Job, outcome: JobOutcome | null, log: Logger): Promise<Job> {
    if (outcome === null) {
      // Lock perdido: outro processo já decidiu o destino do job — não sobrescrever.
      log.warn("lock perdido; estado final fica com quem o assumiu");
      return (await this.jobs.getById(claimed.id)) ?? claimed;
    }
    try {
      const job = await this.jobs.finish(claimed.id, this.workerId, outcome);
      log.info("job finalizado", { status: job.status, ...(outcome.status === "completed" ? {} : { error: outcome.error }) });
      return job;
    } catch (err) {
      if (!isDomainError(err, "CONFLICT")) throw err;
      log.warn("lock perdido ao finalizar", { error: err });
      return (await this.jobs.getById(claimed.id)) ?? claimed;
    }
  }
}

function outcomeFor(reason: AbortReason | null, err: unknown): JobOutcome | null {
  if (reason) {
    switch (reason.kind) {
      case "cancelled":
        return { status: "cancelled", error: { code: "CANCELLED", message: "Cancelado pelo usuário." } };
      case "timeout":
        return {
          status: "failed",
          error: { code: "TIMEOUT", message: `Excedeu o tempo máximo de ${reason.timeoutMs} ms.` },
        };
      case "shutdown":
        return { status: "failed", error: { code: "INTERRUPTED", message: "Worker desligado durante o job." } };
      case "lost-lock":
        return null;
    }
  }
  return { status: "failed", error: errorFor(err) };
}

function errorFor(err: unknown): JobError {
  const message = (err instanceof Error ? err.message : String(err)).slice(0, 2000);
  return { code: isDomainError(err) ? err.code : "HANDLER_FAILED", message };
}

import { ensureLegacyImportQueued } from "../modules/import/legacy/legacy-import-job";
import { getAtlasRuntime } from "./runtime";

const STARTED = Symbol.for("coded-atlas.embedded-worker");
type GlobalWithFlag = typeof globalThis & { [STARTED]?: boolean };

/**
 * Inicia um worker dentro do processo atual (servidor Next ou `npm run worker`)
 * e o desliga de forma limpa no encerramento: o job em andamento é interrompido
 * e marcado como INTERRUPTED em vez de ficar órfão até o próximo start.
 */
export async function startEmbeddedWorker(options: { workerId?: string } = {}): Promise<void> {
  const g = globalThis as GlobalWithFlag;
  if (g[STARTED]) return; // HMR / register chamado de novo no mesmo processo
  g[STARTED] = true;

  const runtime = await getAtlasRuntime();
  const worker = runtime.createWorker({ workerId: options.workerId ?? `worker-${process.pid}` });
  worker.start();
  runtime.logger.info("worker de jobs iniciado", { workerId: worker.workerId, home: runtime.home.root });

  // Biblioteca v1 → modelo novo: importação idempotente e não destrutiva em segundo plano.
  ensureLegacyImportQueued(runtime.legacyImportDeps)
    .then((job) => job && runtime.logger.info("importação da biblioteca v1 enfileirada", { jobId: job.id }))
    .catch((err: unknown) => runtime.logger.error("falha ao verificar a biblioteca v1", { error: err }));

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    runtime.logger.info("desligando worker", { signal });
    worker
      .stop()
      .catch((err: unknown) => runtime.logger.error("falha ao desligar o worker", { error: err }))
      .finally(() => {
        runtime.database.close();
        process.exit(0);
      });
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

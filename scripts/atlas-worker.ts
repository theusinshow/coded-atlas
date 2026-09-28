/**
 * Worker de jobs do Atlas 2.x como processo avulso.
 * Uso: npm run worker   (Ctrl+C para desligar de forma limpa)
 *
 * O servidor Next já sobe um worker embutido (instrumentation.ts); rode este
 * quando quiser processar jobs sem o servidor, ou com ATLAS_WORKER=off no Next.
 */
import { startEmbeddedWorker } from "../src/infrastructure/embedded-worker";

startEmbeddedWorker({ workerId: `worker-cli-${process.pid}` }).catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});

/**
 * Processo auxiliar do teste de corrida de claim (job-queue.test.ts).
 * Uso: node --import tsx claim-race-worker.ts <db> <workerId> <goFile>
 * Sinaliza "ready", espera o arquivo de largada e reserva jobs até a fila secar,
 * imprimindo no fim os IDs que conseguiu.
 */
import { existsSync } from "node:fs";
import { openDatabase } from "../client";
import { createRepositories } from "../repositories";

async function main(): Promise<void> {
  const [dbFile, workerId, goFile] = process.argv.slice(2);
  const database = openDatabase({ file: dbFile });
  const { jobs } = createRepositories(database.db);

  process.stdout.write("ready\n");
  while (!existsSync(goFile)) await new Promise((r) => setTimeout(r, 5));

  const claimed: string[] = [];
  for (;;) {
    const job = await jobs.claimNext(workerId, ["capture"]);
    if (!job) break;
    claimed.push(job.id);
    await jobs.markRunning(job.id, workerId);
    await jobs.finish(job.id, workerId, { status: "completed", result: { by: workerId } });
    await new Promise((r) => setTimeout(r, 2)); // cede a vez: força intercalação real entre processos
  }
  database.close();
  process.stdout.write(`${JSON.stringify(claimed)}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(String(err instanceof Error ? err.stack : err));
  process.exitCode = 1;
});

/**
 * Hook de inicialização do servidor Next: recupera gerações v1 interrompidas e
 * sobe o worker de jobs do Atlas 2.x no mesmo processo do servidor (não depende
 * de nenhuma aba/requisição aberta).
 * Desligue com ATLAS_WORKER=off — por exemplo, se rodar `npm run worker` à parte.
 * Vários workers ao mesmo tempo são seguros: o claim no SQLite é atômico.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Pipeline v1: restaura projetos cuja recaptura foi interrompida (servidor morto no meio).
  const { recoverInterruptedGenerations } = await import("./lib/storage/recover-generations");
  for (const action of await recoverInterruptedGenerations()) {
    console.warn(`[atlas] recuperação de geração interrompida: ${JSON.stringify(action)}`);
  }

  if (process.env.ATLAS_WORKER === "off") return;
  const { startEmbeddedWorker } = await import("./src/infrastructure/embedded-worker");
  await startEmbeddedWorker();
}

/**
 * Hook de inicialização do servidor Next: sobe o worker de jobs do Atlas no mesmo
 * processo do servidor (não depende de nenhuma aba/requisição aberta).
 * Desligue com ATLAS_WORKER=off — por exemplo, se rodar `npm run worker` à parte.
 * Vários workers ao mesmo tempo são seguros: o claim no SQLite é atômico.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.ATLAS_WORKER === "off") return;
  const { startEmbeddedWorker } = await import("./src/infrastructure/embedded-worker");
  await startEmbeddedWorker();
}

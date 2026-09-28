import path from "node:path";

/**
 * Raiz local do Atlas 2.x (docs/STORAGE.md):
 *   .atlas/atlas.db   — metadados (SQLite)
 *   .atlas/storage/   — bytes (LocalAssetStorage)
 * Configurável por ATLAS_HOME. Nunca persistida em registros — só resolvida em runtime.
 * O pipeline legado segue em public/generated (lib/config.ts) até ser migrado.
 */
export interface AtlasHome {
  root: string;
  databaseFile: string;
  storageRoot: string;
}

export function resolveAtlasHome(env: NodeJS.ProcessEnv = process.env): AtlasHome {
  const root = env.ATLAS_HOME ? path.resolve(env.ATLAS_HOME) : path.join(process.cwd(), ".atlas");
  return {
    root,
    databaseFile: path.join(root, "atlas.db"),
    storageRoot: path.join(root, "storage"),
  };
}

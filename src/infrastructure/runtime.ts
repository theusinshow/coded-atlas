import { config as legacyConfig } from "../../lib/config";
import type { ViewportSpec } from "../modules/capture/capture-engine";
import type { CompositionDeps } from "../modules/create/composition-service";
import type { LegacyImportDeps } from "../modules/import/legacy/legacy-import-job";
import type { UploadDeps } from "../modules/import/upload";
import type { ProjectServiceDeps } from "../modules/projects/project-service";
import { createLogger, type Logger } from "../shared/logger";
import { resolveAtlasHome, type AtlasHome } from "./atlas-home";
import { openDatabase, type AtlasDatabase } from "./db/client";
import { createRepositories, type Repositories } from "./db/repositories";
import { GeneratedDirStore } from "./legacy/generated-dir-store";
import { createUrlPolicy, resolveUrlPolicyMode, type UrlPolicy } from "./net/url-policy";
import { SharpMediaProbe } from "./sharp/media-probe";
import { thumbCacheKeys, ThumbnailService } from "./sharp/thumbnails";
import { LocalAssetStorage } from "./storage/local-asset-storage";

/**
 * Composition root do Atlas 2.x para as TELAS e APIs: repositórios, storage e
 * dependências dos casos de uso. Os handlers pesados do worker (Playwright,
 * renderer) ficam em `worker-runtime.ts`, importado só pelo processo do worker —
 * assim o grafo dos Server Components nunca puxa `react-dom/server` nem engines.
 *
 * Um runtime por processo, guardado em `globalThis` (o Next em dev recarrega
 * módulos; sem isso cada recarga abriria outra conexão).
 */
export interface AtlasRuntime {
  home: AtlasHome;
  database: AtlasDatabase;
  repos: Repositories;
  storage: LocalAssetStorage;
  urlPolicy: UrlPolicy;
  thumbnails: ThumbnailService;
  logger: Logger;
  /** Dependências prontas para os casos de uso (UI/API só chamam serviços). */
  projectDeps: ProjectServiceDeps;
  uploadDeps: UploadDeps;
  legacyImportDeps: LegacyImportDeps;
  compositionDeps: CompositionDeps;
}

export const RUNTIME_SETTINGS = {
  /** Viewports da captura: os mesmos do pipeline v1 (lib/config.ts). */
  captureViewports: {
    desktop: legacyConfig.viewports.desktop,
    mobile: legacyConfig.viewports.mobile,
  } satisfies Record<"desktop" | "mobile", ViewportSpec>,
  /** Teto de um job de captura completa (2 devices, seções, páginas, vídeo), com folga. */
  captureJobTimeoutMs: Number(process.env.ATLAS_CAPTURE_JOB_TIMEOUT_MS ?? 15 * 60_000),
} as const;

const GLOBAL_KEY = Symbol.for("coded-atlas.runtime");
type GlobalWithRuntime = typeof globalThis & { [GLOBAL_KEY]?: Promise<AtlasRuntime> };

export function getAtlasRuntime(): Promise<AtlasRuntime> {
  const g = globalThis as GlobalWithRuntime;
  g[GLOBAL_KEY] ??= createRuntime().catch((err: unknown) => {
    delete g[GLOBAL_KEY]; // permite nova tentativa (ex.: banco travado momentaneamente)
    throw err;
  });
  return g[GLOBAL_KEY];
}

async function createRuntime(): Promise<AtlasRuntime> {
  const logger = createLogger({ scope: "atlas" });
  const home = resolveAtlasHome();
  const database = openDatabase({ file: home.databaseFile, logger });
  const repos = createRepositories(database.db);
  const storage = await LocalAssetStorage.open(home.storageRoot, { logger });
  const urlPolicy = createUrlPolicy(resolveUrlPolicyMode());
  const probe = new SharpMediaProbe();
  const legacyStore = await GeneratedDirStore.open(legacyConfig.outputDir);

  return {
    home,
    database,
    repos,
    storage,
    urlPolicy,
    thumbnails: new ThumbnailService(storage),
    logger,
    projectDeps: { ...repos, storage, assertUrlAllowed: urlPolicy.assertAllowed, derivedCacheKeys: thumbCacheKeys },
    uploadDeps: { ...repos, storage, probe },
    legacyImportDeps: { ...repos, ledger: repos.legacyImports, store: legacyStore, storage, probe },
    compositionDeps: repos,
  };
}

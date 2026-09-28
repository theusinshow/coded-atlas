import { config as legacyConfig } from "../../lib/config";
import { createCaptureJobHandler } from "../modules/capture/capture-job";
import type { ViewportSpec } from "../modules/capture/capture-engine";
import { createLogger, type Logger } from "../shared/logger";
import { JobWorker } from "../workers/job-worker";
import { resolveAtlasHome, type AtlasHome } from "./atlas-home";
import { openDatabase, type AtlasDatabase } from "./db/client";
import { createRepositories, type Repositories } from "./db/repositories";
import { PlaywrightCaptureEngine } from "./playwright/playwright-capture-engine";
import { createUrlPolicy, resolveUrlPolicyMode, type UrlPolicy } from "./net/url-policy";
import { LocalAssetStorage } from "./storage/local-asset-storage";

/**
 * Composition root do Atlas 2.x: o único lugar que conhece as implementações
 * concretas (SQLite, disco local, Playwright) e as liga às portas.
 *
 * Um runtime por processo. Guardado em `globalThis` porque o Next em dev
 * recarrega módulos (HMR) — sem isso cada recarga abriria outra conexão e
 * outro worker.
 */
export interface AtlasRuntime {
  home: AtlasHome;
  database: AtlasDatabase;
  repos: Repositories;
  storage: LocalAssetStorage;
  urlPolicy: UrlPolicy;
  logger: Logger;
  createWorker(options?: { workerId?: string }): JobWorker;
}

export const RUNTIME_SETTINGS = {
  /** Viewport da fatia migrada: o mesmo desktop do pipeline v1. */
  captureViewport: legacyConfig.viewports.desktop satisfies ViewportSpec,
  /** Teto de um job de captura (navegação + estabilidade + foto), com folga. */
  captureJobTimeoutMs: Number(process.env.ATLAS_CAPTURE_JOB_TIMEOUT_MS ?? 5 * 60_000),
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
  const engine = new PlaywrightCaptureEngine({
    headless: legacyConfig.headless,
    navTimeoutMs: legacyConfig.navTimeoutMs,
    userAgent: legacyConfig.userAgent,
    // Em modo local a política só checa protocolo: interceptar toda requisição seria custo sem ganho.
    ...(urlPolicy.mode === "hosted-safe" ? { urlGuard: urlPolicy.assertAllowed } : {}),
  });

  return {
    home,
    database,
    repos,
    storage,
    urlPolicy,
    logger,
    createWorker: (options = {}) =>
      new JobWorker({
        jobs: repos.jobs,
        logger,
        workerId: options.workerId,
        handlers: {
          capture: createCaptureJobHandler({
            ...repos,
            storage,
            engine,
            viewport: RUNTIME_SETTINGS.captureViewport,
            timeoutMs: RUNTIME_SETTINGS.captureJobTimeoutMs,
          }),
        },
      }),
  };
}

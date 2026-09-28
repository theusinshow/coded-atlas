import { config as legacyConfig } from "../../lib/config";
import { createCaptureJobHandler } from "../modules/capture/capture-job";
import type { ViewportSpec } from "../modules/capture/capture-engine";
import { createLegacyImportJobHandler, type LegacyImportDeps } from "../modules/import/legacy/legacy-import-job";
import type { UploadDeps } from "../modules/import/upload";
import type { ProjectServiceDeps } from "../modules/projects/project-service";
import { createLogger, type Logger } from "../shared/logger";
import { JobWorker } from "../workers/job-worker";
import { resolveAtlasHome, type AtlasHome } from "./atlas-home";
import { openDatabase, type AtlasDatabase } from "./db/client";
import { createRepositories, type Repositories } from "./db/repositories";
import { GeneratedDirStore } from "./legacy/generated-dir-store";
import { createUrlPolicy, resolveUrlPolicyMode, type UrlPolicy } from "./net/url-policy";
import { PlaywrightCaptureEngine } from "./playwright/playwright-capture-engine";
import { SharpImageTransformer } from "./sharp/image-transformer";
import { SharpMediaProbe } from "./sharp/media-probe";
import { thumbCacheKeys, ThumbnailService } from "./sharp/thumbnails";
import { LocalAssetStorage } from "./storage/local-asset-storage";

/**
 * Composition root do Atlas 2.x: o único lugar que conhece as implementações
 * concretas (SQLite, disco local, Playwright, Sharp) e as liga às portas.
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
  thumbnails: ThumbnailService;
  logger: Logger;
  /** Dependências prontas para os casos de uso (UI/API só chamam serviços). */
  projectDeps: ProjectServiceDeps;
  uploadDeps: UploadDeps;
  legacyImportDeps: LegacyImportDeps;
  createWorker(options?: { workerId?: string }): JobWorker;
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
  const engine = new PlaywrightCaptureEngine({
    headless: legacyConfig.headless,
    navTimeoutMs: legacyConfig.navTimeoutMs,
    userAgent: legacyConfig.userAgent,
    // Em modo local a política só checa protocolo: interceptar toda requisição seria custo sem ganho.
    ...(urlPolicy.mode === "hosted-safe" ? { urlGuard: urlPolicy.assertAllowed } : {}),
    limits: {
      actionTimeoutMs: legacyConfig.actionTimeoutMs,
      sectionMinHeight: legacyConfig.sectionMinHeight,
      sectionDelayMs: legacyConfig.sectionDelayMs,
      sectionScrollRatio: legacyConfig.sectionScrollRatio,
      maxSections: legacyConfig.maxSections,
      stateSettleMs: legacyConfig.stateSettleMs,
      maxFullPageHeightPx: legacyConfig.maxFullPageHeightPx,
      scrollMaxHeightPx: legacyConfig.scrollMaxHeightPx,
      scrollMaxMs: legacyConfig.scrollMaxMs,
    },
  });

  const projectDeps: ProjectServiceDeps = {
    ...repos,
    storage,
    assertUrlAllowed: urlPolicy.assertAllowed,
    derivedCacheKeys: thumbCacheKeys,
  };
  const uploadDeps: UploadDeps = { ...repos, storage, probe };
  const legacyImportDeps: LegacyImportDeps = { ...repos, ledger: repos.legacyImports, store: legacyStore, storage, probe };

  return {
    home,
    database,
    repos,
    storage,
    urlPolicy,
    thumbnails: new ThumbnailService(storage),
    logger,
    projectDeps,
    uploadDeps,
    legacyImportDeps,
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
            images: new SharpImageTransformer(),
            viewports: RUNTIME_SETTINGS.captureViewports,
            timeoutMs: RUNTIME_SETTINGS.captureJobTimeoutMs,
            assertUrlAllowed: urlPolicy.assertAllowed,
          }),
          import: createLegacyImportJobHandler(legacyImportDeps),
        },
      }),
  };
}

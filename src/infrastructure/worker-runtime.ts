import { config as legacyConfig } from "../../lib/config";
import { createPlanJobHandler } from "../modules/brain/plan-service";
import { createCaptureJobHandler } from "../modules/capture/capture-job";
import { createLegacyImportJobHandler } from "../modules/import/legacy/legacy-import-job";
import { createRenderJobHandler } from "../modules/render/render-job";
import { JobWorker } from "../workers/job-worker";
import { PlaywrightCaptureEngine } from "./playwright/playwright-capture-engine";
import { ChromiumFfmpegMotionRenderer } from "./render/chromium-ffmpeg-motion-renderer";
import { PlaywrightStaticRenderer } from "./render/playwright-static-renderer";
import { RUNTIME_SETTINGS, type AtlasRuntime } from "./runtime";
import { SharpImageTransformer } from "./sharp/image-transformer";

/**
 * Monta o worker com os handlers concretos (Playwright, renderer React → HTML).
 * Importado SÓ pelo processo do worker (instrumentation.ts / npm run worker):
 * nunca pelo grafo de páginas do Next.
 */
export function createAtlasWorker(runtime: AtlasRuntime, options: { workerId?: string } = {}): JobWorker {
  const { repos, storage, urlPolicy, logger } = runtime;
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

  return new JobWorker({
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
      import: createLegacyImportJobHandler(runtime.legacyImportDeps),
      render: createRenderJobHandler({ ...repos, storage, renderer: new PlaywrightStaticRenderer(), motionRenderer: new ChromiumFfmpegMotionRenderer() }),
      plan: createPlanJobHandler(runtime.brainDeps),
    },
  });
}

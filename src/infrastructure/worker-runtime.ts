import { CAPTURE_SETTINGS } from "./capture-settings";
import { createCaseCopyJobHandler } from "../modules/brain/case-copy";
import { createPlanJobHandler } from "../modules/brain/plan-service";
import { createCaptureJobHandler } from "../modules/capture/capture-job";
import { createLegacyImportJobHandler } from "../modules/import/legacy/legacy-import-job";
import { createRenderJobHandler } from "../modules/render/render-job";
import { createExportJobHandler } from "../modules/publish/export-service";
import { createVisualDiffJobHandler } from "../modules/capture/visual-diff";
import { SharpPixelmatchDiffer } from "./sharp/visual-differ";
import { JobWorker } from "../workers/job-worker";
import { PlaywrightCaptureEngine } from "./playwright/playwright-capture-engine";
import { PdfPptxExporter } from "./export/pdf-pptx-exporter";
import { ChromiumCaseExporter } from "./render/chromium-case-exporter";
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
    headless: CAPTURE_SETTINGS.headless,
    navTimeoutMs: CAPTURE_SETTINGS.navTimeoutMs,
    userAgent: CAPTURE_SETTINGS.userAgent,
    // Em modo local a política só checa protocolo: interceptar toda requisição seria custo sem ganho.
    ...(urlPolicy.mode === "hosted-safe" ? { urlGuard: urlPolicy.assertAllowed } : {}),
    limits: {
      actionTimeoutMs: CAPTURE_SETTINGS.actionTimeoutMs,
      sectionMinHeight: CAPTURE_SETTINGS.sectionMinHeight,
      sectionDelayMs: CAPTURE_SETTINGS.sectionDelayMs,
      sectionScrollRatio: CAPTURE_SETTINGS.sectionScrollRatio,
      maxSections: CAPTURE_SETTINGS.maxSections,
      stateSettleMs: CAPTURE_SETTINGS.stateSettleMs,
      maxFullPageHeightPx: CAPTURE_SETTINGS.maxFullPageHeightPx,
      scrollMaxHeightPx: CAPTURE_SETTINGS.scrollMaxHeightPx,
      scrollMaxMs: CAPTURE_SETTINGS.scrollMaxMs,
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
        sessions: runtime.sessions,
      }),
      import: createLegacyImportJobHandler(runtime.legacyImportDeps),
      render: createRenderJobHandler({ ...repos, storage, renderer: new PlaywrightStaticRenderer(), motionRenderer: new ChromiumFfmpegMotionRenderer(), exporter: new PdfPptxExporter(), caseExporter: new ChromiumCaseExporter() }),
      plan: createPlanJobHandler(runtime.brainDeps),
      copy: createCaseCopyJobHandler({ ...runtime.brainDeps, documents: repos.documents }),
      export: createExportJobHandler(runtime.exportDeps),
      diff: createVisualDiffJobHandler({ assets: repos.assets, jobs: repos.jobs, storage, differ: new SharpPixelmatchDiffer() }),
    },
  });
}

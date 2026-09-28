import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page, type Request } from "playwright";
import sharp from "sharp";
import { detectPageSections, type SectionCandidate } from "../../../lib/capture/detect-sections";
import { dismissOverlays } from "../../../lib/capture/dismiss-overlays";
import { inspectSite } from "../../../lib/capture/inspect-site";
import { smoothScrollTo } from "../../../lib/capture/record-scroll";
import { scrollToBottom } from "../../../lib/capture/scroll-to-bottom";
import { waitForPageStability } from "../../../lib/capture/wait-for-stability";
import type {
  CapturedMedia,
  CaptureEngine,
  CaptureWarning,
  SiteCaptureRequest,
  SiteCaptureResult,
  SiteInspection,
  ViewportShot,
  ViewportSpec,
} from "../../modules/capture/capture-engine";
import { DomainError } from "../../shared/errors";

export interface CaptureLimits {
  actionTimeoutMs: number;
  sectionMinHeight: number;
  sectionDelayMs: number;
  sectionScrollRatio: number;
  maxSections: number;
  stateSettleMs: number;
  maxFullPageHeightPx: number;
  scrollMaxHeightPx: number;
  scrollMaxMs: number;
}

export interface PlaywrightCaptureEngineOptions {
  headless: boolean;
  navTimeoutMs: number;
  userAgent: string;
  /** Aguardar estabilidade (fontes, imagens, animações) antes da foto — o mesmo do v1. */
  settle?: boolean;
  /**
   * Política de URL aplicada a TODA requisição do navegador (documento e
   * subrecursos) e à cadeia de redirects da navegação. Usado no modo hosted-safe.
   */
  urlGuard?: (url: string) => Promise<void>;
  limits?: Partial<CaptureLimits>;
}

const DEFAULT_LIMITS: CaptureLimits = {
  actionTimeoutMs: 30_000,
  sectionMinHeight: 200,
  sectionDelayMs: 1200,
  sectionScrollRatio: 0.9,
  maxSections: 20,
  stateSettleMs: 800,
  maxFullPageHeightPx: 16_000,
  scrollMaxHeightPx: 30_000,
  scrollMaxMs: 20_000,
};

type Device = "desktop" | "mobile";
const deviceOf = (vp: ViewportSpec): Device => (vp.label === "mobile" ? "mobile" : "desktop");

/**
 * CaptureEngine sobre o Playwright, reaproveitando as rotinas do pipeline v1
 * (overlays, estabilidade, detecção e nomes de seções, scroll suave, inspeção,
 * guarda de scroll infinito). Um navegador por captura; abortar o signal fecha o
 * navegador, o que derruba qualquer operação pendente. O navegador fecha SEMPRE
 * no finally e arquivos temporários (vídeo) são apagados.
 */
export class PlaywrightCaptureEngine implements CaptureEngine {
  private readonly limits: CaptureLimits;

  constructor(private readonly options: PlaywrightCaptureEngineOptions) {
    this.limits = { ...DEFAULT_LIMITS, ...options.limits };
  }

  async captureViewport(request: { url: string; viewport: ViewportSpec; signal: AbortSignal }): Promise<ViewportShot> {
    return this.withBrowser(request.signal, async (browser) => {
      const context = await this.newContext(browser, request.viewport);
      try {
        const page = await this.openPage(context, request.url);
        const png = await page.screenshot({ type: "png" });
        const { width, height } = await dimensions(png);
        return { png: new Uint8Array(png), width, height, finalUrl: page.url() };
      } finally {
        await context.close();
      }
    });
  }

  async captureSite(req: SiteCaptureRequest): Promise<SiteCaptureResult> {
    const media: CapturedMedia[] = [];
    const warnings: CaptureWarning[] = [];
    let inspection: SiteInspection | null = null;
    let finalUrl = req.url;
    const steps = req.viewports.length * (1 + req.pages.length) + req.states.length;
    let done = 0;
    const tick = (message: string) => req.onProgress?.(Math.min(done / Math.max(steps, 1), 0.99), message);
    const videoDir = req.video ? await mkdtemp(path.join(os.tmpdir(), "atlas-video-")) : null;

    try {
      return await this.withBrowser(req.signal, async (browser) => {
        // ── Página principal, por device ───────────────────────────────────────
        for (const vp of req.viewports) {
          const device = deviceOf(vp);
          tick(`Capturando ${device} (${vp.width}×${vp.height})…`);
          const context = await this.newContext(browser, vp, videoDir);
          let page: Page | undefined;
          try {
            page = await this.openPage(context, req.url);
            finalUrl = page.url();
            if (req.inspect && !inspection) {
              inspection = await inspectSite(page, (w) => warnings.push({ code: w.code, message: w.message, device }));
            }
            media.push(await this.shot(page, { kind: "screenshot", role: "viewport", device, vp, label: `${device} ${vp.width}×${vp.height}` }));

            if (req.sections) {
              media.push(...(await this.sections(page, vp, device, warnings)));
            } else if (req.fullPage) {
              const { limitReached } = await scrollToBottom(page, { maxHeightPx: this.limits.scrollMaxHeightPx, maxMs: this.limits.scrollMaxMs });
              if (limitReached) warnings.push({ code: "SCROLL_LIMIT_REACHED", message: `A rolagem ${device} parou no limite (página longa ou infinita).`, device });
            }
            if (req.fullPage) media.push(await this.fullPage(page, vp, device, warnings, { role: "fullpage", label: `${device} página inteira` }));
            if (videoDir) await smoothScrollTo(page, 0); // termina o vídeo no topo
          } finally {
            await context.close(); // finaliza o vídeo
          }
          if (videoDir && page) {
            try {
              const file = await page.video()?.path();
              if (file) {
                media.push({
                  bytes: new Uint8Array(await readFile(file)),
                  mimeType: "video/webm",
                  extension: "webm",
                  kind: "video",
                  width: vp.width,
                  height: vp.height,
                  label: `Scroll ${device}`,
                  metadata: { origin: "capture", role: "scroll-video", device, viewport: `${vp.width}x${vp.height}` },
                });
              }
            } catch (err) {
              warnings.push({ code: "VIDEO_SAVE_FAILED", message: `O vídeo ${device} não pôde ser salvo: ${message(err)}`, device });
            }
          }
          done++;
        }

        // ── Páginas extras (leves: viewport + página inteira) ────────────────────
        for (const pageUrl of req.pages) {
          for (const vp of req.viewports) {
            const device = deviceOf(vp);
            const pagePath = safePath(pageUrl);
            tick(`Página ${pagePath} (${device})…`);
            const context = await this.newContext(browser, vp);
            try {
              const page = await this.openPage(context, pageUrl);
              media.push(await this.shot(page, { kind: "screenshot", role: "page-viewport", device, vp, label: `${pagePath} · ${device}`, pagePath }));
              if (req.fullPage) {
                await scrollToBottom(page, { maxHeightPx: this.limits.scrollMaxHeightPx, maxMs: this.limits.scrollMaxMs });
                media.push(await this.fullPage(page, vp, device, warnings, { role: "page-fullpage", label: `${pagePath} · ${device} inteira`, pagePath }));
              }
            } catch (err) {
              if (req.signal.aborted) throw err;
              warnings.push({ code: "PAGE_CAPTURE_FAILED", message: `A página ${pagePath} (${device}) não pôde ser capturada: ${message(err)}`, device });
            } finally {
              await context.close();
            }
            done++;
          }
        }

        // ── Estados de interação (desktop) ───────────────────────────────────────
        const stateViewport = req.viewports.find((vp) => deviceOf(vp) === "desktop") ?? req.viewports[0];
        for (const state of req.states) {
          tick(`Estado "${state.name}"…`);
          const context = await this.newContext(browser, stateViewport);
          try {
            const page = await this.openPage(context, req.url);
            await page.click(state.selector, { timeout: 5000 });
            await page.waitForTimeout(this.limits.stateSettleMs);
            media.push(
              await this.shot(page, {
                kind: "screenshot",
                role: "state",
                device: deviceOf(stateViewport),
                vp: stateViewport,
                label: state.name,
                stateName: state.name,
              })
            );
          } catch (err) {
            if (req.signal.aborted) throw err;
            warnings.push({ code: "STATE_CAPTURE_FAILED", message: `O estado "${state.name}" não pôde ser capturado: ${message(err)}` });
          } finally {
            await context.close();
          }
          done++;
        }

        return { media, inspection, warnings, finalUrl };
      });
    } finally {
      if (videoDir) await rm(videoDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  }

  // ── Internos ──────────────────────────────────────────────────────────────────

  /** Executa com um navegador próprio; abortar fecha o navegador; fecha SEMPRE no fim. */
  private async withBrowser<T>(signal: AbortSignal, work: (browser: Browser) => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    let browser: Browser | undefined;
    const onAbort = () => void browser?.close().catch(() => undefined); // já fechando: nada a fazer
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      browser = await chromium.launch({ headless: this.options.headless, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
      if (signal.aborted) throw signal.reason;
      return await work(browser);
    } catch (err) {
      // Com o signal abortado, o erro do Playwright ("browser has been closed") é consequência do abort.
      if (signal.aborted) throw signal.reason;
      throw err;
    } finally {
      signal.removeEventListener("abort", onAbort);
      await browser?.close().catch(() => undefined);
    }
  }

  private async newContext(browser: Browser, vp: ViewportSpec, videoDir?: string | null): Promise<BrowserContext> {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.deviceScaleFactor,
      userAgent: this.options.userAgent,
      ...(videoDir ? { recordVideo: { dir: videoDir, size: { width: vp.width, height: vp.height } } } : {}),
    });
    context.setDefaultTimeout(this.limits.actionTimeoutMs); // nenhuma ação sem teto de tempo
    return context;
  }

  /** Abre a URL respeitando a política de URL (requisições + cadeia de redirects) e deixa a página pronta. */
  private async openPage(context: BrowserContext, url: string): Promise<Page> {
    const page = await context.newPage();
    const guard = this.options.urlGuard;
    let blocked: unknown;
    if (guard) {
      await page.route("**/*", async (route) => {
        try {
          await guard(route.request().url());
        } catch (err) {
          blocked ??= err;
          return route.abort("blockedbyclient");
        }
        return route.continue();
      });
    }
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: this.options.navTimeoutMs }).catch((err: unknown) => {
      throw blocked ?? err; // navegação barrada pela política: o motivo é a política, não o erro genérico
    });
    if (guard && response) {
      // O Playwright não chama o route para os saltos de redirect: confere a cadeia inteira.
      for (let req: Request | null = response.request(); req; req = req.redirectedFrom()) await guard(req.url());
      await guard(page.url());
    }
    if (blocked) throw blocked;
    if (response && response.status() >= 400) {
      throw new DomainError("VALIDATION", `O site respondeu HTTP ${response.status()}.`, { url, status: response.status() });
    }
    await dismissOverlays(page);
    if (this.options.settle !== false) await waitForPageStability(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    return page;
  }

  private async shot(
    page: Page,
    info: {
      kind: "screenshot" | "section";
      role: string;
      device: Device;
      vp: ViewportSpec;
      label: string;
      pagePath?: string;
      stateName?: string;
      sectionName?: string;
      sectionIndex?: number;
      scrollY?: number;
    }
  ): Promise<CapturedMedia> {
    const png = await page.screenshot({ type: "png" });
    const { width, height } = await dimensions(png);
    return {
      bytes: new Uint8Array(png),
      mimeType: "image/png",
      extension: "png",
      kind: info.kind,
      width,
      height,
      label: info.label,
      metadata: {
        origin: "capture",
        role: info.role,
        device: info.device,
        viewport: `${info.vp.width}x${info.vp.height}`,
        ...(info.pagePath ? { pagePath: info.pagePath } : {}),
        ...(info.stateName ? { stateName: info.stateName } : {}),
        ...(info.sectionName ? { sectionName: info.sectionName } : {}),
        ...(info.sectionIndex !== undefined ? { sectionIndex: info.sectionIndex } : {}),
        ...(info.scrollY !== undefined ? { scrollY: Math.max(0, Math.round(info.scrollY)) } : {}),
      },
    };
  }

  /** Seções: detecção semântica do DOM (nomes legíveis) com fallback de fatias por rolagem. */
  private async sections(page: Page, vp: ViewportSpec, device: Device, warnings: CaptureWarning[]): Promise<CapturedMedia[]> {
    let candidates: SectionCandidate[] = await detectPageSections(page, this.limits.sectionMinHeight).catch((err: unknown) => {
      warnings.push({ code: "SECTION_DETECTION_FALLBACK", message: `Detecção de seções falhou (${message(err)}); usadas fatias por rolagem.`, device });
      return [];
    });
    if (candidates.length < 2) {
      const total: number = await page.evaluate(() => document.body.scrollHeight);
      const step = Math.floor(vp.height * this.limits.sectionScrollRatio);
      candidates = [];
      for (let y = 0; y < Math.min(total, this.limits.scrollMaxHeightPx) && candidates.length < this.limits.maxSections; y += step) {
        candidates.push({ tag: "div", y, elementHeight: vp.height });
      }
    }
    const result: CapturedMedia[] = [];
    for (const [index, section] of candidates.slice(0, this.limits.maxSections).entries()) {
      await smoothScrollTo(page, section.y);
      await page.waitForTimeout(this.limits.sectionDelayMs);
      const name = section.suggestedName ?? section.heading;
      result.push(
        await this.shot(page, {
          kind: "section",
          role: "section",
          device,
          vp,
          label: name ?? `Seção ${index + 1}`,
          ...(name ? { sectionName: name.slice(0, 120) } : {}),
          sectionIndex: index,
          scrollY: section.y,
        })
      );
    }
    return result;
  }

  /** Página inteira com altura máxima (recorte do topo + aviso em páginas gigantes/infinitas). */
  private async fullPage(
    page: Page,
    vp: ViewportSpec,
    device: Device,
    warnings: CaptureWarning[],
    info: { role: string; label: string; pagePath?: string }
  ): Promise<CapturedMedia> {
    const height: number = await page.evaluate(() => document.documentElement.scrollHeight);
    const max = this.limits.maxFullPageHeightPx;
    const png =
      height <= max
        ? await page.screenshot({ type: "png", fullPage: true })
        : await page.screenshot({ type: "png", fullPage: true, clip: { x: 0, y: 0, width: vp.width, height: max } });
    if (height > max) {
      warnings.push({ code: "FULLPAGE_TRUNCATED", message: `A página ${device} tem ${height}px; a página inteira foi cortada em ${max}px.`, device });
    }
    const dims = await dimensions(png);
    return {
      bytes: new Uint8Array(png),
      mimeType: "image/png",
      extension: "png",
      kind: "screenshot",
      width: dims.width,
      height: dims.height,
      label: info.label,
      metadata: {
        origin: "capture",
        role: info.role,
        device,
        viewport: `${vp.width}x${vp.height}`,
        ...(info.pagePath ? { pagePath: info.pagePath } : {}),
      },
    };
  }
}

async function dimensions(png: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(png).metadata();
  if (!meta.width || !meta.height || meta.format !== "png") {
    throw new DomainError("VALIDATION", "Screenshot inválido (sem dimensões ou não-PNG).");
  }
  return { width: meta.width, height: meta.height };
}

function safePath(url: string): string {
  try {
    const u = new URL(url);
    return (u.pathname + u.search).slice(0, 200) || "/";
  } catch {
    return url.slice(0, 200);
  }
}

function message(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).split("\n")[0].slice(0, 300);
}

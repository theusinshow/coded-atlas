import { chromium, type Browser, type Request } from "playwright";
import sharp from "sharp";
import { dismissOverlays } from "../../../lib/capture/dismiss-overlays";
import { waitForPageStability } from "../../../lib/capture/wait-for-stability";
import type { CaptureEngine, ViewportShot, ViewportSpec } from "../../modules/capture/capture-engine";
import { DomainError } from "../../shared/errors";

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
}

/**
 * CaptureEngine sobre o Playwright, reaproveitando as rotinas do pipeline v1
 * (dispensa de overlays e espera de estabilidade). Um navegador por captura;
 * abortar o signal fecha o navegador, o que derruba qualquer operação pendente.
 * O navegador fecha SEMPRE no finally.
 */
export class PlaywrightCaptureEngine implements CaptureEngine {
  constructor(private readonly options: PlaywrightCaptureEngineOptions) {}

  async captureViewport(request: { url: string; viewport: ViewportSpec; signal: AbortSignal }): Promise<ViewportShot> {
    const { url, viewport, signal } = request;
    signal.throwIfAborted();

    let browser: Browser | undefined;
    const onAbort = () => void browser?.close().catch(() => undefined);
    signal.addEventListener("abort", onAbort, { once: true });

    try {
      browser = await chromium.launch({
        headless: this.options.headless,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      });
      if (signal.aborted) throw signal.reason;

      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor,
        userAgent: this.options.userAgent,
      });
      context.setDefaultTimeout(this.options.navTimeoutMs); // nenhuma ação sem teto de tempo
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

      const png = await page.screenshot({ type: "png" });
      const meta = await sharp(png).metadata();
      if (!meta.width || !meta.height || meta.format !== "png") {
        throw new DomainError("VALIDATION", "Screenshot inválido (sem dimensões ou não-PNG).");
      }
      return { png: new Uint8Array(png), width: meta.width, height: meta.height, finalUrl: page.url() };
    } catch (err) {
      // Com o signal abortado, o erro do Playwright ("browser has been closed") é consequência do abort.
      if (signal.aborted) throw signal.reason;
      throw err;
    } finally {
      signal.removeEventListener("abort", onAbort);
      await browser?.close().catch(() => undefined);
    }
  }
}

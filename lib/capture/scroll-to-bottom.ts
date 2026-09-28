import type { Page } from "playwright";
import { config } from "../config";

export interface ScrollLimits {
  maxHeightPx: number;
  maxMs: number;
}

/**
 * Rola até o fim para disparar lazy-load, com guarda contra scroll infinito:
 * para ao atingir `maxHeightPx` rolados ou `maxMs` de duração, o que vier
 * primeiro. Devolve se parou por limite (quem chama registra o aviso).
 */
export async function scrollToBottom(
  page: Page,
  limits: ScrollLimits = { maxHeightPx: config.scrollMaxHeightPx, maxMs: config.scrollMaxMs }
): Promise<{ limitReached: boolean }> {
  const result = await page.evaluate(
    ({ maxHeightPx, maxMs }) =>
      new Promise<{ limitReached: boolean }>((resolve) => {
        let y = 0;
        const step = 600;
        const started = Date.now();
        const timer = setInterval(() => {
          window.scrollBy(0, step);
          y += step;
          const atBottom = y >= document.body.scrollHeight;
          const limitReached = !atBottom && (y >= maxHeightPx || Date.now() - started >= maxMs);
          if (atBottom || limitReached) {
            clearInterval(timer);
            window.scrollTo(0, 0);
            resolve({ limitReached });
          }
        }, 120);
      }),
    limits
  );
  await page.waitForTimeout(500);
  return result;
}

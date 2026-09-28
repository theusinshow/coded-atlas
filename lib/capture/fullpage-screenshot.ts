import type { Page } from "playwright";
import { config } from "../config";
import { warning, type WarnFn } from "../warnings";

/**
 * Full page com altura máxima: páginas infinitas/gigantes viram um recorte do
 * topo até `config.maxFullPageHeightPx` (com aviso) em vez de um PNG enorme ou
 * de estourar o tempo da ação.
 */
export async function captureFullPage(
  page: Page,
  absPath: string,
  device: "desktop" | "mobile",
  onWarning?: WarnFn
): Promise<void> {
  const height: number = await page.evaluate(() => document.documentElement.scrollHeight);
  if (height <= config.maxFullPageHeightPx) {
    await page.screenshot({ path: absPath, fullPage: true, type: "png" });
    return;
  }
  const width = page.viewportSize()?.width ?? 0;
  await page.screenshot({
    path: absPath,
    fullPage: true,
    clip: { x: 0, y: 0, width, height: config.maxFullPageHeightPx },
    type: "png",
  });
  onWarning?.(
    warning(
      "FULLPAGE_TRUNCATED",
      `A página ${device} tem ${height}px; a full page foi cortada em ${config.maxFullPageHeightPx}px.`,
      undefined,
      device
    )
  );
}

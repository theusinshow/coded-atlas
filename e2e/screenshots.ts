/**
 * Screenshots de telas para revisão visual.
 * Uso: npx tsx e2e/screenshots.ts <base-url> <pasta-de-saída> /rota1 /rota2 ...
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

async function main(): Promise<void> {
  const [base, out, ...routes] = process.argv.slice(2);
  if (!base || !out || routes.length === 0) {
    console.error("uso: npx tsx e2e/screenshots.ts <base-url> <pasta> /rota ...");
    process.exitCode = 1;
    return;
  }
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  for (const route of routes) {
    await page.goto(base + route, { waitUntil: "networkidle" });
    const file = path.join(out, `${route.replace(/[\/?=&]/g, "_").replace(/^_/, "") || "root"}.png`);
    await page.screenshot({ path: file, fullPage: route.includes("full=1") });
    console.log(file);
  }
  await browser.close();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});

import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { scrollToBottom } from "./scroll-to-bottom";

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser.close();
});
beforeEach(async () => {
  page = await (await browser.newContext({ viewport: { width: 400, height: 300 } })).newPage();
});

/** Página que ganha conteúdo toda vez que chega perto do fim — scroll infinito. */
const INFINITE = `<html><body style="margin:0"><div id="feed"></div><script>
  const feed = document.getElementById("feed");
  const add = () => { for (let i = 0; i < 20; i++) { const d = document.createElement("div"); d.style.height = "200px"; feed.appendChild(d); } };
  add();
  addEventListener("scroll", () => { if (innerHeight + scrollY > document.body.scrollHeight - 800) add(); });
</script></body></html>`;

describe("guarda de scroll infinito", () => {
  it("para no limite e avisa, em vez de rolar para sempre", async () => {
    await page.setContent(INFINITE);
    const started = Date.now();
    const result = await scrollToBottom(page, { maxHeightPx: 6_000, maxMs: 5_000 });
    expect(result.limitReached).toBe(true);
    expect(Date.now() - started).toBeLessThan(8_000);
  }, 20_000);

  it("página normal termina sem acionar o limite", async () => {
    await page.setContent(`<html><body style="margin:0"><div style="height:1500px"></div></body></html>`);
    expect((await scrollToBottom(page, { maxHeightPx: 6_000, maxMs: 5_000 })).limitReached).toBe(false);
  }, 20_000);
});

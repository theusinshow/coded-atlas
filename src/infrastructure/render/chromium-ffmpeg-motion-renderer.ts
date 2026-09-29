import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { videoPlan, type MotionRenderer, type RenderedVideo, type VideoRenderInput } from "../../modules/render/motion-renderer";
import { encoderArgs, startEncoder, type EncoderProcess } from "../ffmpeg/ffmpeg";
import { installRenderRoutes, renderFontCss, RENDER_ORIGIN, type AssetLoader } from "./page-routes";
import { getRenderBundle, RENDER_ENTRIES } from "./render-bundle";

const AUDIO_EXT: Record<string, string> = { "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg", "audio/mp4": "m4a" };

/**
 * MotionRenderer quadro a quadro: o Chromium roda o bundle de motion do kernel
 * (o MESMO MotionFrameView do preview), cada quadro é posicionado no tempo exato
 * (inclusive vídeos capturados) e capturado em JPEG, e o FFmpeg codifica pelo stdin.
 * Determinístico (sem relógio real) e sem rede.
 */
export class ChromiumFfmpegMotionRenderer implements MotionRenderer {
  constructor(private readonly options: { projectRoot?: string; ffmpeg?: string; frameTimeoutMs?: number } = {}) {}

  async render(input: VideoRenderInput, options: { loadAsset: AssetLoader; signal: AbortSignal; onProgress?: (ratio: number) => Promise<void> | void }): Promise<RenderedVideo> {
    options.signal.throwIfAborted();
    const plan = videoPlan(input.content, input.quality);
    const { width, height } = input.content.scenes[0].artboard;
    const outW = Math.round(width * plan.scale);
    const outH = Math.round(height * plan.scale);
    const dir = await mkdtemp(path.join(os.tmpdir(), "atlas-video-"));
    let browser: Browser | undefined;
    let encoder: EncoderProcess | undefined;
    const onAbort = () => {
      encoder?.kill();
      void browser?.close().catch(() => undefined); // já fechando
    };
    options.signal.addEventListener("abort", onAbort, { once: true });
    try {
      const bundle = await getRenderBundle(RENDER_ENTRIES.motion);
      let audio: { file: string; volume: number; fadeOutMs: number } | null = null;
      if (input.audio) {
        const file = path.join(dir, `audio.${AUDIO_EXT[input.audio.mimeType] ?? "bin"}`);
        await writeFile(file, input.audio.bytes);
        audio = { file, volume: input.audio.volume, fadeOutMs: input.audio.fadeOutMs };
      }
      const output = path.join(dir, `video.${input.format}`);

      browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"] });
      const page = await browser.newPage({ viewport: { width: outW, height: outH }, deviceScaleFactor: 1 });
      page.setDefaultTimeout(this.options.frameTimeoutMs ?? 30_000);
      await installRenderRoutes(page, { loadAsset: options.loadAsset, projectRoot: this.options.projectRoot });
      const payload = JSON.stringify({ content: input.content, tokens: input.tokens, origin: RENDER_ORIGIN, videos: input.videoAssetIds, scale: plan.scale }).replace(/</g, "\\u003c");
      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><style>${renderFontCss()}
html,body{margin:0;padding:0;background:#000;overflow:hidden}</style></head><body><div id="root"></div>
<script>window.__ATLAS_MOTION__=${payload};</script><script>${bundle}</script></body></html>`,
        { waitUntil: "load" }
      );
      await page.waitForFunction(() => typeof window.__ATLAS_SEEK__ === "function");

      encoder = startEncoder(encoderArgs({ format: input.format, fps: plan.fps, durationMs: plan.durationMs, output, quality: input.quality, audio }), this.options.ffmpeg);
      for (let frame = 0; frame < plan.frames; frame++) {
        options.signal.throwIfAborted();
        const t = (frame * 1000) / plan.fps;
        await page.evaluate((ms) => window.__ATLAS_SEEK__!(ms), t);
        const jpeg = await page.screenshot({ type: "jpeg", quality: input.quality === "preview" ? 78 : 92, clip: { x: 0, y: 0, width: outW, height: outH } });
        await encoder.write(new Uint8Array(jpeg));
        if (frame % 10 === 0 || frame === plan.frames - 1) await options.onProgress?.((frame + 1) / plan.frames);
      }
      await encoder.finish();
      encoder = undefined;
      const bytes = new Uint8Array(await readFile(output));
      return {
        format: input.format,
        bytes,
        mimeType: input.format === "mp4" ? "video/mp4" : "video/webm",
        extension: input.format,
        width: outW % 2 === 0 ? outW : outW - 1,
        height: outH % 2 === 0 ? outH : outH - 1,
        durationMs: plan.durationMs,
        frames: plan.frames,
      };
    } catch (err) {
      if (options.signal.aborted) throw options.signal.reason;
      throw err;
    } finally {
      options.signal.removeEventListener("abort", onAbort);
      encoder?.kill();
      await browser?.close().catch(() => undefined);
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { StyleTokens } from "../core/creative/tokens";
import type { MotionContent } from "../core/motion/motion";
import { MotionFrameView } from "./motion-view";

/**
 * Entrada do bundle que roda DENTRO do Chromium no render de vídeo. Expõe
 * `__ATLAS_SEEK__(ms)`: desenha o quadro síncrono (flushSync), posiciona os vídeos
 * capturados no tempo exato e espera imagens/fontes — só então o quadro é capturado.
 * Empacotado por src/infrastructure/render/render-bundle.ts (esbuild).
 */
interface MotionPayload {
  content: MotionContent;
  tokens: StyleTokens;
  origin: string;
  videos: string[];
  scale: number;
}

declare global {
  interface Window {
    __ATLAS_MOTION__?: MotionPayload;
    __ATLAS_SEEK__?: (timeMs: number) => Promise<void>;
  }
}

function waitFor(el: HTMLMediaElement, event: string): Promise<void> {
  return new Promise((resolve) => el.addEventListener(event, () => resolve(), { once: true }));
}

async function seekVideos(root: HTMLElement): Promise<void> {
  const videos = [...root.querySelectorAll<HTMLVideoElement>("video[data-atlas-video]")];
  await Promise.all(
    videos.map(async (video) => {
      if (video.readyState < 1) await waitFor(video, "loadedmetadata");
      const wanted = Number(video.dataset.time ?? "0");
      // Vídeo capturado mais curto que a cena: repete.
      const target = video.duration && Number.isFinite(video.duration) ? wanted % video.duration : wanted;
      if (Math.abs(video.currentTime - target) > 0.0005 || video.readyState < 2) {
        const seeked = waitFor(video, "seeked");
        video.currentTime = target;
        await seeked;
      }
    })
  );
}

async function settleImages(root: HTMLElement): Promise<void> {
  await Promise.all([...root.querySelectorAll("img")].map((img) => (img.complete ? img.decode().catch(() => undefined) : new Promise((r) => img.addEventListener("load", r, { once: true })))));
  await document.fonts.ready;
}

const payload = window.__ATLAS_MOTION__;
const host = document.getElementById("root");
if (payload && host) {
  const root = createRoot(host);
  const videos = new Set(payload.videos);
  const { width, height } = payload.content.scenes[0].artboard;
  const resolveAsset = (id: string) => `${payload.origin}/asset/${encodeURIComponent(id)}`;
  window.__ATLAS_SEEK__ = async (timeMs: number) => {
    flushSync(() =>
      root.render(
        <div style={{ width: width * payload.scale, height: height * payload.scale, overflow: "hidden" }}>
          <div style={{ width, height, transform: payload.scale === 1 ? undefined : `scale(${payload.scale})`, transformOrigin: "0 0" }}>
            <MotionFrameView content={payload.content} timeMs={timeMs} tokens={payload.tokens} resolveAsset={resolveAsset} videos={videos} />
          </div>
        </div>
      )
    );
    await seekVideos(host);
    await settleImages(host);
  };
}

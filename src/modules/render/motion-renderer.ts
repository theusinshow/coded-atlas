import type { StyleTokens } from "../../core/creative/tokens";
import type { MotionContent } from "../../core/motion/motion";

/**
 * Porta do renderer de vídeo (docs/MOTION-ENGINE.md → Rendering): MotionDocument
 * → arquivo de vídeo. O domínio fica neutro de fornecedor; o adapter inicial
 * desenha os quadros com o MESMO kernel do preview (Chromium) e codifica com FFmpeg.
 */
export type VideoFormat = "mp4" | "webm";
/** preview = rápido (metade da resolução, 15 fps); final = resolução e fps do documento. */
export type VideoQuality = "preview" | "final";

export interface VideoRenderInput {
  content: MotionContent;
  tokens: StyleTokens;
  format: VideoFormat;
  quality: VideoQuality;
  /** Assets que são vídeo (movimento capturado) — o kernel os desenha como <video>. */
  videoAssetIds: readonly string[];
  /** Trilha já carregada (null = vídeo mudo). */
  audio: { bytes: Uint8Array; mimeType: string; volume: number; fadeOutMs: number } | null;
}

export interface RenderedVideo {
  format: VideoFormat;
  bytes: Uint8Array;
  mimeType: string;
  extension: string;
  width: number;
  height: number;
  durationMs: number;
  frames: number;
}

export interface MotionRenderer {
  render(
    input: VideoRenderInput,
    options: {
      loadAsset: (assetId: string) => Promise<{ bytes: Uint8Array; mimeType: string } | null>;
      signal: AbortSignal;
      /** 0..1 conforme os quadros saem. */
      onProgress?: (ratio: number) => Promise<void> | void;
    }
  ): Promise<RenderedVideo>;
}

/** Quadros e fps efetivos de um render (puro — usado pelo adapter e nos testes). */
export function videoPlan(content: Pick<MotionContent, "fps" | "scenes">, quality: VideoQuality): { fps: number; frames: number; scale: number; durationMs: number } {
  const durationMs = content.scenes.reduce((sum, s) => sum + s.durationMs, 0);
  const fps = quality === "preview" ? Math.min(15, content.fps) : content.fps;
  return { fps, frames: Math.max(1, Math.ceil((durationMs / 1000) * fps)), scale: quality === "preview" ? 0.5 : 1, durationMs };
}

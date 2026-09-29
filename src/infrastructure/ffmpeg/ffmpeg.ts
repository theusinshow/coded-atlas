import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";

/**
 * FFmpeg como processo filho (nunca via shell — argumentos são uma lista). O
 * binário vem de ATLAS_FFMPEG ou do PATH. Só a infraestrutura conhece o FFmpeg
 * (docs/AI-GUARDRAILS.md: a IA nunca chama FFmpeg diretamente).
 */
export function ffmpegPath(env: Record<string, string | undefined> = process.env): string {
  return env.ATLAS_FFMPEG?.trim() || "ffmpeg";
}

/** Versão do FFmpeg disponível, ou null (para a tela de Ajustes e mensagens claras). */
export async function ffmpegVersion(bin = ffmpegPath()): Promise<string | null> {
  return new Promise((resolve) => {
    let out = "";
    const child = spawn(bin, ["-hide_banner", "-version"], { windowsHide: true });
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.on("error", () => resolve(null));
    child.on("close", (code) => resolve(code === 0 ? (/ffmpeg version (\S+)/.exec(out)?.[1] ?? "desconhecida") : null));
  });
}

export interface EncoderProcess {
  /** Escreve um quadro respeitando backpressure do stdin. */
  write(frame: Uint8Array): Promise<void>;
  /** Fecha a entrada e espera o FFmpeg terminar (erro com o fim do stderr). */
  finish(): Promise<void>;
  kill(): void;
}

export function startEncoder(args: string[], bin = ffmpegPath()): EncoderProcess {
  const child: ChildProcessWithoutNullStreams = spawn(bin, ["-hide_banner", "-loglevel", "error", ...args], { windowsHide: true });
  let stderr = "";
  child.stderr.on("data", (d: Buffer) => {
    stderr = (stderr + d.toString()).slice(-4000);
  });
  let spawnError: Error | null = null;
  child.on("error", (err) => {
    spawnError = err;
  });
  const closed = once(child, "close") as Promise<[number | null]>;
  return {
    async write(frame) {
      if (spawnError) throw new Error(`FFmpeg não iniciou (${spawnError.message}). Instale o FFmpeg ou defina ATLAS_FFMPEG.`);
      if (!child.stdin.write(Buffer.from(frame))) await Promise.race([once(child.stdin, "drain"), closed]);
    },
    async finish() {
      child.stdin.end();
      const [code] = await closed;
      if (spawnError) throw new Error(`FFmpeg não iniciou (${(spawnError as Error).message}). Instale o FFmpeg ou defina ATLAS_FFMPEG.`);
      if (code !== 0) throw new Error(`FFmpeg falhou (código ${code}): ${stderr.trim().split("\n").slice(-3).join(" | ")}`);
    },
    kill() {
      child.kill("SIGKILL");
    },
  };
}

export interface EncodeOptions {
  format: "mp4" | "webm";
  fps: number;
  durationMs: number;
  output: string;
  quality: "preview" | "final";
  audio: { file: string; volume: number; fadeOutMs: number } | null;
}

/** Argumentos do FFmpeg: quadros JPEG pelo stdin → H.264/MP4 ou VP9/WebM (+ trilha). */
export function encoderArgs(o: EncodeOptions): string[] {
  const seconds = (o.durationMs / 1000).toFixed(3);
  const args = ["-y", "-f", "image2pipe", "-framerate", String(o.fps), "-c:v", "mjpeg", "-i", "-"];
  if (o.audio) args.push("-i", o.audio.file);
  // yuv420p exige dimensões pares (o preview a meia resolução pode dar ímpar).
  args.push("-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-map", "0:v:0");
  if (o.format === "mp4") {
    args.push("-c:v", "libx264", "-preset", o.quality === "preview" ? "veryfast" : "medium", "-crf", o.quality === "preview" ? "28" : "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart");
  } else {
    args.push("-c:v", "libvpx-vp9", "-b:v", "0", "-crf", o.quality === "preview" ? "40" : "32", "-row-mt", "1", "-deadline", o.quality === "preview" ? "realtime" : "good", "-cpu-used", o.quality === "preview" ? "8" : "2", "-pix_fmt", "yuv420p");
  }
  if (o.audio) {
    const fade = Math.min(o.audio.fadeOutMs, o.durationMs) / 1000;
    const filters = ["apad", `volume=${o.audio.volume.toFixed(2)}`];
    if (fade > 0) filters.push(`afade=t=out:st=${Math.max(0, o.durationMs / 1000 - fade).toFixed(3)}:d=${fade.toFixed(3)}`);
    args.push("-map", "1:a:0", "-af", filters.join(","));
    args.push(...(o.format === "mp4" ? ["-c:a", "aac", "-b:a", "160k"] : ["-c:a", "libopus", "-b:a", "128k"]));
  }
  // Duração exata do documento (áudio mais longo é cortado; mais curto vira silêncio).
  args.push("-t", seconds, o.output);
  return args;
}

/**
 * Um quadro de um vídeo como PNG (pôster de miniatura). Lê o arquivo do disco
 * (MP4 com índice no fim não aceita stdin) e devolve os bytes pelo stdout.
 */
export async function extractFrame(videoFile: string, atSeconds = 1, bin = ffmpegPath()): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["-hide_banner", "-loglevel", "error", "-ss", String(atSeconds), "-i", videoFile, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"], { windowsHide: true });
    const chunks: Buffer[] = [];
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.stderr.on("data", (d: Buffer) => (stderr = (stderr + d.toString()).slice(-2000)));
    child.on("error", (err) => reject(new Error(`FFmpeg não iniciou (${err.message}).`)));
    child.on("close", (code) => {
      const bytes = Buffer.concat(chunks);
      if (code === 0 && bytes.byteLength > 0) resolve(new Uint8Array(bytes));
      else reject(new Error(`FFmpeg não extraiu o quadro (código ${code}): ${stderr.trim().split("\n").at(-1) ?? ""}`));
    });
  });
}

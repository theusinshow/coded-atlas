"use client";
import { useEffect, useRef, useState } from "react";
import type { StyleTokens } from "@/src/core/creative/tokens";
import { sceneAt, totalDurationMs, type MotionContent } from "@/src/core/motion/motion";
import { MotionFrameView } from "@/src/render/motion-view";
import { assetFileUrl } from "@/components/atlas/asset-image";

const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}.${Math.floor((ms % 1000) / 100)}`;

/**
 * Preview interativo do vídeo no navegador (não é o render final — docs/MOTION-ENGINE.md
 * → Preview): o mesmo kernel quadro a quadro com requestAnimationFrame.
 */
export function MotionPlayer({
  content,
  tokens,
  startScene,
  onClose,
  videos,
  audioSrc,
  audioVolume,
}: {
  content: MotionContent;
  tokens: StyleTokens;
  startScene: number;
  onClose: (sceneIndex: number) => void;
  videos?: ReadonlySet<string>;
  audioSrc: string | null;
  audioVolume: number;
}) {
  const total = totalDurationMs(content);
  const startMs = content.scenes.slice(0, startScene).reduce((sum, s) => sum + s.durationMs, 0);
  const [time, setTime] = useState(startMs);
  const [playing, setPlaying] = useState(true);
  const [loop, setLoop] = useState(true);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const timeRef = useRef(time);
  timeRef.current = time;
  const frameRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Vídeos capturados seguem o tempo da cena (data-time); repetem se forem mais curtos.
  useEffect(() => {
    for (const video of frameRef.current?.querySelectorAll<HTMLVideoElement>("video[data-atlas-video]") ?? []) {
      const wanted = Number(video.dataset.time ?? "0");
      const target = video.duration && Number.isFinite(video.duration) ? wanted % video.duration : wanted;
      if (Math.abs(video.currentTime - target) > 0.15) video.currentTime = target;
    }
  }, [time]);

  // Trilha: toca junto, corrige deriva, pausa com o player.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = audioVolume;
    if (Math.abs(audio.currentTime - time / 1000) > 0.25) audio.currentTime = time / 1000;
    if (playing && audio.paused) void audio.play().catch(() => undefined);
    if (!playing && !audio.paused) audio.pause();
  }, [time, playing, audioVolume]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setBox({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const next = timeRef.current + (now - last);
      last = now;
      if (next >= total) {
        if (loop) setTime(0);
        else {
          setTime(total);
          setPlaying(false);
          return;
        }
      } else setTime(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, loop, total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(sceneAt(content, timeRef.current).index);
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [content, onClose]);

  const { width, height } = content.scenes[0].artboard;
  const scale = box.w > 0 ? Math.min((box.w - 48) / width, (box.h - 48) / height) : 0;
  const current = sceneAt(content, time);

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-[#050507]" role="dialog" aria-label="Preview do vídeo" data-motion-player>
      <div ref={ref} className="flex-1 min-h-0 grid place-items-center overflow-hidden">
        {scale > 0 && (
          <div ref={frameRef} style={{ width: width * scale, height: height * scale }} className="relative shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
            <div className="absolute left-0 top-0 origin-top-left" style={{ width, height, transform: `scale(${scale})` }}>
              <MotionFrameView content={content} timeMs={time} tokens={tokens} resolveAsset={assetFileUrl} videos={videos} />
            </div>
          </div>
        )}
      </div>
      {audioSrc && <audio ref={audioRef} src={audioSrc} preload="auto" />}
      <div className="shrink-0 flex items-center gap-3 border-t border-line px-3 py-2">
        <button type="button" onClick={() => setPlaying((p) => !p)} className="h-8 w-16 bg-accent text-zinc-950 text-[12px] font-medium" aria-label={playing ? "Pausar" : "Tocar"}>
          {playing ? "❚❚" : "▶"}
        </button>
        <input
          type="range"
          aria-label="Posição no vídeo"
          min={0}
          max={total}
          step={10}
          value={Math.round(time)}
          onChange={(e) => {
            setPlaying(false);
            setTime(Number(e.target.value));
          }}
          className="flex-1 accent-[var(--color-accent)]"
        />
        <span className="text-[11px] font-mono tabular-nums text-zinc-400 w-32 text-right">
          {clock(time)} / {clock(total)}
        </span>
        <span className="text-[11px] font-mono text-zinc-500">
          cena {current.index + 1}/{content.scenes.length}
        </span>
        <label className="flex items-center gap-1.5 text-[11px] text-zinc-400">
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> repetir
        </label>
        <button type="button" onClick={() => onClose(current.index)} className="h-8 px-3 border border-line text-[12px] text-zinc-300 hover:text-zinc-50">
          Editar cena
        </button>
      </div>
      <p className="px-3 pb-2 text-[10px] text-zinc-600">Preview no navegador — o arquivo de vídeo final sai do render (Espaço pausa, Esc volta a editar).</p>
    </div>
  );
}

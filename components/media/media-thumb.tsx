/* eslint-disable @next/next/no-img-element -- miniaturas servidas pelo AssetStorage; o otimizador do Next não enxerga essa origem */
import { Play } from "lucide-react";
import { formatDuration } from "@/components/ui/format";

/**
 * Miniatura de mídia para grades: sempre `<img>` (vídeo vira quadro de pôster da
 * rota de thumb), carregamento preguiçoso e `srcSet` 320/640 — o vídeo de verdade
 * só carrega no detalhe ou ao abrir. Vídeo leva o selo Play + duração.
 */
export function MediaThumb({
  src,
  srcSet,
  sizes,
  alt,
  fit = "cover",
  video = false,
  durationMs,
  className = "",
}: {
  src: string;
  srcSet?: string;
  sizes?: string;
  alt: string;
  fit?: "cover" | "contain";
  video?: boolean;
  durationMs?: number | null;
  className?: string;
}) {
  return (
    <span className={`relative block h-full w-full bg-surface-2 ${className}`}>
      <img
        src={src}
        srcSet={srcSet}
        sizes={srcSet ? sizes : undefined}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={`absolute inset-0 h-full w-full ${fit === "cover" ? "object-cover object-top" : "object-contain"}`}
      />
      {video && (
        <span className="pointer-events-none absolute bottom-2 left-2 inline-flex h-6 items-center gap-1 bg-base/85 px-1.5 text-[11px] font-medium tabular-nums text-cbm-white">
          <Play size={12} aria-hidden className="fill-current" />
          {durationMs ? formatDuration(durationMs) : <span className="sr-only">Vídeo</span>}
        </span>
      )}
    </span>
  );
}

/** `srcSet` padrão das rotas de thumb do Atlas (larguras suportadas: 320, 640, 1280). */
export function thumbSrcSet(url: (width: 320 | 640 | 1280) => string): string {
  return `${url(320)} 320w, ${url(640)} 640w`;
}

/* eslint-disable @next/next/no-img-element -- bytes servidos pelo AssetStorage */
import type { Output } from "@/src/core/assets/output";

export const outputFileUrl = (id: string, download = false) => `/api/atlas/outputs/${id}/file${download ? "?download=1" : ""}`;
export const outputThumbUrl = (id: string, width: 320 | 640 | 1280 = 640) => `/api/atlas/outputs/${id}/thumb?w=${width}`;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Cartão de uma peça final: miniatura, dados técnicos e download. */
export function OutputCard({ output, compact = false }: { output: Output; compact?: boolean }) {
  const isImage = output.mimeType.startsWith("image/");
  const isVideo = output.mimeType.startsWith("video/");
  return (
    <div className="space-y-2" data-output={output.id}>
      {isVideo ? (
        // Vídeo fora do link: os controles do player não podem navegar.
        <video
          src={outputFileUrl(output.id)}
          controls
          muted
          playsInline
          preload="metadata"
          className="block w-full border border-line bg-black"
          style={output.width && output.height ? { aspectRatio: `${output.width} / ${output.height}` } : undefined}
        />
      ) : (
        <a href={outputFileUrl(output.id)} target="_blank" rel="noreferrer" className="block border border-line hover:border-zinc-500 transition-colors bg-surface-2">
          {isImage ? (
            <img
              src={outputThumbUrl(output.id, compact ? 320 : 640)}
              alt={output.label ?? output.format}
              loading="lazy"
              className="w-full object-contain"
              style={output.width && output.height ? { aspectRatio: `${output.width} / ${output.height}` } : undefined}
            />
          ) : (
            <div className="aspect-video grid place-items-center text-center">
              <span className="text-2xl font-mono text-accent">{output.format.toUpperCase()}</span>
              <span className="text-[10px] font-mono text-zinc-500">{output.format === "pptx" ? "apresentação" : output.format === "pdf" ? "documento" : output.format === "zip" ? (output.metadata.caseModule === "web" ? "página web" : "pacote") : "arquivo"}</span>
            </div>
          )}
        </a>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={compact ? "text-[11px] text-zinc-300 truncate" : "text-[12px] text-zinc-200 truncate"} title={output.label ?? undefined}>
            {output.label ?? "Peça"}
          </p>
          <p className="text-[11px] font-mono text-zinc-500">
            {output.format.toUpperCase()}
            {output.width && output.height ? ` · ${output.width}×${output.height}` : ""}
            {output.durationMs ? ` · ${(output.durationMs / 1000).toFixed(1)} s` : ""}
            {output.metadata.quality === "preview" ? " · preview" : ""} · {formatBytes(output.byteSize)}
          </p>
        </div>
        <a href={outputFileUrl(output.id, true)} className="text-[11px] font-mono uppercase tracking-wider text-accent hover:text-accent-bright shrink-0">
          Baixar
        </a>
      </div>
    </div>
  );
}

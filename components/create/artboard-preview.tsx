"use client";
import { useEffect, useRef, useState } from "react";
import type { Artboard } from "@/src/core/documents/artboard";
import type { StyleTokens } from "@/src/core/creative/tokens";
import { ArtboardView } from "@/src/render/artboard-view";
import { assetFileUrl } from "@/components/atlas/asset-image";

/**
 * Preview ao vivo: o MESMO ArtboardView do render estático, desenhado no
 * tamanho real e reduzido por transform para caber no container.
 */
export function ArtboardPreview({
  artboard,
  tokens,
  className = "",
  mode = "preview",
}: {
  artboard: Artboard;
  tokens: StyleTokens;
  className?: string;
  mode?: "preview" | "render";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`relative overflow-hidden bg-surface-2 ${className}`} style={{ aspectRatio: `${artboard.width} / ${artboard.height}` }}>
      {width > 0 && (
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ width: artboard.width, height: artboard.height, transform: `scale(${width / artboard.width})` }}
        >
          <ArtboardView artboard={artboard} tokens={tokens} mode={mode} resolveAsset={assetFileUrl} />
        </div>
      )}
    </div>
  );
}

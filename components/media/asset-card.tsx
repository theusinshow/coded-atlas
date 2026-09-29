import Link from "next/link";
import { assetThumbUrl } from "@/components/atlas/asset-image";
import { formatBytes } from "@/components/ui/format";
import type { Asset } from "@/src/core/assets/asset";
import { mediaDetail, mediaTitle } from "./labels";
import { MediaThumb, thumbSrcSet } from "./media-thumb";

/** Largura efetiva dos cartões nas grades de 2/3/4 colunas (para o navegador escolher 320 ou 640). */
export const GRID_SIZES = "(min-width: 1024px) 280px, (min-width: 640px) 33vw, 50vw";

/**
 * Cartão de um arquivo do projeto (Material, Biblioteca): o cartão inteiro é o
 * link para o detalhe. Título legível + uma linha discreta; dimensões e tamanho
 * ficam no detalhe (e no tooltip).
 */
export function AssetCard({ asset, href, context }: { asset: Asset; href: string; context?: string }) {
  const title = mediaTitle(asset);
  const detail = mediaDetail(asset);
  const isVideo = asset.mimeType.startsWith("video/");
  const isAudio = asset.mimeType.startsWith("audio/");
  const tech = [asset.width && asset.height ? `${asset.width}×${asset.height}` : null, formatBytes(asset.byteSize)].filter(Boolean).join(" · ");
  return (
    <Link href={href} title={`${title} · ${tech}`} className="group block border border-line bg-surface transition-colors hover:border-cbm-gray-400 focus-visible:border-cbm-white">
      <span className="block aspect-[16/10] overflow-hidden border-b border-line">
        {isAudio ? (
          <span className="grid h-full w-full place-items-center bg-surface-2 text-[12px] text-cbm-gray-400">Áudio</span>
        ) : (
          <MediaThumb src={assetThumbUrl(asset.id, 640)} srcSet={thumbSrcSet((w) => assetThumbUrl(asset.id, w))} sizes={GRID_SIZES} alt={title} video={isVideo} />
        )}
      </span>
      <span className="block px-3 py-2.5">
        <span className="block truncate text-[13px] text-cbm-gray-200 transition-colors group-hover:text-cbm-white">{title}</span>
        <span className="block truncate text-[12px] text-cbm-gray-400">{context ? `${context} · ${detail}` : detail}</span>
      </span>
    </Link>
  );
}

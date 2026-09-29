/* eslint-disable @next/next/no-img-element -- bytes servidos pelo AssetStorage; o otimizador do Next não enxerga essa origem */

/** URLs de mídia do AssetStorage (nunca caminhos de disco). */
export const assetFileUrl = (id: string) => `/api/atlas/assets/${id}/file`;
export const assetThumbUrl = (id: string, width: 320 | 640 | 1280 = 640) => `/api/atlas/assets/${id}/thumb?w=${width}`;

export function AssetThumb({
  id,
  alt,
  width = 640,
  className = "",
}: {
  id: string | null | undefined;
  alt: string;
  width?: 320 | 640 | 1280;
  className?: string;
}) {
  if (!id) {
    return (
      <div className={`grid place-items-center bg-surface-2 text-[11px] text-cbm-gray-400 ${className}`}>
        Sem imagem
      </div>
    );
  }
  return <img src={assetThumbUrl(id, width)} alt={alt} loading="lazy" decoding="async" className={`object-cover object-top bg-surface-2 ${className}`} />;
}

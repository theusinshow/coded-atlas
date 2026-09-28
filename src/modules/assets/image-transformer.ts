/**
 * Porta para transformações de imagem que geram Assets DERIVADOS (o original
 * nunca muda — asset A → transformação → asset B com parentAssetId = A).
 * Implementação: src/infrastructure/sharp/image-transformer.ts.
 */
export interface TransformedImage {
  bytes: Uint8Array;
  width: number;
  height: number;
  mimeType: string;
  extension: string;
}

export interface ImageTransformer {
  /** Recorte inteligente (região de maior interesse) no tamanho exato pedido. */
  coverCrop(source: Uint8Array, width: number, height: number): Promise<TransformedImage>;
}

import type { Artboard } from "../../core/documents/artboard";
import type { StyleTokens } from "../../core/creative/tokens";

/**
 * Porta do renderer estático (docs/ARCHITECTURE.md → StaticRenderer): Artboard +
 * tokens → imagens. Preview (navegador) e render final usam o MESMO kernel de
 * render (src/render); aqui só se decide o destino (arquivo).
 */
export type RasterFormat = "png" | "jpg" | "webp";

export interface RenderItem {
  artboard: Artboard;
  tokens: StyleTokens;
  formats: readonly RasterFormat[];
}

export interface RenderedImage {
  format: RasterFormat;
  bytes: Uint8Array;
  mimeType: string;
  extension: string;
  width: number;
  height: number;
}

export interface StaticRenderer {
  /** Renderiza vários artboards reaproveitando um navegador. Mesma ordem da entrada. */
  renderBatch(
    items: readonly RenderItem[],
    options: { loadAsset: (assetId: string) => Promise<{ bytes: Uint8Array; mimeType: string } | null>; signal: AbortSignal }
  ): Promise<RenderedImage[][]>;
}

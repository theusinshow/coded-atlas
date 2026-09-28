import type { CaseContent } from "../../core/case/case-document";
import type { StyleTokens } from "../../core/creative/tokens";

/**
 * Porta de saída do Case Builder (docs/ROADMAP.md 2.13 → web/PDF/Behance-style):
 * o MESMO CaseView do editor vira página web autônoma (ZIP), PDF paginado e
 * módulos de imagem de 1400 px (formato de projeto do Behance).
 */
export type CaseOutputKind = "web" | "pdf" | "modules";

export type MediaLoader = (id: string) => Promise<{ bytes: Uint8Array; mimeType: string } | null>;

export interface CaseExportResult {
  /** ZIP com index.html + assets/ + fonts/. */
  web?: Uint8Array;
  pdf?: Uint8Array;
  modules?: { id: string; bytes: Uint8Array; width: number; height: number }[];
}

export interface CaseExporter {
  export(
    input: { content: CaseContent; tokens: StyleTokens; title: string },
    kinds: readonly CaseOutputKind[],
    options: { loadAsset: MediaLoader; loadOutput: MediaLoader; signal: AbortSignal }
  ): Promise<CaseExportResult>;
}

/** Largura dos módulos (Behance recomenda 1400 px). */
export const CASE_MODULE_WIDTH = 1400;

/**
 * Porta de exportação de documentos multipágina (docs/ROADMAP.md 2.12 → PDF/PPTX):
 * recebe as páginas JÁ renderizadas pelo kernel (imagens) e monta o arquivo. Assim
 * PDF, PPTX e PNG saem idênticos ao preview — a exportação não redesenha nada.
 */
export interface ExportPage {
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png";
  width: number;
  height: number;
  title?: string;
  /** Notas do apresentador (PPTX). */
  notes?: string;
}

export interface ExportMeta {
  title: string;
  author: string;
  subject?: string;
}

export interface DocumentExporter {
  toPdf(pages: readonly ExportPage[], meta: ExportMeta): Promise<Uint8Array>;
  toPptx(pages: readonly ExportPage[], meta: ExportMeta): Promise<Uint8Array>;
}

export const EXPORT_MIME = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
} as const;

import type { AssetMetadata } from "../../core/assets/asset";
import type { SessionState } from "./session-store";

/**
 * Porta da engine de captura. A aplicação pede fotos/vídeos e recebe bytes;
 * navegador, contexto e arquivos temporários são da implementação
 * (src/infrastructure/playwright). O `signal` é obrigatório: abortar deve
 * interromper o trabalho real (fechar o navegador) e rejeitar a promessa.
 */
export interface ViewportSpec {
  label: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
}

export interface ViewportShot {
  png: Uint8Array;
  /** Dimensões reais em pixels do PNG (viewport × deviceScaleFactor). */
  width: number;
  height: number;
  /** URL final após redirecionamentos. */
  finalUrl: string;
}

export interface SiteCaptureRequest {
  url: string;
  viewports: ViewportSpec[];
  fullPage: boolean;
  sections: boolean;
  video: boolean;
  inspect: boolean;
  /** URLs absolutas de páginas extras (já resolvidas e validadas). */
  pages: string[];
  states: { name: string; selector: string }[];
  /** Sessão autenticada do projeto (login salvo); ausente = visita anônima. */
  session?: SessionState | null;
  signal: AbortSignal;
  onProgress?: (fraction: number, message: string) => void;
}

export interface CapturedMedia {
  bytes: Uint8Array;
  mimeType: string;
  extension: string;
  kind: "screenshot" | "section" | "video";
  width: number | null;
  height: number | null;
  label: string;
  metadata: AssetMetadata;
}

export interface SiteInspection {
  colors: string[];
  fonts: string[];
  techStack: string[];
  ogImage?: string;
}

export interface CaptureWarning {
  code: string;
  message: string;
  device?: "desktop" | "mobile";
}

export interface SiteCaptureResult {
  media: CapturedMedia[];
  inspection: SiteInspection | null;
  warnings: CaptureWarning[];
  finalUrl: string;
}

export interface CaptureEngine {
  captureViewport(request: { url: string; viewport: ViewportSpec; session?: SessionState | null; signal: AbortSignal }): Promise<ViewportShot>;
  captureSite(request: SiteCaptureRequest): Promise<SiteCaptureResult>;
}

/** Entrada do formulário / corpo da requisição. */
export interface ProjectInput {
  url: string;
  name: string;
  slug: string;
  category: string;
  client?: string;
  description?: string;
}

/** Configuração de um viewport de captura. */
export interface ViewportConfig {
  label: string; // "desktop" | "mobile"
  width: number;
  height: number;
  deviceScaleFactor: number;
}

/** Resultado das capturas de um único device. */
export interface DeviceCapture {
  viewport: string; // "1440x900"
  screenshot: string; // caminho público, ex: /generated/slug/screenshots/desktop-1440x900.png
  fullpage: string; // caminho público
}

/** Inspeção da página: paleta, tipografia e tech stack (v0.3). */
export interface SiteInspection {
  colors: string[];     // hex "#1a2b3c"
  fonts: string[];      // "Inter", "Poppins"
  techStack: string[];  // "Next.js", "WordPress"
  ogImage?: string;     // URL da og:image / twitter:image do site
}

/** Estrutura final persistida em catalog.json. */
export interface Catalog {
  version: string; // versão do Atlas que gerou (ex: "0.1.0")
  project: ProjectInput;
  captures: {
    desktop: DeviceCapture;
    mobile: DeviceCapture;
  };
  thumbnails: {
    main: string; // caminho público
    mobile: string; // caminho público
  };
  videos?: {
    desktop?: string;
    mobile?: string;
  };
  sections: CatalogSection[];
  inspection?: SiteInspection; // v0.3 — paleta, fontes e tech stack
  cover?: {
    image: string;                        // caminho público /generated/.../thumbnails/cover.webp
    source: "og-image" | "smart-crop";   // como foi gerada
  };
  meta: CatalogMeta;
  createdAt: string; // new Date().toISOString()
}

/** Seção capturada por detecção semântica + scroll (v0.3). */
export interface CatalogSection {
  device: "desktop" | "mobile";
  name: string;           // "section-001"
  y: number;              // scroll Y no momento da captura
  height: number;         // altura do viewport
  screenshot: string;     // caminho público
  heading?: string;       // primeiro heading visível no viewport
  // v0.3 — detecção semântica
  suggestedName?: string; // "Hero", "Sobre Nós" — nome derivado do DOM
  semanticTag?: string;   // "header", "section", "footer", "article"
  sectionId?: string;     // valor do id / data-section do elemento
}

/** Metadados da execução — útil para debug e reprocessamento. */
export interface CatalogMeta {
  captureDelayMs: number;
  navTimeoutMs: number;
  durationMs: number; // tempo total da geração
  userAgent: string;
}

/** Passos do pipeline — alimentam o progresso na UI. */
export type CaptureStep =
  | "validating"
  | "launching"
  | "capturing-desktop"
  | "capturing-fullpage-desktop"
  | "capturing-sections-desktop"
  | "recording-video-desktop"
  | "capturing-mobile"
  | "capturing-fullpage-mobile"
  | "capturing-sections-mobile"
  | "recording-video-mobile"
  | "generating-thumbnails"
  | "writing-catalog"
  | "done"
  | "error";

/** Evento de progresso emitido pela engine e transmitido pela API. */
export interface ProgressEvent {
  step: CaptureStep;
  message: string; // texto pronto para exibir (PT-BR)
  progress: number; // 0–100
}

/** Evento final de sucesso. */
export interface ResultEvent {
  step: "done";
  catalog: Catalog;
  projectUrl: string; // /projects/[slug]
}

/** Código de erro estruturado da aplicação. */
export type AtlasErrorCode =
  | "INVALID_URL"
  | "UNREACHABLE"
  | "NAV_TIMEOUT"
  | "BLOCKED"
  | "RENDER_TIMEOUT"
  | "CAPTURE_FAILED"
  | "STORAGE_FAILED"
  | "SLUG_CONFLICT"
  | "SERVER_DOWN"
  | "UNKNOWN";

export interface AtlasErrorPayload {
  step: "error";
  code: AtlasErrorCode;
  message: string; // mensagem amigável em PT-BR
  detail?: string; // detalhe técnico para log (não exibir cru ao usuário)
}

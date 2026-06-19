import path from "node:path";

export const config = {
  outputDir: process.env.ATLAS_OUTPUT_DIR
    ? path.resolve(process.env.ATLAS_OUTPUT_DIR)
    : path.join(process.cwd(), "public", "generated"),

  headless: process.env.ATLAS_HEADLESS !== "false",
  navTimeoutMs: Number(process.env.ATLAS_NAV_TIMEOUT_MS ?? 30000),
  captureDelayMs: Number(process.env.ATLAS_CAPTURE_DELAY_MS ?? 3000),

  // ── Seções (v0.2) ──────────────────────────────────────────────────────────
  // % do viewport que cada passo de scroll avança (0.9 = 90% → leve sobreposição)
  sectionScrollRatio: Number(process.env.ATLAS_SECTION_SCROLL_RATIO ?? 0.9),
  // ms de pausa em cada seção (para animações assentarem e o vídeo mostrar o conteúdo)
  sectionDelayMs: Number(process.env.ATLAS_SECTION_DELAY_MS ?? 1200),
  // cap de segurança: máximo de seções por dispositivo
  maxSections: Number(process.env.ATLAS_MAX_SECTIONS ?? 20),

  // altura mínima (px) para um elemento ser considerado uma seção
  sectionMinHeight: Number(process.env.ATLAS_SECTION_MIN_HEIGHT ?? 200),

  // ── Capa do catálogo ──────────────────────────────────────────────────────
  // Proporção 1.91:1 (padrão OG), ideal para apresentações e redes sociais
  coverWidth:  Number(process.env.ATLAS_COVER_WIDTH  ?? 1200),
  coverHeight: Number(process.env.ATLAS_COVER_HEIGHT ?? 630),

  // ── Animação de scroll (vídeo) ─────────────────────────────────────────────
  // Mais passos + timing alinhado a 60fps → ~24 frames de animação por seção
  scrollSteps: Number(process.env.ATLAS_SCROLL_STEPS ?? 60),
  scrollStepMs: Number(process.env.ATLAS_SCROLL_STEP_MS ?? 16),

  // ── Features v0.2 (default ON; defina "false" via env para desabilitar) ────
  captureSections: process.env.ATLAS_CAPTURE_SECTIONS !== "false",
  captureVideo:    process.env.ATLAS_CAPTURE_VIDEO    !== "false",

  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",

  viewports: {
    desktop: { label: "desktop", width: 1440, height: 900,  deviceScaleFactor: 2 },
    mobile:  { label: "mobile",  width: 390,  height: 844,  deviceScaleFactor: 3 },
  },

  onSlugConflict: "overwrite" as "overwrite" | "fail",
  atlasVersion: "0.2.0",
} as const;

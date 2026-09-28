import path from "node:path";

const num = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && process.env[name]?.trim() ? value : fallback;
};

/**
 * Parâmetros da captura (viewports, esperas, limites de segurança) — herdados do
 * `lib/config.ts` do v1 com os mesmos nomes de variável de ambiente, para que
 * instalações existentes continuem com o mesmo comportamento. Único lugar desses
 * números: nada de timeout ou viewport espalhado pelo código.
 */
export const CAPTURE_SETTINGS = {
  headless: process.env.ATLAS_HEADLESS !== "false",
  navTimeoutMs: num("ATLAS_NAV_TIMEOUT_MS", 30_000),
  /** Espera de estabilidade antes da foto (fontes, imagens, animações). */
  captureDelayMs: num("ATLAS_CAPTURE_DELAY_MS", 3_000),
  /** Seções: fração do viewport por passo de scroll, pausa por seção, teto e altura mínima. */
  sectionScrollRatio: num("ATLAS_SECTION_SCROLL_RATIO", 0.9),
  sectionDelayMs: num("ATLAS_SECTION_DELAY_MS", 1_200),
  maxSections: num("ATLAS_MAX_SECTIONS", 20),
  sectionMinHeight: num("ATLAS_SECTION_MIN_HEIGHT", 200),
  /** Vídeo de scroll: passos e intervalo (~60 fps). */
  scrollSteps: num("ATLAS_SCROLL_STEPS", 60),
  scrollStepMs: num("ATLAS_SCROLL_STEP_MS", 16),
  /** Estados de interação: pausa depois do clique. */
  stateSettleMs: num("ATLAS_STATE_SETTLE_MS", 800),
  /** Limites de segurança: scroll infinito, páginas gigantes, ações travadas. */
  scrollMaxHeightPx: num("ATLAS_SCROLL_MAX_HEIGHT_PX", 30_000),
  scrollMaxMs: num("ATLAS_SCROLL_MAX_MS", 20_000),
  maxFullPageHeightPx: num("ATLAS_MAX_FULLPAGE_HEIGHT_PX", 16_000),
  actionTimeoutMs: num("ATLAS_ACTION_TIMEOUT_MS", 30_000),
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  viewports: {
    desktop: { label: "desktop", width: 1440, height: 900, deviceScaleFactor: 2 },
    mobile: { label: "mobile", width: 390, height: 844, deviceScaleFactor: 3 },
  },
} as const;

/**
 * Biblioteca do Atlas v1 (somente leitura, para a importação): `ATLAS_OUTPUT_DIR`
 * ou `public/generated`. O v1 não escreve mais nela.
 */
export function legacyLibraryDir(): string {
  const configured = process.env.ATLAS_OUTPUT_DIR?.trim();
  return configured ? path.resolve(configured) : path.join(process.cwd(), "public", "generated");
}

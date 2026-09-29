import { FONT_FAMILIES, type FontFamilyId } from "../core/creative/tokens";

/**
 * Arquivos das fontes curadas: @fontsource (subset latin — cobre acentos do
 * português) e as fontes da Coded by M empacotadas no repositório
 * (public/fonts/cbm, do design system). O renderer estático serve estes arquivos
 * localmente; o preview do navegador carrega os mesmos pela API de fontes.
 */
export interface FontFile {
  family: string;
  weight: number;
  /** Caminho relativo à raiz do projeto (lista fechada — nunca vem de fora). */
  file: string;
}

const SOURCES: Record<FontFamilyId, (weight: number) => string> = {
  panchang: (w) => `public/fonts/cbm/Panchang-${w}.woff2`,
  satoshi: (w) => `public/fonts/cbm/Satoshi-${w}.woff2`,
  "space-grotesk": (w) => `node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-${w}-normal.woff2`,
  inter: (w) => `node_modules/@fontsource/inter/files/inter-latin-${w}-normal.woff2`,
  sora: (w) => `node_modules/@fontsource/sora/files/sora-latin-${w}-normal.woff2`,
  "playfair-display": (w) => `node_modules/@fontsource/playfair-display/files/playfair-display-latin-${w}-normal.woff2`,
  "jetbrains-mono": (w) => `node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-${w}-normal.woff2`,
};

export function fontFiles(): FontFile[] {
  return (Object.keys(FONT_FAMILIES) as FontFamilyId[]).flatMap((id) =>
    FONT_FAMILIES[id].weights.map((weight) => ({ family: FONT_FAMILIES[id].css, weight, file: SOURCES[id](weight) }))
  );
}

/** CSS @font-face para todas as fontes curadas, com URLs geradas por `urlFor`. */
export function fontFaceCss(urlFor: (file: FontFile) => string): string {
  return fontFiles()
    .map(
      (f) =>
        `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};font-display:block;src:url(${urlFor(f)}) format('woff2');}`
    )
    .join("\n");
}

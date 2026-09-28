import { FONT_FAMILIES, type FontFamilyId } from "../core/creative/tokens";

/**
 * Arquivos das fontes curadas (@fontsource, subset latin — cobre acentos do
 * português). O renderer estático serve estes arquivos localmente; o preview do
 * navegador carrega os mesmos via CSS do pacote.
 */
export interface FontFile {
  family: string;
  weight: number;
  /** Caminho relativo a node_modules. */
  file: string;
}

const PACKAGES: Record<FontFamilyId, string> = {
  "space-grotesk": "space-grotesk",
  inter: "inter",
  sora: "sora",
  "playfair-display": "playfair-display",
  "jetbrains-mono": "jetbrains-mono",
};

export function fontFiles(): FontFile[] {
  return (Object.keys(FONT_FAMILIES) as FontFamilyId[]).flatMap((id) =>
    FONT_FAMILIES[id].weights.map((weight) => ({
      family: FONT_FAMILIES[id].css,
      weight,
      file: `@fontsource/${PACKAGES[id]}/files/${PACKAGES[id]}-latin-${weight}-normal.woff2`,
    }))
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

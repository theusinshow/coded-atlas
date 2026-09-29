import { z } from "zod";
import { COLOR_TOKENS, type ColorRef, type ColorToken, type FontRole } from "../documents/layer";
import { contrastRatio, luminance, saturation, type VisualProfile } from "./visual-profile";

/**
 * Tokens e Brand Adapter (docs/COMPOSITION-ENGINE.md → Style tokens, Brand Adapter).
 * Documentos referenciam tokens semânticos; aqui eles viram valores concretos a
 * partir do VisualProfile do projeto e do modo de estilo.
 */
export const StyleModeSchema = z.enum(["project", "atlas", "hybrid"]);
export type StyleMode = z.infer<typeof StyleModeSchema>;

/** Fontes curadas e empacotadas (render determinístico, sem internet). */
export const FONT_FAMILIES = {
  /** Coded by M (design system cbm-port): Panchang em títulos, Satoshi no corpo. */
  // widthFactor: largura média relativa à Space Grotesk (base em que as composições
  // foram desenhadas), medida no Chromium. O kernel compensa o corpo para a mesma
  // largura de linha — Panchang é 49% mais larga; as demais ficam em ±7% (sem ajuste).
  panchang: { css: "Panchang", kind: "sans", weights: [500, 600, 700, 800], widthFactor: 1.49 },
  satoshi: { css: "Satoshi", kind: "sans", weights: [300, 400, 500, 700] },
  "space-grotesk": { css: "Space Grotesk", kind: "sans", weights: [400, 500, 600, 700] },
  inter: { css: "Inter", kind: "sans", weights: [400, 500, 600, 700] },
  sora: { css: "Sora", kind: "sans", weights: [400, 500, 600, 700] },
  "playfair-display": { css: "Playfair Display", kind: "serif", weights: [400, 500, 600, 700] },
  "jetbrains-mono": { css: "JetBrains Mono", kind: "mono", weights: [400, 500, 600, 700] },
} as const;
export type FontFamilyId = keyof typeof FONT_FAMILIES;
export const FontFamilyIdSchema = z.enum(Object.keys(FONT_FAMILIES) as [FontFamilyId, ...FontFamilyId[]]);

const Hex = z.string().regex(/^#[0-9a-f]{6}$/);
export const StyleTokensSchema = z.strictObject({
  colors: z.strictObject(Object.fromEntries(COLOR_TOKENS.map((t) => [t, Hex])) as Record<ColorToken, typeof Hex>),
  fonts: z.strictObject({ display: FontFamilyIdSchema, body: FontFamilyIdSchema, mono: FontFamilyIdSchema }),
  /** Forma: 0 = cantos retos (Coded by M: "angular, não arredondado"), 1 = raios da composição. */
  radiusScale: z.number().min(0).max(1),
  /** Moldura de browser: neutra (modo projeto) ou a BrowserFrame da Coded by M (1 dot no sinal, marca de canto). */
  frame: z.enum(["neutral", "cbm"]),
});
export type StyleTokens = z.infer<typeof StyleTokensSchema>;

/**
 * Linguagem visual da Coded by M (design system cbm-port, DESIGN-LANGUAGE.md):
 * base profunda #000F08, estrutura off-white #F5F2ED, sinal #FB3640; Panchang +
 * Satoshi. Os mesmos valores da UI do Atlas (globals.css).
 */
export const ATLAS_TOKENS: StyleTokens = {
  colors: {
    background: "#000f08",
    surface: "#070b08",
    line: "#1a2418",
    text: "#f5f2ed",
    textMuted: "#8a8780",
    primary: "#fb3640",
    onPrimary: "#000f08",
    accent: "#fb3640",
  },
  // Micro-labels da marca são Satoshi uppercase com tracking largo — não monoespaçada.
  fonts: { display: "panchang", body: "satoshi", mono: "satoshi" },
  radiusScale: 0,
  frame: "cbm",
};

function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

export function mix(a: string, b: string, amount: number): string {
  const [ra, ga, ba] = hexToRgb(a);
  const [rb, gb, bb] = hexToRgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * amount).toString(16).padStart(2, "0");
  return `#${c(ra, rb)}${c(ga, gb)}${c(ba, bb)}`;
}

const readableOn = (bg: string) => (contrastRatio("#ffffff", bg) >= contrastRatio("#111111", bg) ? "#ffffff" : "#111111");

/** Sobre a cor de marca, nos modos da Coded by M: off-white/base quentes (nunca #fff/#000) quando passam AA. */
function readableOnBrand(bg: string): string {
  const warm = contrastRatio(ATLAS_TOKENS.colors.text, bg) >= contrastRatio(ATLAS_TOKENS.colors.background, bg) ? ATLAS_TOKENS.colors.text : ATLAS_TOKENS.colors.background;
  return contrastRatio(warm, bg) >= TEXT_CONTRAST ? warm : readableOn(bg);
}

/** Texto pequeno na cor de marca (rótulos) precisa de AA: 4,5:1 sobre o fundo. */
const TEXT_CONTRAST = 4.5;

/**
 * Aproxima a cor do extremo legível (preto/branco) só o necessário para chegar ao
 * contraste pedido — o tom da marca continua reconhecível.
 */
export function ensureContrast(color: string, background: string, target = TEXT_CONTRAST): string {
  const pole = readableOn(background);
  for (let step = 0; step <= 20; step++) {
    const candidate = step === 0 ? color : mix(color, pole, step * 0.05);
    if (contrastRatio(candidate, background) >= target) return candidate;
  }
  return pole;
}

/** Cor de marca: a mais saturada que se destaque do fundo. */
function brandColor(palette: readonly string[], background: string, minContrast: number): string | null {
  const candidates = palette
    .filter((c) => saturation(c) >= 0.35 && luminance(c) > 0.03 && luminance(c) < 0.92 && contrastRatio(c, background) >= minContrast)
    .sort((a, b) => saturation(b) - saturation(a));
  return candidates[0] ?? null;
}

const SERIF_HINT = /serif|playfair|garamond|georgia|times|lora|merriweather|baskerville|didot|caslon/i;

function matchFont(name: string): FontFamilyId | null {
  const n = name.toLowerCase().replace(/[^a-z]/g, "");
  for (const [id, f] of Object.entries(FONT_FAMILIES) as [FontFamilyId, (typeof FONT_FAMILIES)[FontFamilyId]][]) {
    if (f.css.toLowerCase().replace(/[^a-z]/g, "") === n) return id;
  }
  return null;
}

function projectFonts(profile: VisualProfile | null, fallback: StyleTokens["fonts"]): StyleTokens["fonts"] {
  if (!profile || profile.fonts.length === 0) return fallback;
  const matched = profile.fonts.map(matchFont).filter((f): f is FontFamilyId => f !== null && FONT_FAMILIES[f].kind !== "mono");
  const serif = profile.fonts.some((f) => SERIF_HINT.test(f));
  const display = matched[0] ?? (serif ? "playfair-display" : fallback.display);
  const body = matched.find((f) => FONT_FAMILIES[f].kind === "sans") ?? fallback.body;
  return { display, body, mono: fallback.mono };
}

/**
 * Brand Adapter: VisualProfile + modo → tokens concretos. Determinístico.
 * - atlas: linguagem Coded by M pura;
 * - project: cores e fontes do projeto (com contraste garantido);
 * - hybrid (padrão): neutros do Atlas + cor de marca e tipografia do projeto —
 *   o projeto mantém identidade dentro do sistema da Coded by M.
 */
export function resolveTokens(profile: VisualProfile | null, mode: StyleMode, overrides: { primary?: string } = {}): StyleTokens {
  const palette = profile?.palette ?? [];
  let tokens: StyleTokens;

  if (mode === "atlas" || palette.length === 0) {
    tokens = structuredClone(ATLAS_TOKENS);
  } else if (mode === "project") {
    const background = palette[0];
    const byContrast = [...palette].sort((a, b) => contrastRatio(b, background) - contrastRatio(a, background))[0];
    const text = contrastRatio(byContrast, background) >= 4.5 ? byContrast : readableOn(background);
    const brand = brandColor(palette, background, 2);
    const primary = brand ? ensureContrast(brand, background) : mix(text, background, 0.2);
    const second = brandColor(palette.filter((c) => c !== brand), background, 1.5);
    const accent = second ? ensureContrast(second, background) : primary;
    tokens = {
      colors: {
        background,
        surface: mix(background, text, 0.06),
        line: mix(background, text, 0.16),
        text,
        textMuted: ensureContrast(mix(text, background, 0.38), background),
        primary,
        onPrimary: readableOn(primary),
        accent,
      },
      fonts: projectFonts(profile, { ...ATLAS_TOKENS.fonts, mono: "jetbrains-mono" }),
      radiusScale: 1,
      frame: "neutral",
    };
  } else {
    const brand = brandColor(palette, ATLAS_TOKENS.colors.background, 3);
    const primary = brand ? ensureContrast(brand, ATLAS_TOKENS.colors.background) : ATLAS_TOKENS.colors.primary;
    tokens = {
      colors: { ...ATLAS_TOKENS.colors, primary, accent: primary, onPrimary: readableOnBrand(primary) },
      fonts: { ...projectFonts(profile, ATLAS_TOKENS.fonts), body: ATLAS_TOKENS.fonts.body },
      radiusScale: ATLAS_TOKENS.radiusScale,
      frame: ATLAS_TOKENS.frame,
    };
  }

  if (overrides.primary && /^#[0-9a-f]{6}$/.test(overrides.primary)) {
    tokens.colors.primary = overrides.primary;
    tokens.colors.accent = overrides.primary;
    tokens.colors.onPrimary = tokens.radiusScale === 0 ? readableOnBrand(overrides.primary) : readableOn(overrides.primary);
  }
  return StyleTokensSchema.parse(tokens);
}

/** Resolve uma referência de cor (token ou hex) para um valor CSS. */
export function resolveColor(ref: ColorRef, tokens: StyleTokens): string {
  return ref.startsWith("#") ? ref : tokens.colors[ref as ColorToken];
}

/** Corpo efetivo: compensa famílias muito largas para caber na linha desenhada. */
export function fontSize(size: number, role: FontRole, tokens: StyleTokens): number {
  const family = FONT_FAMILIES[tokens.fonts[role]];
  return "widthFactor" in family ? Math.round((size / family.widthFactor) * 10) / 10 : size;
}

export function fontFamily(role: FontRole, tokens: StyleTokens): string {
  const family = FONT_FAMILIES[tokens.fonts[role]];
  const generic = family.kind === "serif" ? "Georgia, serif" : family.kind === "mono" ? "ui-monospace, monospace" : "system-ui, sans-serif";
  return `"${family.css}", ${generic}`;
}

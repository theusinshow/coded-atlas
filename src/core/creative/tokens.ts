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
});
export type StyleTokens = z.infer<typeof StyleTokensSchema>;

/** Linguagem visual da Coded by M/Atlas: neutros frios escuros + acento cobre (mesmo do globals.css). */
export const ATLAS_TOKENS: StyleTokens = {
  colors: {
    background: "#0f1014",
    surface: "#181a20",
    line: "#2a2d35",
    text: "#eef0f3",
    textMuted: "#9aa1ac",
    primary: "#c98a4b",
    onPrimary: "#111111",
    accent: "#c98a4b",
  },
  fonts: { display: "space-grotesk", body: "inter", mono: "jetbrains-mono" },
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
    const primary = brandColor(palette, background, 2) ?? mix(text, background, 0.2);
    const accent = brandColor(palette.filter((c) => c !== primary), background, 1.5) ?? primary;
    tokens = {
      colors: {
        background,
        surface: mix(background, text, 0.06),
        line: mix(background, text, 0.16),
        text,
        textMuted: mix(text, background, 0.38),
        primary,
        onPrimary: readableOn(primary),
        accent,
      },
      fonts: projectFonts(profile, ATLAS_TOKENS.fonts),
    };
  } else {
    const primary = brandColor(palette, ATLAS_TOKENS.colors.background, 3) ?? ATLAS_TOKENS.colors.primary;
    tokens = {
      colors: { ...ATLAS_TOKENS.colors, primary, accent: primary, onPrimary: readableOn(primary) },
      fonts: { ...projectFonts(profile, ATLAS_TOKENS.fonts), body: ATLAS_TOKENS.fonts.body },
    };
  }

  if (overrides.primary && /^#[0-9a-f]{6}$/.test(overrides.primary)) {
    tokens.colors.primary = overrides.primary;
    tokens.colors.accent = overrides.primary;
    tokens.colors.onPrimary = readableOn(overrides.primary);
  }
  return StyleTokensSchema.parse(tokens);
}

/** Resolve uma referência de cor (token ou hex) para um valor CSS. */
export function resolveColor(ref: ColorRef, tokens: StyleTokens): string {
  return ref.startsWith("#") ? ref : tokens.colors[ref as ColorToken];
}

export function fontFamily(role: FontRole, tokens: StyleTokens): string {
  const family = FONT_FAMILIES[tokens.fonts[role]];
  const generic = family.kind === "serif" ? "Georgia, serif" : family.kind === "mono" ? "ui-monospace, monospace" : "system-ui, sans-serif";
  return `"${family.css}", ${generic}`;
}

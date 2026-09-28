import { z } from "zod";
import { newId, AssetIdSchema, CaptureIdSchema, ProjectIdSchema, VisualProfileIdSchema } from "../../shared/id";
import { TimestampSchema, nowIso, parseOrThrow } from "../../shared/validation";

/**
 * VisualProfile: o entendimento consolidado da identidade de um projeto
 * (docs/DOMAIN-MODEL.md → Understand). Revisionado: cada nova leitura cria uma
 * revisão; decisões criativas guardam a revisão usada (snapshot rule).
 */
export const HexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/, "cor hex #rrggbb minúscula");

export const VisualProfileSourceSchema = z.enum(["inspection", "legacy", "manual", "brain"]);
export type VisualProfileSource = z.infer<typeof VisualProfileSourceSchema>;

export const VisualTraitSchema = z.enum(["dark", "light", "colorful", "monochrome", "high-contrast"]);
export type VisualTrait = z.infer<typeof VisualTraitSchema>;

export const VisualProfileSchema = z.strictObject({
  id: VisualProfileIdSchema,
  projectId: ProjectIdSchema,
  revision: z.number().int().positive(),
  palette: z.array(HexColorSchema).max(16),
  fonts: z.array(z.string().trim().min(1).max(80)).max(12),
  techStack: z.array(z.string().trim().min(1).max(60)).max(30),
  traits: z.array(VisualTraitSchema).max(5),
  ogImageUrl: z.string().max(2048).nullable(),
  logoAssetId: AssetIdSchema.nullable(),
  source: VisualProfileSourceSchema,
  captureId: CaptureIdSchema.nullable(),
  createdAt: TimestampSchema,
});
export type VisualProfile = z.infer<typeof VisualProfileSchema>;

function normalizeHex(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : null;
}

/** Luminância relativa WCAG (0 = preto, 1 = branco). */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Saturação HSL (0–1). */
export function saturation(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return 0;
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Traços determinísticos a partir da paleta (a primeira cor é o fundo dominante amostrado). */
export function deriveTraits(palette: readonly string[]): VisualTrait[] {
  if (palette.length === 0) return [];
  const traits: VisualTrait[] = [luminance(palette[0]) < 0.2 ? "dark" : "light"];
  const saturated = palette.filter((c) => saturation(c) > 0.45 && luminance(c) > 0.04 && luminance(c) < 0.9);
  traits.push(saturated.length === 0 ? "monochrome" : "colorful");
  if (palette.some((c) => contrastRatio(c, palette[0]) >= 10)) traits.push("high-contrast");
  return Array.from(new Set(traits));
}

export interface NewVisualProfileInput {
  projectId: z.infer<typeof ProjectIdSchema>;
  revision: number;
  palette: readonly string[];
  fonts: readonly string[];
  techStack: readonly string[];
  ogImageUrl?: string | null;
  source: VisualProfileSource;
  captureId?: z.infer<typeof CaptureIdSchema> | null;
  logoAssetId?: z.infer<typeof AssetIdSchema> | null;
}

/** Fontes de sistema, emoji e famílias genéricas: aparecem em qualquer site e não dizem nada da identidade. */
const GENERIC_FONT = /emoji|symbol|fallback$|^(system-ui|ui-(sans-serif|serif|monospace|rounded)|-apple-system|blinkmacsystemfont|segoe ui.*|sans-serif|serif|monospace|cursive|fantasy|helvetica( neue)?|arial|times( new roman)?|inherit|initial)$/i;

export function isBrandFont(name: string): boolean {
  return name.length > 0 && !GENERIC_FONT.test(name.trim());
}

/** Cria uma revisão limpando a entrada (hex normalizado, sem repetidos, fontes genéricas/fallback fora). */
export function createVisualProfile(input: NewVisualProfileInput): VisualProfile {
  const palette = Array.from(new Set(input.palette.map(normalizeHex).filter((c): c is string => c !== null))).slice(0, 16);
  const fonts = Array.from(
    new Set(input.fonts.map((f) => f.replace(/["']/g, "").trim()).filter(isBrandFont))
  ).slice(0, 12);
  return parseOrThrow(
    VisualProfileSchema,
    {
      id: newId(),
      projectId: input.projectId,
      revision: input.revision,
      palette,
      fonts,
      techStack: Array.from(new Set(input.techStack.map((t) => t.trim()).filter(Boolean))).slice(0, 30),
      traits: deriveTraits(palette),
      ogImageUrl: input.ogImageUrl ?? null,
      logoAssetId: input.logoAssetId ?? null,
      source: input.source,
      captureId: input.captureId ?? null,
      createdAt: nowIso(),
    },
    "VisualProfile"
  );
}

export interface VisualProfileRepository {
  /** Grava uma nova revisão (revisões nunca são editadas). */
  create(profile: VisualProfile): Promise<VisualProfile>;
  latest(projectId: z.infer<typeof ProjectIdSchema>): Promise<VisualProfile | null>;
  /** Uma revisão específica (snapshot usado por uma decisão criativa). */
  getRevision(projectId: z.infer<typeof ProjectIdSchema>, revision: number): Promise<VisualProfile | null>;
  listByProject(projectId: z.infer<typeof ProjectIdSchema>): Promise<VisualProfile[]>;
}

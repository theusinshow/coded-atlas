import type { Asset } from "../assets/asset";
import { autoBind, missingSlots } from "../creative/auto-bind";
import { getComposition } from "../creative/compositions";
import { formatSize, type FormatId } from "../creative/formats";
import { buildArtboard } from "../creative/instance-artboard";
import type { VisualProfile } from "../creative/visual-profile";
import type { Project } from "../projects/project";
import type { DocumentStyle } from "../documents/style";
import { autoAnimate, MotionContentSchema, websiteScrollScene, type MotionContent, type Scene } from "./motion";
import { newId } from "../../shared/id";

/**
 * VideoRecipe (docs/MOTION-ENGINE.md): estrutura de vídeo reutilizável — intro,
 * desktop, mobile, detalhe, scroll, fechamento — montada com composições curadas
 * e o material real. O Brain pode escolher a receita; nunca mexe em quadros.
 */
type Step =
  | { kind: "composition"; compositionId: string; variant?: string; durationMs: number; title: string }
  | { kind: "scroll"; device: "desktop" | "mobile" | "any"; durationMs?: number; title: string };

export interface VideoRecipe {
  id: string;
  name: string;
  description: string;
  /** Formatos em que a receita funciona bem. */
  formats: readonly FormatId[];
  /** Faixa de duração esperada (s) — informativa na UI. */
  durationRange: readonly [number, number];
  steps: readonly Step[];
}

export const VIDEO_RECIPES: readonly VideoRecipe[] = [
  {
    id: "website-reveal-reel",
    name: "Revelação do site",
    description: "Abertura com o nome, o site no navegador, desktop + mobile, a página rolando e a assinatura.",
    formats: ["story-9x16", "post-4x5", "post-1x1", "landscape-16x9"],
    durationRange: [14, 22],
    steps: [
      { kind: "composition", compositionId: "project-reveal", durationMs: 2500, title: "Abertura" },
      { kind: "composition", compositionId: "desktop-hero", durationMs: 3200, title: "Desktop" },
      { kind: "composition", compositionId: "desktop-mobile", durationMs: 3200, title: "Mobile" },
      { kind: "scroll", device: "desktop", title: "Scroll" },
      { kind: "composition", compositionId: "project-closing", durationMs: 2600, title: "Fechamento" },
    ],
  },
  {
    id: "quick-showcase",
    name: "Vitrine rápida",
    description: "Três tempos: o site no navegador, a página rolando e a assinatura. Bom para portfólio e LinkedIn.",
    formats: ["landscape-16x9", "post-1x1", "post-4x5", "story-9x16", "og-1.91x1"],
    durationRange: [10, 16],
    steps: [
      { kind: "composition", compositionId: "desktop-hero", durationMs: 3000, title: "Site" },
      { kind: "scroll", device: "any", title: "Scroll" },
      { kind: "composition", compositionId: "project-closing", durationMs: 2400, title: "Fechamento" },
    ],
  },
  {
    id: "mobile-first",
    name: "Celular primeiro",
    description: "Para sites em que o celular é a estrela: telas em escada, devices flutuando e o scroll no mobile.",
    formats: ["story-9x16", "post-4x5"],
    durationRange: [11, 18],
    steps: [
      { kind: "composition", compositionId: "mobile-stack", durationMs: 3200, title: "Telas" },
      { kind: "composition", compositionId: "floating-devices", durationMs: 3200, title: "Devices" },
      { kind: "scroll", device: "mobile", title: "Scroll mobile" },
      { kind: "composition", compositionId: "project-closing", durationMs: 2400, title: "Fechamento" },
    ],
  },
];

export function getRecipe(id: string): VideoRecipe | undefined {
  return VIDEO_RECIPES.find((r) => r.id === id);
}

/** A página inteira mais adequada para rolar (dispositivo pedido, mais recente). */
export function pickScrollPage(assets: readonly Asset[], device: "desktop" | "mobile" | "any"): Asset | null {
  const pages = assets
    .filter((a) => a.mimeType.startsWith("image/") && (a.metadata.role === "fullpage" || (!!a.width && !!a.height && a.height > a.width * 2)))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return pages.find((a) => device === "any" || a.metadata.device === device) ?? pages[0] ?? null;
}

export interface RecipeContext {
  project: Pick<Project, "name" | "category" | "client" | "description">;
  assets: readonly Asset[];
  url: string | null;
  profile: VisualProfile | null;
  formatId: FormatId;
  style: DocumentStyle;
}

/**
 * Monta o vídeo da receita: cada passo vira uma cena (composição ligada e animada
 * automaticamente, ou Website Scroll). Passos sem material suficiente são pulados
 * e informados em `skipped` — nada é inventado.
 */
export function buildRecipe(recipe: VideoRecipe, ctx: RecipeContext): { content: MotionContent; skipped: string[] } {
  const { width, height } = formatSize(ctx.formatId);
  const assetMap = new Map(ctx.assets.map((a) => [a.id as string, a]));
  const dims = new Map(ctx.assets.map((a) => [a.id as string, { width: a.width, height: a.height }]));
  const scenes: Scene[] = [];
  const skipped: string[] = [];
  let host: string | undefined;
  try {
    host = ctx.url ? new URL(ctx.url).host.replace(/^www\./, "") : undefined;
  } catch {
    host = undefined;
  }
  for (const step of recipe.steps) {
    if (step.kind === "scroll") {
      const page = pickScrollPage(ctx.assets, step.device);
      if (!page) {
        skipped.push(`${step.title}: nenhuma página inteira capturada`);
        continue;
      }
      scenes.push({ ...websiteScrollScene({ width, height, asset: page, url: host, title: step.title }), transition: scenes.length ? { type: "fade", durationMs: 450 } : { type: "none", durationMs: 0 } });
      continue;
    }
    const definition = getComposition(step.compositionId);
    if (!definition || !definition.formats.includes(ctx.formatId)) {
      skipped.push(`${step.title}: composição indisponível neste formato`);
      continue;
    }
    const bindings = autoBind(definition, { project: ctx.project, assets: ctx.assets, url: ctx.url });
    if (missingSlots(definition, bindings).length > 0) {
      skipped.push(`${step.title}: falta material (${missingSlots(definition, bindings).join(", ")})`);
      continue;
    }
    const artboard = buildArtboard(definition, { formatId: ctx.formatId, variant: step.variant ?? definition.variants[0].id, bindings }, assetMap, ctx.profile);
    scenes.push({
      id: newId(),
      title: step.title,
      durationMs: step.durationMs,
      artboard,
      animations: autoAnimate(artboard, step.durationMs, dims),
      transition: scenes.length ? { type: step.compositionId === "project-closing" ? "zoom" : "fade", durationMs: 450 } : { type: "none", durationMs: 0 },
    });
  }
  if (scenes.length === 0) throw new Error(`Sem material para a receita "${recipe.name}": ${skipped.join("; ")}`);
  return { content: MotionContentSchema.parse({ fps: 30, scenes, style: ctx.style, formatId: ctx.formatId }), skipped };
}

import { z } from "zod";
import { newId } from "../../shared/id";
import { FormatIdSchema, type FormatId } from "../creative/formats";
import { ArtboardSchema, type Artboard } from "../documents/artboard";
import { browserSize } from "../documents/devices";
import type { Layer } from "../documents/layer";
import { findLayer } from "../documents/layer-tree";
import { DocumentStyleSchema, type DocumentStyle } from "../documents/style";
import { EasingSchema, IDENTITY, MOTION_PRESETS, MotionPresetIdSchema, ease, evaluatePreset, type MotionDelta, type MotionPresetId } from "./presets";

/**
 * MotionDocument (docs/MOTION-ENGINE.md): cenas em sequência, cada uma com um
 * artboard (o MESMO modelo de camadas do estático), faixas de animação por preset
 * e uma transição de entrada. Tipos neutros de fornecedor — o render de vídeo
 * (Remotion/FFmpeg) é um adapter de infraestrutura (2.10).
 */
export const MOTION_FPS = [24, 30, 60] as const;
export const MAX_SCENES = 30;
export const MAX_DURATION_MS = 120_000;

export const AnimationTrackSchema = z.strictObject({
  id: z.string().min(1).max(64),
  /** Camada animada (de qualquer nível da árvore da cena). */
  layerId: z.string().min(1).max(64),
  preset: MotionPresetIdSchema,
  delayMs: z.number().int().min(0).max(60_000),
  durationMs: z.number().int().min(100).max(60_000),
  easing: EasingSchema,
  intensity: z.number().min(0).max(2),
});
export type AnimationTrack = z.infer<typeof AnimationTrackSchema>;

export const SceneTransitionSchema = z.strictObject({
  type: z.enum(["none", "fade", "slide", "zoom"]),
  durationMs: z.number().int().min(0).max(3000),
});
export type SceneTransition = z.infer<typeof SceneTransitionSchema>;

export const SceneSchema = z.strictObject({
  id: z.string().min(1).max(64),
  title: z.string().trim().max(80).optional(),
  durationMs: z.number().int().min(500).max(30_000),
  artboard: ArtboardSchema,
  animations: z.array(AnimationTrackSchema).max(120),
  transition: SceneTransitionSchema,
});
export type Scene = z.infer<typeof SceneSchema>;

export const MotionContentSchema = z
  .strictObject({
    fps: z.union([z.literal(24), z.literal(30), z.literal(60)]),
    scenes: z.array(SceneSchema).min(1).max(MAX_SCENES),
    style: DocumentStyleSchema,
    formatId: FormatIdSchema.nullable(),
  })
  .refine((c) => c.scenes.every((s) => s.artboard.width === c.scenes[0].artboard.width && s.artboard.height === c.scenes[0].artboard.height), {
    message: "Todas as cenas precisam ter o mesmo tamanho.",
  })
  .refine((c) => new Set(c.scenes.map((s) => s.id)).size === c.scenes.length, { message: "IDs de cena repetidos." })
  .refine((c) => c.scenes.every((s) => s.animations.every((a) => findLayer(s.artboard.layers, a.layerId) !== null)), { message: "Animação aponta para uma camada que não existe na cena." })
  .refine((c) => c.scenes.reduce((sum, s) => sum + s.durationMs, 0) <= MAX_DURATION_MS, { message: "Vídeo longo demais (máximo 2 minutos)." });
export type MotionContent = z.infer<typeof MotionContentSchema>;

// ── Linha do tempo ──────────────────────────────────────────────────────────

export function totalDurationMs(content: Pick<MotionContent, "scenes">): number {
  return content.scenes.reduce((sum, s) => sum + s.durationMs, 0);
}

/** Cena e tempo local em `t` (ms desde o início). Depois do fim: última cena, último instante. */
export function sceneAt(content: Pick<MotionContent, "scenes">, t: number): { index: number; localMs: number; startMs: number } {
  let start = 0;
  for (let index = 0; index < content.scenes.length; index++) {
    const d = content.scenes[index].durationMs;
    if (t < start + d || index === content.scenes.length - 1) return { index, localMs: Math.min(Math.max(t - start, 0), d), startMs: start };
    start += d;
  }
  return { index: 0, localMs: 0, startMs: 0 };
}

/** Delta de UMA faixa num instante local da cena. */
export function trackDelta(track: AnimationTrack, localMs: number, sceneDurationMs: number, unit: number): MotionDelta {
  const def = MOTION_PRESETS[track.preset];
  const elapsed = localMs - track.delayMs;
  if (def.kind === "loop") {
    // Loop cobre o resto da cena a partir do atraso (a duração é o período mínimo).
    const span = Math.max(track.durationMs, sceneDurationMs - track.delayMs);
    return evaluatePreset(track.preset, ease(track.easing, elapsed / span), track.intensity, unit);
  }
  return evaluatePreset(track.preset, ease(track.easing, elapsed / track.durationMs), track.intensity, unit);
}

function combine(a: MotionDelta, b: MotionDelta): MotionDelta {
  return {
    dx: a.dx + b.dx,
    dy: a.dy + b.dy,
    scale: a.scale * b.scale,
    rotation: a.rotation + b.rotation,
    opacity: a.opacity * b.opacity,
    blur: a.blur + b.blur,
    ...(b.focusY !== undefined ? { focusY: b.focusY } : a.focusY !== undefined ? { focusY: a.focusY } : {}),
  };
}

export interface SceneFrame {
  /** Artboard com posição/opacidade/rotação/desfoque/foco já aplicados. */
  artboard: Artboard;
  /** Escala por camada (aplicada como transform no render, sem mudar o layout). */
  scales: Record<string, number>;
  /** Transição de entrada da cena inteira. */
  enter: { opacity: number; dx: number; scale: number };
}

function applyDelta(layer: Layer, d: MotionDelta): Layer {
  const next = { ...layer, x: layer.x + d.dx, y: layer.y + d.dy, rotation: layer.rotation + d.rotation, opacity: Math.min(1, Math.max(0, layer.opacity * d.opacity)), blur: Math.min(100, layer.blur + d.blur) } as Layer;
  if (d.focusY !== undefined && (next.type === "asset" || next.type === "browser" || next.type === "device")) next.focusY = d.focusY;
  return next;
}

/** Quadro de uma cena em `localMs`: pura — o mesmo cálculo no preview e no render de vídeo. */
export function sceneFrame(scene: Scene, localMs: number): SceneFrame {
  const unit = Math.min(scene.artboard.width, scene.artboard.height);
  const deltas = new Map<string, MotionDelta>();
  for (const track of scene.animations) deltas.set(track.layerId, combine(deltas.get(track.layerId) ?? IDENTITY, trackDelta(track, localMs, scene.durationMs, unit)));
  const scales: Record<string, number> = {};
  const walk = (layers: readonly Layer[]): Layer[] =>
    layers.map((layer) => {
      const d = deltas.get(layer.id);
      let next = d ? applyDelta(layer, d) : layer;
      if (d && d.scale !== 1) scales[layer.id] = d.scale;
      if (next.type === "group") next = { ...next, children: walk(next.children) };
      return next;
    });
  const t = scene.transition;
  const p = t.type === "none" || t.durationMs === 0 ? 1 : ease("ease-out", localMs / t.durationMs);
  const enter =
    t.type === "fade" ? { opacity: p, dx: 0, scale: 1 } : t.type === "slide" ? { opacity: 1, dx: (1 - p) * scene.artboard.width, scale: 1 } : t.type === "zoom" ? { opacity: p, dx: 0, scale: 1.06 - 0.06 * p } : { opacity: 1, dx: 0, scale: 1 };
  return { artboard: { ...scene.artboard, layers: walk(scene.artboard.layers) }, scales, enter };
}

// ── Animação automática e construtores ──────────────────────────────────────

export interface AssetDims {
  width: number | null;
  height: number | null;
}

const isTall = (dims: AssetDims | undefined) => !!dims?.width && !!dims.height && dims.height / dims.width > 2;

function track(layerId: string, preset: MotionPresetId, delayMs: number, durationMs?: number, intensity = 1): AnimationTrack {
  const def = MOTION_PRESETS[preset];
  return { id: newId(), layerId, preset, delayMs, durationMs: durationMs ?? def.defaultDurationMs, easing: def.defaultEasing, intensity };
}

/**
 * Anima uma cena automaticamente (determinístico): cada camada de topo recebe o
 * preset do seu tipo, em cascata; página inteira dentro de moldura ganha scroll.
 * Fundos que cobrem a peça ficam parados (a cena já tem transição).
 */
export function autoAnimate(artboard: Artboard, sceneDurationMs: number, assets: ReadonlyMap<string, AssetDims> = new Map()): AnimationTrack[] {
  const tracks: AnimationTrack[] = [];
  const area = artboard.width * artboard.height;
  let order = 0;
  for (const layer of artboard.layers) {
    if (!layer.visible) continue;
    if (layer.width * layer.height > area * 0.6 && (layer.type === "shape" || layer.type === "asset")) continue;
    const delay = 150 + order * 140;
    order++;
    switch (layer.type) {
      case "browser":
      case "asset": {
        tracks.push(track(layer.id, layer.type === "browser" ? "browser-reveal" : "scale-in", delay));
        if (layer.assetId && isTall(assets.get(layer.assetId))) {
          const start = delay + 900;
          tracks.push(track(layer.id, "website-scroll", start, Math.max(1500, sceneDurationMs - start - 400)));
        } else if (layer.type === "browser") {
          tracks.push(track(layer.id, "smooth-zoom", delay, undefined, 0.6));
        }
        break;
      }
      case "device":
        tracks.push(track(layer.id, "device-float", delay));
        if (layer.assetId && isTall(assets.get(layer.assetId))) tracks.push(track(layer.id, "website-scroll", delay + 900, Math.max(1500, sceneDurationMs - delay - 1300)));
        break;
      case "group":
        tracks.push(track(layer.id, "stack-reveal", delay));
        break;
      case "text":
      case "shape":
        tracks.push(track(layer.id, "fade-up", delay));
        break;
    }
  }
  return tracks;
}

/** Cenas a partir de artboards (canvas, páginas de carrossel, composições). */
export function motionFromArtboards(input: {
  artboards: readonly { artboard: Artboard; title?: string }[];
  style: DocumentStyle;
  formatId: FormatId | null;
  sceneDurationMs?: number;
  assets?: ReadonlyMap<string, AssetDims>;
  fps?: 24 | 30 | 60;
}): MotionContent {
  const duration = input.sceneDurationMs ?? 3500;
  return MotionContentSchema.parse({
    fps: input.fps ?? 30,
    scenes: input.artboards.slice(0, MAX_SCENES).map((a, index) => ({
      id: newId(),
      ...(a.title ? { title: a.title.slice(0, 80) } : {}),
      durationMs: duration,
      artboard: a.artboard,
      animations: autoAnimate(a.artboard, duration, input.assets),
      transition: index === 0 ? { type: "none", durationMs: 0 } : { type: "fade", durationMs: 450 },
    })),
    style: input.style,
    formatId: input.formatId,
  });
}

/**
 * "Website Scroll": a página inteira capturada rolando dentro de uma janela de
 * navegador — o vídeo mais pedido para mostrar um site. Duração proporcional à altura.
 */
export function websiteScrollScene(input: { width: number; height: number; asset: { id: string; width: number | null; height: number | null }; url?: string; title?: string }): Scene {
  const aspect = input.asset.width && input.asset.height ? input.asset.height / input.asset.width : 4;
  const durationMs = Math.round(Math.min(15_000, Math.max(5000, 3000 + aspect * 900)));
  const width = Math.round(input.width * (input.width > input.height ? 0.72 : 0.86));
  const size = browserSize(width, 16 / 10);
  // Paisagem: janela de proporção de tela. Retrato: janela alta — mostra mais página rolando.
  const height = input.width > input.height ? Math.min(Math.round(input.height * 0.84), size.height) : Math.round(input.height * 0.78);
  const browser: Layer = {
    id: newId(),
    name: "Site",
    type: "browser",
    assetId: input.asset.id as Extract<Layer, { type: "browser" }>["assetId"],
    ...(input.url ? { url: input.url.slice(0, 200) } : {}),
    theme: "dark",
    focusY: 0,
    x: Math.round((input.width - width) / 2),
    y: Math.round((input.height - height) / 2),
    width,
    height,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    radius: Math.round(width * 0.012),
    shadow: "deep",
    blur: 0,
  };
  const artboard = ArtboardSchema.parse({ width: input.width, height: input.height, background: { fill: "background", pattern: "grid" }, layers: [browser] });
  return {
    id: newId(),
    title: input.title ?? "Website Scroll",
    durationMs,
    artboard,
    animations: [track(browser.id, "browser-reveal", 100, 900), track(browser.id, "website-scroll", 1000, durationMs - 1600)],
    transition: { type: "none", durationMs: 0 },
  };
}

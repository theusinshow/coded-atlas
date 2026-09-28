import { z } from "zod";
import { ColorRefSchema, LayerSchema, referencedAssetIds, type Layer, type LayerInput } from "./layer";

/**
 * Artboard: uma "folha" estática renderizável — dimensões, fundo e layers.
 * É o que uma CompositionInstance produz, o que um CanvasDocument guarda por
 * página e o que uma cena de Motion anima. O renderer só conhece isto.
 */
export const BackgroundSchema = z.strictObject({
  fill: ColorRefSchema.default("background"),
  /** Textura técnica discreta (Coded by M) — nunca gradientes arbitrários. */
  pattern: z.enum(["none", "grid", "dots"]).default("none"),
});

export const ArtboardSchema = z.strictObject({
  width: z.number().int().min(16).max(8000),
  height: z.number().int().min(16).max(8000),
  background: BackgroundSchema,
  layers: z.array(LayerSchema).max(300),
});

export type Artboard = z.infer<typeof ArtboardSchema>;
export type ArtboardInput = { width: number; height: number; background?: z.input<typeof BackgroundSchema>; layers: LayerInput[] };

export function artboardAssetIds(artboard: { layers: readonly Layer[] }): string[] {
  return referencedAssetIds(artboard.layers);
}

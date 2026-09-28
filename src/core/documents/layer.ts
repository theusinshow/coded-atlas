import { z } from "zod";
import { AssetIdSchema } from "../../shared/id";

/**
 * Layer: primitivo compartilhado por composições, Canvas e Motion
 * (docs/DOMAIN-MODEL.md → Layer). Geometria em pixels do espaço do artboard.
 *
 * Cores são REFERÊNCIAS — um token semântico ("primary", "text"…) ou um hex fixo.
 * Tokens são resolvidos só no render pelo Brand Adapter, então trocar o estilo
 * (projeto/atlas/híbrido) não exige reconstruir o documento.
 */
export const COLOR_TOKENS = ["background", "surface", "line", "text", "textMuted", "primary", "onPrimary", "accent"] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];

export const ColorRefSchema = z.union([z.enum(COLOR_TOKENS), z.string().regex(/^#[0-9a-f]{6}([0-9a-f]{2})?$/, "hex #rrggbb[aa]")]);
export type ColorRef = z.infer<typeof ColorRefSchema>;

export const FONT_ROLES = ["display", "body", "mono"] as const;
export const FontRoleSchema = z.enum(FONT_ROLES);
export type FontRole = z.infer<typeof FontRoleSchema>;

/** Sombras curadas (nada de glow arbitrário). */
export const ShadowSchema = z.enum(["none", "soft", "device", "deep"]);
export type Shadow = z.infer<typeof ShadowSchema>;

const Px = z.number().finite().min(-20_000).max(20_000);
const Size = z.number().finite().min(0).max(20_000);

const LayerBaseShape = {
  id: z.string().min(1).max(64),
  name: z.string().max(80).optional(),
  x: Px,
  y: Px,
  width: Size,
  height: Size,
  rotation: z.number().min(-360).max(360).default(0),
  opacity: z.number().min(0).max(1).default(1),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  radius: z.number().min(0).max(2000).default(0),
  shadow: ShadowSchema.default("none"),
  blur: z.number().min(0).max(100).default(0),
};

export const AssetFitSchema = z.enum(["cover", "contain"]);

const AssetLayerSchema = z.strictObject({
  ...LayerBaseShape,
  type: z.literal("asset"),
  /** null = slot sem material (placeholder no preview, omitido no render). */
  assetId: AssetIdSchema.nullable(),
  fit: AssetFitSchema.default("cover"),
  /** Ponto de foco vertical 0 (topo) … 1 (base) quando a imagem é cortada. */
  focusY: z.number().min(0).max(1).default(0),
});

const TextLayerSchema = z.strictObject({
  ...LayerBaseShape,
  type: z.literal("text"),
  text: z.string().max(2000),
  font: FontRoleSchema.default("body"),
  size: z.number().min(4).max(800),
  weight: z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700)]).default(400),
  color: ColorRefSchema.default("text"),
  align: z.enum(["left", "center", "right"]).default("left"),
  lineHeight: z.number().min(0.6).max(3).default(1.2),
  letterSpacing: z.number().min(-0.2).max(1).default(0),
  uppercase: z.boolean().default(false),
  maxLines: z.number().int().min(1).max(40).optional(),
});

const ShapeLayerSchema = z.strictObject({
  ...LayerBaseShape,
  type: z.literal("shape"),
  shape: z.enum(["rect", "ellipse", "line"]).default("rect"),
  fill: ColorRefSchema.nullable().default("surface"),
  stroke: ColorRefSchema.nullable().default(null),
  strokeWidth: z.number().min(0).max(100).default(0),
});

/** Moldura de celular com a tela preenchida por um asset. */
const DeviceLayerSchema = z.strictObject({
  ...LayerBaseShape,
  type: z.literal("device"),
  device: z.enum(["phone"]).default("phone"),
  assetId: AssetIdSchema.nullable(),
  frame: z.enum(["dark", "light"]).default("dark"),
  focusY: z.number().min(0).max(1).default(0),
});

/** Janela de navegador (barra + endereço) com a página preenchida por um asset. */
const BrowserLayerSchema = z.strictObject({
  ...LayerBaseShape,
  type: z.literal("browser"),
  assetId: AssetIdSchema.nullable(),
  url: z.string().max(200).optional(),
  theme: z.enum(["dark", "light"]).default("dark"),
  focusY: z.number().min(0).max(1).default(0),
});

/** Campos comuns a todo layer (geometria, visibilidade, acabamento). */
export const LayerBaseSchema = z.strictObject(LayerBaseShape);

export type AssetLayer = z.infer<typeof AssetLayerSchema>;
export type TextLayer = z.infer<typeof TextLayerSchema>;
export type ShapeLayer = z.infer<typeof ShapeLayerSchema>;
export type DeviceLayer = z.infer<typeof DeviceLayerSchema>;
export type BrowserLayer = z.infer<typeof BrowserLayerSchema>;
export type GroupLayer = z.infer<typeof LayerBaseSchema> & { type: "group"; children: Layer[] };
export type Layer = AssetLayer | TextLayer | ShapeLayer | DeviceLayer | BrowserLayer | GroupLayer;

export type AssetLayerInput = z.input<typeof AssetLayerSchema>;
export type TextLayerInput = z.input<typeof TextLayerSchema>;
export type ShapeLayerInput = z.input<typeof ShapeLayerSchema>;
export type DeviceLayerInput = z.input<typeof DeviceLayerSchema>;
export type BrowserLayerInput = z.input<typeof BrowserLayerSchema>;
export type GroupLayerInput = z.input<typeof LayerBaseSchema> & { type: "group"; children: LayerInput[] };
/** Entrada aceita (campos com default podem ser omitidos) — o que as composições constroem. */
export type LayerInput = AssetLayerInput | TextLayerInput | ShapeLayerInput | DeviceLayerInput | BrowserLayerInput | GroupLayerInput;

// Recursão (grupo contém layers): tipos declarados acima, schema anotado contra eles.
const GroupLayerSchema: z.ZodType<GroupLayer, GroupLayerInput> = z.strictObject({
  ...LayerBaseShape,
  type: z.literal("group"),
  get children(): z.ZodArray<z.ZodType<Layer, LayerInput>> {
    return z.array(LayerSchema).max(200);
  },
});

export const LayerSchema: z.ZodType<Layer, LayerInput> = z.union([
  AssetLayerSchema,
  TextLayerSchema,
  ShapeLayerSchema,
  DeviceLayerSchema,
  BrowserLayerSchema,
  GroupLayerSchema,
]);

/** Assets referenciados por uma árvore de layers (para dependências, cópia e render). */
export function referencedAssetIds(layers: readonly Layer[]): string[] {
  const ids = new Set<string>();
  const walk = (list: readonly Layer[]) => {
    for (const layer of list) {
      if ((layer.type === "asset" || layer.type === "device" || layer.type === "browser") && layer.assetId) ids.add(layer.assetId);
      if (layer.type === "group") walk(layer.children);
    }
  };
  walk(layers);
  return [...ids];
}

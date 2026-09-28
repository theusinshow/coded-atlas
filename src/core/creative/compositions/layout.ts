import type {
  AssetLayerInput,
  BrowserLayerInput,
  DeviceLayerInput,
  LayerInput,
  ShapeLayerInput,
  TextLayerInput,
} from "../../documents/layer";
import { browserSize, phoneSize } from "../../documents/devices";
import type { BuildContext, ResolvedAsset } from "../composition";

/** Utilidades de layout das composições curadas: medidas proporcionais ao formato. */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Geometry = "type" | "x" | "y" | "width" | "height";

/** Unidade de medida: 1 = 1px num post de 1080px. */
export function unit(ctx: Pick<BuildContext, "width" | "height">): number {
  return Math.min(ctx.width, ctx.height) / 1080;
}

export function margin(ctx: Pick<BuildContext, "width" | "height">): number {
  return Math.round(84 * unit(ctx));
}

export const isPortrait = (ctx: Pick<BuildContext, "width" | "height">) => ctx.height / ctx.width > 1.12;
export const isLandscape = (ctx: Pick<BuildContext, "width" | "height">) => ctx.width / ctx.height > 1.12;

export function aspectOf(asset: ResolvedAsset | null, fallback: number): number {
  return asset && asset.width > 0 && asset.height > 0 ? asset.width / asset.height : fallback;
}

/** Maior janela de navegador que cabe na caixa, centralizada. */
export function browserIn(box: Box, pageAspect: number, props: Omit<BrowserLayerInput, Geometry>): BrowserLayerInput {
  let width = Math.floor(box.width);
  let size = browserSize(width, pageAspect);
  if (size.height > box.height) {
    // h = w/aspect + chrome(w) ≈ w * (1/aspect + 0.034)
    width = Math.floor(box.height / (1 / pageAspect + 0.034));
    size = browserSize(width, pageAspect);
    while (size.height > box.height && width > 10) size = browserSize(--width, pageAspect);
  }
  return {
    radius: Math.round(size.width * 0.012),
    shadow: "device",
    ...props,
    type: "browser",
    x: Math.round(box.x + (box.width - size.width) / 2),
    y: Math.round(box.y + (box.height - size.height) / 2),
    width: size.width,
    height: size.height,
  };
}

/** Maior celular que cabe na caixa, centralizado. */
export function phoneIn(box: Box, screenAspect: number, props: Omit<DeviceLayerInput, Geometry>): DeviceLayerInput {
  let width = Math.floor(box.width);
  let size = phoneSize(width, screenAspect);
  if (size.height > box.height) {
    const b = 0.035;
    width = Math.floor((box.height * screenAspect) / (1 + 2 * b * screenAspect - 2 * b));
    size = phoneSize(width, screenAspect);
    while (size.height > box.height && width > 10) size = phoneSize(--width, screenAspect);
  }
  return {
    shadow: "device",
    ...props,
    type: "device",
    x: Math.round(box.x + (box.width - size.width) / 2),
    y: Math.round(box.y + (box.height - size.height) / 2),
    width: size.width,
    height: size.height,
  };
}

/** Recorte de imagem (seção, detalhe) — ocupa a caixa inteira. */
export function imageIn(box: Box, props: Omit<AssetLayerInput, Geometry>): AssetLayerInput {
  return { fit: "cover", focusY: 0, ...props, type: "asset", ...round(box) };
}

export function text(value: string, box: Box, props: Omit<TextLayerInput, Geometry | "text" | "size"> & { size: number }): TextLayerInput | null {
  if (!value.trim()) return null;
  return { ...props, type: "text", text: value, ...round(box) };
}

export function shape(box: Box, props: Omit<ShapeLayerInput, Geometry>): ShapeLayerInput {
  return { ...props, type: "shape", ...round(box) };
}

/**
 * Caixa com a proporção da imagem dentro da área disponível (sem zoom que corte
 * o conteúdo). `anchor` decide onde a caixa fica quando sobra altura.
 */
export function fitAspect(area: Box, aspect: number, anchor: "top" | "center" | "bottom" = "center"): Box {
  let width = area.width;
  let height = width / aspect;
  if (height > area.height) {
    height = area.height;
    width = height * aspect;
  }
  const x = area.x + (area.width - width) / 2;
  const free = area.height - height;
  const y = area.y + (anchor === "top" ? 0 : anchor === "bottom" ? free : free / 2);
  return { x, y, width, height };
}

/** Desloca verticalmente layers já posicionados (para centralizar um bloco). */
export function shiftY<T extends { y: number }>(layers: T[], dy: number): T[] {
  return layers.map((l) => ({ ...l, y: Math.round(l.y + dy) }));
}

function round(box: Box): Box {
  return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
}

/** Remove layers nulos (texto vazio, slot opcional sem material). */
export function compact(layers: (LayerInput | null | false | undefined)[]): LayerInput[] {
  return layers.filter((l): l is LayerInput => Boolean(l));
}

/** Rótulo técnico (mono, maiúsculas, espaçado) — assinatura visual da Coded by M. */
export function eyebrow(value: string, box: Box, u: number, color: TextLayerInput["color"] = "primary"): TextLayerInput | null {
  return text(value, box, { id: "eyebrow", font: "mono", size: Math.round(22 * u), weight: 500, color, uppercase: true, letterSpacing: 0.14, maxLines: 1 });
}

import { browserSize } from "../../documents/devices";
import type { BuildContext, CompositionDefinition } from "../composition";
import { FORMAT_IDS } from "../formats";
import { aspectOf, browserIn, compact, eyebrow, isLandscape, isPortrait, margin, phoneIn, imageIn, shiftY, text, unit, type Box } from "./layout";
import { desktopSlot, labelSlot, mobileSlot, sectionSlot, titleSlot, urlSlot } from "./slots";

const DESKTOP_ASPECT = 1.6; // 1440×900
const MOBILE_ASPECT = 390 / 844;

/** Estima quantas linhas um título ocupa (largura média de caractere ~0.55em). */
export function estimateLines(value: string, size: number, width: number, maxLines: number): number {
  if (!value.trim()) return 0;
  return Math.min(maxLines, Math.max(1, Math.ceil((value.length * size * 0.55) / width)));
}

/** Cabeçalho opcional (rótulo técnico + título). Devolve os layers e onde o conteúdo começa. */
export function header(ctx: BuildContext, opts: { titleSize: number; maxLines?: number } = { titleSize: 60 }) {
  const u = unit(ctx);
  const m = margin(ctx);
  const width = ctx.width - 2 * m;
  const label = ctx.texts.label ?? "";
  const title = ctx.texts.title ?? "";
  const size = Math.round(opts.titleSize * u);
  const lines = estimateLines(title, size, width, opts.maxLines ?? 2);
  const labelH = label.trim() ? Math.round(44 * u) : 0;
  const layers = compact([
    eyebrow(label, { x: m, y: m, width, height: Math.round(30 * u) }, u),
    text(title, { x: m, y: m + labelH, width, height: Math.ceil(lines * size * 1.12) }, {
      id: "title",
      font: "display",
      size,
      weight: 600,
      lineHeight: 1.08,
      letterSpacing: -0.01,
      maxLines: opts.maxLines ?? 2,
    }),
  ]);
  const used = labelH + Math.ceil(lines * size * 1.12);
  return { layers, contentTop: used > 0 ? m + used + Math.round(44 * u) : m };
}

export const desktopHero: CompositionDefinition = {
  id: "desktop-hero",
  version: 1,
  name: "Desktop Hero",
  family: "showcase",
  description: "O site em uma janela de navegador, com título opcional. O cartão de visita do projeto.",
  formats: FORMAT_IDS,
  slots: [desktopSlot(), titleSlot(), labelSlot(), urlSlot()],
  variants: [
    { id: "centered", label: "Centralizado" },
    { id: "bleed", label: "Sangrando" },
  ],
  capabilities: { motion: true, text: true, brandAdaptation: true, minAssets: 1, maxAssets: 1 },
  build(ctx) {
    const m = margin(ctx);
    const { layers, contentTop } = header(ctx, { titleSize: isLandscape(ctx) ? 56 : 64 });
    const aspect = aspectOf(ctx.assets.desktop, DESKTOP_ASPECT);
    const props = { id: "desktop", assetId: ctx.assets.desktop?.id ?? null, url: ctx.texts.url };
    let browser;
    if (ctx.variant === "bleed") {
      const width = ctx.width - Math.round(m * 0.9);
      const size = browserSize(width, aspect);
      browser = { ...browserIn({ x: 0, y: 0, width, height: size.height }, aspect, props), x: Math.round((ctx.width - width) / 2), y: contentTop };
    } else {
      // Navegador colado ao cabeçalho; depois o bloco todo é centralizado.
      browser = { ...browserIn({ x: m, y: contentTop, width: ctx.width - 2 * m, height: ctx.height - contentTop - m }, aspect, props), y: contentTop };
      // Centraliza o bloco (cabeçalho + navegador) na altura: sem vazio concentrado embaixo/em cima.
      const blockTop = layers.length ? m : browser.y;
      const blockBottom = browser.y + browser.height;
      const dy = (ctx.height - (blockBottom - blockTop)) / 2 - blockTop;
      return {
        width: ctx.width,
        height: ctx.height,
        background: { fill: "background", pattern: "grid" },
        layers: [...shiftY(layers, dy), { ...browser, y: Math.round(browser.y + dy) }],
      };
    }
    return { width: ctx.width, height: ctx.height, background: { fill: "background", pattern: "grid" }, layers: [...layers, browser] };
  },
};

export const desktopMobile: CompositionDefinition = {
  id: "desktop-mobile",
  version: 1,
  name: "Desktop + Mobile",
  family: "showcase",
  description: "Navegador e celular juntos: mostra que o projeto funciona nos dois.",
  formats: FORMAT_IDS,
  slots: [desktopSlot(), mobileSlot(), titleSlot(), labelSlot(), urlSlot()],
  variants: [
    { id: "right", label: "Celular à direita" },
    { id: "left", label: "Celular à esquerda" },
  ],
  capabilities: { motion: true, text: true, brandAdaptation: true, minAssets: 2, maxAssets: 2 },
  build(ctx) {
    const m = margin(ctx);
    const { layers, contentTop } = header(ctx, { titleSize: 56 });
    const area: Box = { x: m, y: contentTop, width: ctx.width - 2 * m, height: ctx.height - contentTop - m };
    const right = ctx.variant !== "left";
    const desktop = { id: "desktop", assetId: ctx.assets.desktop?.id ?? null, url: ctx.texts.url };
    const mobile = { id: "mobile", assetId: ctx.assets.mobile?.id ?? null };
    let browserBox: Box;
    let phoneBox: Box;
    if (isPortrait(ctx)) {
      browserBox = { x: area.x, y: area.y, width: area.width, height: area.height * 0.62 };
      phoneBox = { x: right ? area.x + area.width * 0.6 : area.x, y: area.y + area.height * 0.34, width: area.width * 0.4, height: area.height * 0.66 };
    } else {
      browserBox = { x: right ? area.x : area.x + area.width * 0.12, y: area.y + area.height * 0.02, width: area.width * 0.88, height: area.height * 0.88 };
      phoneBox = { x: right ? area.x + area.width * 0.74 : area.x, y: area.y + area.height * 0.24, width: area.width * 0.26, height: area.height * 0.76 };
    }
    return {
      width: ctx.width,
      height: ctx.height,
      background: { fill: "background", pattern: "grid" },
      layers: [
        ...layers,
        browserIn(browserBox, aspectOf(ctx.assets.desktop, DESKTOP_ASPECT), desktop),
        phoneIn(phoneBox, aspectOf(ctx.assets.mobile, MOBILE_ASPECT), mobile),
      ],
    };
  },
};

export const floatingDevices: CompositionDefinition = {
  id: "floating-devices",
  version: 1,
  name: "Floating Devices",
  family: "showcase",
  description: "Devices levemente inclinados com sombra profunda — dinâmico, sem perder a leitura.",
  formats: FORMAT_IDS,
  slots: [desktopSlot(), mobileSlot(), sectionSlot("detail", "Detalhe (trio)")],
  variants: [
    { id: "duo", label: "Dupla" },
    { id: "trio", label: "Trio" },
  ],
  capabilities: { motion: true, text: false, brandAdaptation: true, minAssets: 2, maxAssets: 3 },
  build(ctx) {
    const m = margin(ctx);
    const W = ctx.width;
    const H = ctx.height;
    const u = unit(ctx);
    const trio = ctx.variant === "trio" && ctx.assets.detail;
    const browser = {
      ...browserIn(
        { x: m, y: m + H * 0.02, width: (W - 2 * m) * (isPortrait(ctx) ? 1 : 0.84), height: (H - 2 * m) * (isPortrait(ctx) ? 0.56 : 0.78) },
        aspectOf(ctx.assets.desktop, DESKTOP_ASPECT),
        { id: "desktop", assetId: ctx.assets.desktop?.id ?? null }
      ),
      rotation: -3,
      shadow: "deep" as const,
    };
    const phone = {
      ...phoneIn(
        isPortrait(ctx)
          ? { x: W * 0.46, y: H * 0.42, width: W * 0.42, height: H * 0.5 }
          : { x: W * 0.64, y: H * 0.26, width: W * 0.24, height: H * 0.66 },
        aspectOf(ctx.assets.mobile, MOBILE_ASPECT),
        { id: "mobile", assetId: ctx.assets.mobile?.id ?? null }
      ),
      rotation: 5,
      shadow: "deep" as const,
    };
    const detail = trio
      ? {
          ...imageIn(
            isPortrait(ctx)
              ? { x: m, y: H * 0.6, width: W * 0.42, height: W * 0.42 * 0.62 }
              : { x: m * 0.8, y: H * 0.62, width: W * 0.3, height: W * 0.3 * 0.56 },
            { id: "detail", assetId: ctx.assets.detail?.id ?? null, radius: Math.round(18 * u) }
          ),
          rotation: -6,
          shadow: "deep" as const,
        }
      : null;
    return { width: W, height: H, background: { fill: "background", pattern: "dots" }, layers: compact([browser, detail, phone]) };
  },
};

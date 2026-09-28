import type { ColorRef, LayerInput } from "../../documents/layer";
import type { CompositionDefinition } from "../composition";
import { FORMAT_IDS } from "../formats";
import { aspectOf, browserIn, compact, eyebrow, imageIn, isLandscape, isPortrait, margin, shape, text, unit, type Box } from "./layout";
import { estimateLines } from "./showcase";
import { creditSlot, heroImageSlot, labelSlot, subtitleSlot, titleSlot, urlSlot } from "./slots";

export const typographyColors: CompositionDefinition = {
  id: "typography-colors",
  version: 1,
  name: "Typography + Colors",
  family: "typography",
  description: "Ficha de identidade: paleta e tipografia do projeto, lidas da captura.",
  formats: FORMAT_IDS,
  slots: [titleSlot(false, 60), labelSlot("none")],
  variants: [
    { id: "palette-first", label: "Paleta em destaque" },
    { id: "type-first", label: "Tipografia em destaque" },
  ],
  capabilities: { motion: true, text: true, brandAdaptation: true, minAssets: 0, maxAssets: 0 },
  build(ctx) {
    const u = unit(ctx);
    const m = margin(ctx);
    const W = ctx.width;
    const H = ctx.height;
    const colors: ColorRef[] = ctx.palette.length ? ctx.palette.slice(0, 6).map((c) => c as ColorRef) : ["background", "surface", "primary", "text"];
    const fontsCaption = ctx.fonts.slice(0, 3).join(" · ");
    const label = ctx.texts.label?.trim() || "Identidade visual";
    const title = ctx.texts.title ?? "";

    const landscape = isLandscape(ctx);
    const typeBox: Box = landscape
      ? { x: m, y: m, width: (W - 2 * m) * 0.46, height: H - 2 * m }
      : { x: m, y: m, width: W - 2 * m, height: (H - 2 * m) * 0.5 };
    const paletteBox: Box = landscape
      ? { x: m + (W - 2 * m) * 0.52, y: m, width: (W - 2 * m) * 0.48, height: H - 2 * m }
      : { x: m, y: m + (H - 2 * m) * 0.56, width: W - 2 * m, height: (H - 2 * m) * 0.44 };
    // "Paleta em destaque" leva a paleta para o primeiro plano (esquerda/topo).
    const [first, second] = ctx.variant === "palette-first" ? [paletteBox, typeBox] : [typeBox, paletteBox];

    const specimen = Math.round(Math.min(first.height * 0.5, first.width * 0.5));
    const typeLayers = compact([
      eyebrow(label, { x: first.x, y: first.y, width: first.width, height: 30 * u }, u),
      text(title, { x: first.x, y: first.y + 44 * u, width: first.width, height: 64 * u * 2.2 }, { id: "title", font: "display", size: Math.round(60 * u), weight: 600, maxLines: 2, lineHeight: 1.08 }),
      text("Aa", { x: first.x, y: first.y + first.height - specimen * 1.25 - 40 * u, width: first.width, height: specimen * 1.2 }, { id: "specimen", font: "display", size: specimen, weight: 700, color: "primary", lineHeight: 1 }),
      text(fontsCaption || "Tipografia", { x: first.x, y: first.y + first.height - 34 * u, width: first.width, height: 34 * u }, { id: "fonts", font: "mono", size: Math.round(20 * u), color: "textMuted", maxLines: 1 }),
    ]);

    const cols = colors.length > 4 ? 3 : 2;
    const rows = Math.ceil(colors.length / cols);
    const gap = Math.round(16 * u);
    const sw = (second.width - gap * (cols - 1)) / cols;
    const sh = (second.height - gap * (rows - 1)) / rows;
    const swatches: LayerInput[] = colors.flatMap((c, i) => {
      const x = second.x + (i % cols) * (sw + gap);
      const y = second.y + Math.floor(i / cols) * (sh + gap);
      return compact([
        shape({ x, y, width: sw, height: sh - 40 * u }, { id: `swatch-${i}`, fill: c, stroke: "line", strokeWidth: 1, radius: Math.round(14 * u) }),
        text(c, { x, y: y + sh - 32 * u, width: sw, height: 28 * u }, { id: `hex-${i}`, font: "mono", size: Math.round(19 * u), color: "textMuted", uppercase: true, maxLines: 1 }),
      ]);
    });
    return { width: W, height: H, background: { fill: "background" }, layers: [...typeLayers, ...swatches] };
  },
};

export const projectReveal: CompositionDefinition = {
  id: "project-reveal",
  version: 1,
  name: "Project Reveal",
  family: "intro",
  description: "Abertura: o nome do projeto em grande, com contexto. Primeira peça de um carrossel ou vídeo.",
  formats: FORMAT_IDS,
  slots: [titleSlot(true, 60), subtitleSlot(), labelSlot("project.client"), heroImageSlot()],
  variants: [
    { id: "image", label: "Com imagem" },
    { id: "type", label: "Só tipografia" },
  ],
  capabilities: { motion: true, text: true, brandAdaptation: true, minAssets: 0, maxAssets: 1 },
  build(ctx) {
    const u = unit(ctx);
    const m = margin(ctx);
    const W = ctx.width;
    const H = ctx.height;
    const withImage = ctx.variant !== "type" && ctx.assets.image;
    const title = ctx.texts.title ?? "";
    const subtitle = ctx.texts.subtitle ?? "";
    const size = Math.round((isLandscape(ctx) ? 112 : 124) * u);
    const tLines = estimateLines(title, size, W - 2 * m, 3);
    const sSize = Math.round(30 * u);
    const sLines = estimateLines(subtitle, sSize, (W - 2 * m) * 0.8, 3);
    const blockH = 44 * u + tLines * size * 1.02 + (sLines ? 32 * u + sLines * sSize * 1.45 : 0);
    const w = W - 2 * m;
    // Imagem na proporção natural; o grupo (texto + parte visível da imagem) fica centralizado
    // e a imagem sangra pela base quando é mais alta que o espaço.
    const imgH = w / aspectOf(ctx.assets.image ?? null, 1.6);
    const visible = Math.min(imgH, H * (isPortrait(ctx) ? 0.42 : 0.44));
    const groupH = blockH + 56 * u + visible;
    const top = withImage ? Math.max(m, (H - groupH) / 2 + (visible < imgH ? (H - groupH) / 2 : 0)) : (H - blockH) / 2;
    const imageTop = top + blockH + 56 * u;
    return {
      width: W,
      height: H,
      background: { fill: "background", pattern: withImage ? "none" : "grid" },
      layers: compact([
        eyebrow(ctx.texts.label ?? "", { x: m, y: top, width: w, height: 30 * u }, u),
        text(title, { x: m, y: top + 44 * u, width: w, height: tLines * size * 1.05 }, { id: "title", font: "display", size, weight: 700, lineHeight: 1, letterSpacing: -0.03, maxLines: 3 }),
        text(subtitle, { x: m, y: top + 44 * u + tLines * size * 1.02 + 32 * u, width: w * 0.8, height: sLines * sSize * 1.5 }, { id: "subtitle", font: "body", size: sSize, color: "textMuted", lineHeight: 1.45, maxLines: 3 }),
        withImage && imageIn({ x: m, y: imageTop, width: w, height: imgH }, { id: "image", assetId: ctx.assets.image?.id ?? null, radius: Math.round(24 * u), shadow: "soft" }),
        !withImage && shape({ x: m, y: top + blockH + 48 * u, width: 96 * u, height: 6 * u }, { id: "rule", fill: "primary" }),
      ]),
    };
  },
};

export const projectClosing: CompositionDefinition = {
  id: "project-closing",
  version: 1,
  name: "Project Closing",
  family: "outro",
  description: "Fechamento: nome, endereço e assinatura. Última peça de um carrossel ou vídeo.",
  formats: FORMAT_IDS,
  slots: [titleSlot(true, 60), urlSlot(), creditSlot(), heroImageSlot("image", "Miniatura", false)],
  variants: [
    { id: "centered", label: "Centralizado" },
    { id: "with-image", label: "Com miniatura" },
  ],
  capabilities: { motion: true, text: true, brandAdaptation: true, minAssets: 0, maxAssets: 1 },
  build(ctx) {
    const u = unit(ctx);
    const m = margin(ctx);
    const W = ctx.width;
    const H = ctx.height;
    const withImage = ctx.variant === "with-image" && ctx.assets.image;
    const title = ctx.texts.title ?? "";
    const size = Math.round(76 * u);
    const tLines = estimateLines(title, size, W - 2 * m, 2);
    const thumbW = Math.min(W * 0.46, 620 * u);
    const thumb = withImage ? browserIn({ x: (W - thumbW) / 2, y: 0, width: thumbW, height: H }, aspectOf(ctx.assets.image ?? null, 1.6), { id: "image", assetId: ctx.assets.image?.id ?? null }) : null;
    const thumbH = thumb ? thumb.height + 64 * u : 0;
    const blockH = thumbH + 36 * u + tLines * size * 1.08 + 28 * u + 36 * u;
    const top = (H - blockH) / 2;
    const w = W - 2 * m;
    return {
      width: W,
      height: H,
      background: { fill: "background", pattern: "grid" },
      layers: compact([
        thumb && { ...thumb, y: Math.round(top) },
        shape({ x: (W - 72 * u) / 2, y: top + thumbH, width: 72 * u, height: 5 * u }, { id: "rule", fill: "primary" }),
        text(title, { x: m, y: top + thumbH + 36 * u, width: w, height: tLines * size * 1.1 }, { id: "title", font: "display", size, weight: 600, align: "center", lineHeight: 1.06, maxLines: 2 }),
        text(ctx.texts.url ?? "", { x: m, y: top + thumbH + 36 * u + tLines * size * 1.08 + 28 * u, width: w, height: 36 * u }, { id: "url", font: "mono", size: Math.round(26 * u), color: "primary", align: "center", maxLines: 1 }),
        text(ctx.texts.credit ?? "", { x: m, y: H - m - 30 * u, width: w, height: 30 * u }, { id: "credit", font: "body", size: Math.round(22 * u), color: "textMuted", align: "center", maxLines: 1 }),
      ]),
    };
  },
};

/** Tamanho de título que cabe em até `maxLines` linhas (desce em passos até o mínimo). */
function fitTitle(value: string, width: number, start: number, min: number, maxLines: number): { size: number; lines: number } {
  let size = start;
  while (size > min && estimateLines(value, size, width, 99) > maxLines) size = Math.round(size * 0.9);
  return { size, lines: Math.max(1, estimateLines(value, size, width, maxLines)) };
}

export const statement: CompositionDefinition = {
  id: "statement",
  version: 1,
  name: "Statement",
  family: "editorial",
  description: "Slide de texto: título forte e um parágrafo. Contexto, desafio, solução — sem imagem.",
  formats: FORMAT_IDS,
  slots: [labelSlot(), titleSlot(true, 90), { id: "body", label: "Texto", type: "text", required: false, maxLength: 400, source: "project.description" }],
  variants: [
    { id: "split", label: "Título ao lado" },
    { id: "stacked", label: "Empilhado" },
  ],
  capabilities: { motion: true, text: true, brandAdaptation: true, minAssets: 0, maxAssets: 0 },
  build(ctx) {
    const u = unit(ctx);
    const m = margin(ctx);
    const W = ctx.width;
    const H = ctx.height;
    const title = ctx.texts.title ?? "";
    const body = ctx.texts.body ?? "";
    const split = ctx.variant === "split" && isLandscape(ctx);
    const titleW = split ? (W - 2 * m) * 0.46 : (W - 2 * m) * 0.9;
    const bodyW = split ? (W - 2 * m) * 0.44 : (W - 2 * m) * 0.78;
    const t = fitTitle(title, titleW, Math.round((isPortrait(ctx) ? 96 : 84) * u), Math.round(44 * u), 4);
    const bodySize = Math.round(30 * u);
    const bodyLines = estimateLines(body, bodySize, bodyW, 12);
    const titleH = t.lines * t.size * 1.08;
    const bodyH = bodyLines * bodySize * 1.5;
    const eyebrowH = 44 * u;

    if (split) {
      const top = (H - Math.max(eyebrowH + titleH, bodyH)) / 2;
      const bodyX = W - m - bodyW;
      return {
        width: W,
        height: H,
        background: { fill: "background", pattern: "grid" },
        layers: compact([
          eyebrow(ctx.texts.label ?? "", { x: m, y: top, width: titleW, height: 30 * u }, u),
          text(title, { x: m, y: top + eyebrowH, width: titleW, height: titleH }, { id: "title", font: "display", size: t.size, weight: 700, lineHeight: 1.04, letterSpacing: -0.02, maxLines: 4 }),
          shape({ x: bodyX - 40 * u, y: top + eyebrowH, width: 4 * u, height: Math.max(bodyH, titleH) }, { id: "rule", fill: "primary" }),
          text(body, { x: bodyX, y: top + eyebrowH, width: bodyW, height: bodyH }, { id: "body", font: "body", size: bodySize, color: "textMuted", lineHeight: 1.5, maxLines: 12 }),
        ]),
      };
    }
    const blockH = eyebrowH + titleH + (body ? 48 * u + bodyH : 0);
    const top = (H - blockH) / 2;
    return {
      width: W,
      height: H,
      background: { fill: "background", pattern: "grid" },
      layers: compact([
        eyebrow(ctx.texts.label ?? "", { x: m, y: top, width: titleW, height: 30 * u }, u),
        text(title, { x: m, y: top + eyebrowH, width: titleW, height: titleH }, { id: "title", font: "display", size: t.size, weight: 700, lineHeight: 1.04, letterSpacing: -0.02, maxLines: 4 }),
        !!body && shape({ x: m, y: top + eyebrowH + titleH + 20 * u, width: 96 * u, height: 6 * u }, { id: "rule", fill: "primary" }),
        text(body, { x: m, y: top + eyebrowH + titleH + 48 * u, width: bodyW, height: bodyH }, { id: "body", font: "body", size: bodySize, color: "textMuted", lineHeight: 1.5, maxLines: 12 }),
      ]),
    };
  },
};

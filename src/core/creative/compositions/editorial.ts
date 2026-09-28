import type { CompositionDefinition } from "../composition";
import { FORMAT_IDS } from "../formats";
import { aspectOf, compact, eyebrow, fitAspect, imageIn, isLandscape, isPortrait, margin, phoneIn, shiftY, text, unit, type Box } from "./layout";
import { header, estimateLines } from "./showcase";
import { heroImageSlot, labelSlot, mobileSectionSlot, mobileSlot, sectionSlot, subtitleSlot, titleSlot } from "./slots";

const MOBILE_ASPECT = 390 / 844;

export const editorialSplit: CompositionDefinition = {
  id: "editorial-split",
  version: 1,
  name: "Editorial Split",
  family: "editorial",
  description: "Texto e imagem lado a lado, como uma página de revista. Bom para apresentar o projeto.",
  formats: FORMAT_IDS,
  slots: [heroImageSlot("image", "Imagem", true), titleSlot(true), subtitleSlot(), labelSlot()],
  variants: [
    { id: "text-left", label: "Texto à esquerda" },
    { id: "text-right", label: "Texto à direita" },
  ],
  capabilities: { motion: true, text: true, brandAdaptation: true, minAssets: 1, maxAssets: 1 },
  build(ctx) {
    const u = unit(ctx);
    const m = margin(ctx);
    const W = ctx.width;
    const H = ctx.height;
    const title = ctx.texts.title ?? "";
    const subtitle = ctx.texts.subtitle ?? "";
    const imageProps = { id: "image", assetId: ctx.assets.image?.id ?? null };

    if (isLandscape(ctx)) {
      const textLeft = ctx.variant !== "text-right";
      const colW = W * 0.42 - m;
      const x = textLeft ? m : W * 0.58;
      const size = Math.round(78 * u);
      const tLines = estimateLines(title, size, colW, 4);
      const sSize = Math.round(28 * u);
      const sLines = estimateLines(subtitle, sSize, colW, 5);
      const blockH = 44 * u + tLines * size * 1.08 + (sLines ? 36 * u + sLines * sSize * 1.45 : 0);
      const top = (H - blockH) / 2;
      // Imagem na proporção natural, sangrando pela borda lateral (sem zoom que corte o conteúdo).
      const imgW = W * 0.6;
      const imgH = imgW / aspectOf(ctx.assets.image ?? null, 1.6);
      const imgBox: Box = { x: textLeft ? W * 0.47 : W * 0.53 - imgW, y: (H - imgH) / 2, width: imgW, height: imgH };
      return {
        width: W,
        height: H,
        background: { fill: "background" },
        layers: compact([
          imageIn(imgBox, { ...imageProps, radius: Math.round(20 * u), shadow: "deep" }),
          eyebrow(ctx.texts.label ?? "", { x, y: top, width: colW, height: 30 * u }, u),
          text(title, { x, y: top + 44 * u, width: colW, height: tLines * size * 1.1 }, { id: "title", font: "display", size, weight: 600, lineHeight: 1.06, letterSpacing: -0.015, maxLines: 4 }),
          text(subtitle, { x, y: top + 44 * u + tLines * size * 1.08 + 36 * u, width: colW, height: sLines * sSize * 1.5 }, { id: "subtitle", font: "body", size: sSize, color: "textMuted", lineHeight: 1.45, maxLines: 5 }),
        ]),
      };
    }

    const { layers, contentTop } = header(ctx, { titleSize: 72, maxLines: 3 });
    const sSize = Math.round(28 * u);
    const sLines = estimateLines(subtitle, sSize, W - 2 * m, 3);
    const subtitleLayer = text(subtitle, { x: m, y: contentTop - 20 * u, width: W - 2 * m, height: sLines * sSize * 1.5 }, { id: "subtitle", font: "body", size: sSize, color: "textMuted", lineHeight: 1.45, maxLines: 3 });
    const imageTop = contentTop + (sLines ? sLines * sSize * 1.5 + 24 * u : 0);
    const box = fitAspect({ x: m, y: imageTop, width: W - 2 * m, height: H - imageTop - m }, aspectOf(ctx.assets.image ?? null, 1.6), "top");
    const block = compact([...layers, subtitleLayer, imageIn(box, { ...imageProps, radius: Math.round(24 * u), shadow: "soft" })]);
    const dy = (H - (box.y + box.height - m)) / 2 - m; // centraliza o bloco na altura
    return { width: W, height: H, background: { fill: "background" }, layers: shiftY(block, Math.max(0, dy)) };
  },
};

export const singleFeature: CompositionDefinition = {
  id: "single-feature",
  version: 1,
  name: "Single Feature",
  family: "feature",
  description: "Uma seção do site em destaque, com legenda. Para contar um recurso por vez.",
  formats: FORMAT_IDS,
  slots: [sectionSlot("feature", "Seção em destaque", true), titleSlot(false, 70), subtitleSlot("none"), labelSlot("project.name")],
  variants: [
    { id: "caption-bottom", label: "Legenda embaixo" },
    { id: "caption-top", label: "Legenda em cima" },
  ],
  capabilities: { motion: true, text: true, brandAdaptation: true, minAssets: 1, maxAssets: 1 },
  build(ctx) {
    const u = unit(ctx);
    const m = margin(ctx);
    const W = ctx.width;
    const H = ctx.height;
    const title = ctx.texts.title ?? "";
    const subtitle = ctx.texts.subtitle ?? "";
    const size = Math.round(48 * u);
    const tLines = estimateLines(title, size, W - 2 * m, 2);
    const sSize = Math.round(26 * u);
    const sLines = estimateLines(subtitle, sSize, W - 2 * m, 2);
    const captionH = 44 * u + (tLines ? tLines * size * 1.12 : 0) + (sLines ? 16 * u + sLines * sSize * 1.45 : 0);
    const top = ctx.variant === "caption-top";
    const gap = 40 * u;
    const avail = H - 2 * m - captionH - gap;
    const fitted = fitAspect({ x: m, y: 0, width: W - 2 * m, height: avail }, aspectOf(ctx.assets.feature ?? null, 1.6), "top");
    // bloco (imagem + legenda) centralizado na altura
    const blockTop = (H - (fitted.height + gap + captionH)) / 2;
    const imageBox: Box = { ...fitted, y: top ? blockTop + captionH + gap : blockTop };
    const captionY = top ? blockTop : blockTop + fitted.height + gap;
    return {
      width: W,
      height: H,
      background: { fill: "background", pattern: "grid" },
      layers: compact([
        imageIn(imageBox, { id: "feature", assetId: ctx.assets.feature?.id ?? null, radius: Math.round(26 * u), shadow: "soft" }),
        eyebrow(ctx.texts.label ?? "", { x: m, y: captionY, width: W - 2 * m, height: 30 * u }, u),
        text(title, { x: m, y: captionY + 44 * u, width: W - 2 * m, height: tLines * size * 1.12 }, { id: "title", font: "display", size, weight: 600, lineHeight: 1.1, maxLines: 2 }),
        text(subtitle, { x: m, y: captionY + 44 * u + tLines * size * 1.12 + 16 * u, width: W - 2 * m, height: sLines * sSize * 1.5 }, { id: "subtitle", font: "body", size: sSize, color: "textMuted", lineHeight: 1.45, maxLines: 2 }),
      ]),
    };
  },
};

export const uiDetailsGrid: CompositionDefinition = {
  id: "ui-details-grid",
  version: 1,
  name: "UI Details Grid",
  family: "detail",
  description: "Grade de recortes da interface: mostra o cuidado nos detalhes.",
  formats: FORMAT_IDS,
  slots: [sectionSlot("d1", "Detalhe 1", true), sectionSlot("d2", "Detalhe 2", true), sectionSlot("d3", "Detalhe 3", true), sectionSlot("d4", "Detalhe 4"), titleSlot(false, 60), labelSlot()],
  variants: [
    { id: "grid-4", label: "Grade 2×2" },
    { id: "grid-3", label: "Destaque + 2" },
  ],
  capabilities: { motion: true, text: true, brandAdaptation: true, minAssets: 3, maxAssets: 4 },
  build(ctx) {
    const u = unit(ctx);
    const m = margin(ctx);
    const W = ctx.width;
    const H = ctx.height;
    const { layers, contentTop } = header(ctx, { titleSize: 48 });
    const gap = Math.round(20 * u);
    const area: Box = { x: m, y: contentTop, width: W - 2 * m, height: H - contentTop - m };
    const cell = (id: string, box: Box) => imageIn(box, { id, assetId: ctx.assets[id]?.id ?? null, radius: Math.round(18 * u), shadow: "soft" });
    let cells;
    if (ctx.variant === "grid-3") {
      if (isPortrait(ctx)) {
        const bigH = (area.height - gap) * 0.58;
        const smallW = (area.width - gap) / 2;
        cells = [
          cell("d1", { x: area.x, y: area.y, width: area.width, height: bigH }),
          cell("d2", { x: area.x, y: area.y + bigH + gap, width: smallW, height: area.height - bigH - gap }),
          cell("d3", { x: area.x + smallW + gap, y: area.y + bigH + gap, width: smallW, height: area.height - bigH - gap }),
        ];
      } else {
        const bigW = (area.width - gap) * 0.6;
        const smallH = (area.height - gap) / 2;
        cells = [
          cell("d1", { x: area.x, y: area.y, width: bigW, height: area.height }),
          cell("d2", { x: area.x + bigW + gap, y: area.y, width: area.width - bigW - gap, height: smallH }),
          cell("d3", { x: area.x + bigW + gap, y: area.y + smallH + gap, width: area.width - bigW - gap, height: smallH }),
        ];
      }
    } else {
      // Células na proporção dos recortes (sem zoom), grade centralizada na área.
      const aspect = aspectOf(ctx.assets.d1 ?? null, 1.6);
      const cw0 = (area.width - gap) / 2;
      const ch = Math.min((area.height - gap) / 2, cw0 / aspect);
      const cw = Math.min(cw0, ch * aspect);
      const gridW = cw * 2 + gap;
      const gridH = ch * 2 + gap;
      const ox = area.x + (area.width - gridW) / 2;
      const oy = area.y + (area.height - gridH) / 2;
      cells = ["d1", "d2", "d3", "d4"].map((id, i) => cell(id, { x: ox + (i % 2) * (cw + gap), y: oy + Math.floor(i / 2) * (ch + gap), width: cw, height: ch }));
    }
    return { width: W, height: H, background: { fill: "background" }, layers: [...layers, ...cells] };
  },
};

export const mobileStack: CompositionDefinition = {
  id: "mobile-stack",
  version: 1,
  name: "Mobile Stack",
  family: "mobile",
  description: "Telas do celular lado a lado, em escada. A versão mobile em primeiro plano.",
  formats: FORMAT_IDS,
  slots: [mobileSlot("m1", "Tela 1"), mobileSectionSlot("m2", "Tela 2", true), mobileSectionSlot("m3", "Tela 3"), titleSlot(false, 60), labelSlot()],
  variants: [
    { id: "three", label: "Três telas" },
    { id: "two", label: "Duas telas" },
  ],
  capabilities: { motion: true, text: true, brandAdaptation: true, minAssets: 2, maxAssets: 3 },
  build(ctx) {
    const u = unit(ctx);
    const m = margin(ctx);
    const W = ctx.width;
    const H = ctx.height;
    const { layers, contentTop } = header(ctx, { titleSize: 52 });
    const ids = ctx.variant === "two" || !ctx.assets.m3 ? ["m1", "m2"] : ["m2", "m1", "m3"];
    const n = ids.length;
    const gap = Math.round(28 * u);
    const colW = (W - 2 * m - gap * (n - 1)) / n;
    const areaH = H - contentTop - m;
    const stagger = areaH * 0.06;
    const phones = ids.map((id, i) => {
      const middle = n === 3 && i === 1;
      const dy = middle ? 0 : stagger;
      return {
        ...phoneIn({ x: m + i * (colW + gap), y: contentTop + dy, width: colW, height: areaH - stagger }, aspectOf(ctx.assets[id] ?? null, MOBILE_ASPECT), {
          id,
          assetId: ctx.assets[id]?.id ?? null,
        }),
        shadow: middle ? ("deep" as const) : ("device" as const),
      };
    });
    // o do meio por cima
    const ordered = n === 3 ? [phones[0], phones[2], phones[1]] : phones;
    return { width: W, height: H, background: { fill: "background", pattern: "grid" }, layers: [...layers, ...ordered] };
  },
};

import type { Artboard } from "../documents/artboard";
import type { Layer } from "../documents/layer";
import { contrastRatio } from "./visual-profile";
import { resolveColor, type StyleTokens } from "./tokens";

/**
 * Guardrails criativos (docs/AI-GUARDRAILS.md → Creative guardrails) como checagens
 * determinísticas de uma peça: não bloqueiam nada, avisam antes do render.
 * Valem igual para peças feitas pela IA, pelas regras ou à mão.
 */
export type CreativeIssueCode = "low-contrast" | "text-overflow" | "out-of-bounds" | "empty-image" | "accent-overuse" | "tiny-text" | "hidden-only";

export interface CreativeIssue {
  code: CreativeIssueCode;
  severity: "warning" | "info";
  layerId: string | null;
  message: string;
}

const MIN_CONTRAST = 3; // títulos grandes: WCAG AA large
const MIN_CONTRAST_BODY = 4.5;

interface Placed {
  layer: Layer;
  x: number;
  y: number;
}

function flatten(layers: readonly Layer[], ox = 0, oy = 0): Placed[] {
  return layers.flatMap((layer) => {
    if (!layer.visible) return [];
    const here: Placed = { layer, x: ox + layer.x, y: oy + layer.y };
    return layer.type === "group" ? [here, ...flatten(layer.children, here.x, here.y)] : [here];
  });
}

function toHex(color: string): string | null {
  return /^#[0-9a-f]{6}/i.test(color) ? color.slice(0, 7).toLowerCase() : null;
}

/** Cor que fica atrás do centro do texto: a forma sólida mais alta embaixo dele, ou o fundo. */
function backdropOf(index: number, placed: Placed[], artboard: Artboard, tokens: StyleTokens): string | null {
  const text = placed[index];
  const cx = text.x + text.layer.width / 2;
  const cy = text.y + text.layer.height / 2;
  for (let i = index - 1; i >= 0; i--) {
    const p = placed[i];
    const inside = cx >= p.x && cx <= p.x + p.layer.width && cy >= p.y && cy <= p.y + p.layer.height;
    if (!inside || p.layer.opacity < 0.9 || p.layer.rotation !== 0) continue;
    if (p.layer.type === "shape" && p.layer.fill) return toHex(resolveColor(p.layer.fill, tokens));
    // Imagem atrás do texto: contraste imprevisível — não afirmamos nada.
    if (p.layer.type === "asset" || p.layer.type === "browser" || p.layer.type === "device") return null;
  }
  return toHex(resolveColor(artboard.background.fill, tokens));
}

/** Linhas aproximadas de um texto (largura média de glifo ≈ 0,55 do corpo). */
export function estimateTextLines(text: string, size: number, width: number, letterSpacing = 0): number {
  const perLine = Math.max(1, Math.floor(width / (size * (0.55 + letterSpacing))));
  return text.split("\n").reduce((sum, paragraph) => sum + Math.max(1, Math.ceil(paragraph.length / perLine)), 0);
}

export function lintArtboard(artboard: Artboard, tokens: StyleTokens): CreativeIssue[] {
  const issues: CreativeIssue[] = [];
  const placed = flatten(artboard.layers);
  const unit = Math.min(artboard.width, artboard.height);
  let accentArea = 0;

  placed.forEach((p, index) => {
    const { layer } = p;
    const right = p.x + layer.width;
    const bottom = p.y + layer.height;
    const visibleW = Math.max(0, Math.min(right, artboard.width) - Math.max(p.x, 0));
    const visibleH = Math.max(0, Math.min(bottom, artboard.height) - Math.max(p.y, 0));
    if (layer.type !== "group" && layer.width > 0 && layer.height > 0 && visibleW * visibleH < layer.width * layer.height * 0.25 && layer.rotation === 0) {
      issues.push({ code: "out-of-bounds", severity: "info", layerId: layer.id, message: `"${layerName(layer)}" está quase todo fora da área da peça.` });
    }

    if (layer.type === "text" && layer.text.trim()) {
      const color = toHex(resolveColor(layer.color, tokens));
      const backdrop = backdropOf(index, placed, artboard, tokens);
      if (color && backdrop) {
        const ratio = contrastRatio(color, backdrop);
        const needed = layer.size >= unit * 0.04 && layer.weight >= 600 ? MIN_CONTRAST : MIN_CONTRAST_BODY;
        if (ratio < needed) issues.push({ code: "low-contrast", severity: "warning", layerId: layer.id, message: `Contraste baixo em "${layerName(layer)}" (${ratio.toFixed(1)}:1; mínimo ${needed}:1).` });
      }
      const lines = estimateTextLines(layer.uppercase ? layer.text.toUpperCase() : layer.text, layer.size, layer.width, layer.letterSpacing);
      const shown = layer.maxLines ? Math.min(lines, layer.maxLines) : lines;
      if ((layer.maxLines && lines > layer.maxLines) || shown * layer.size * layer.lineHeight > layer.height * 1.35) {
        issues.push({ code: "text-overflow", severity: "warning", layerId: layer.id, message: `"${layerName(layer)}" pode não caber na caixa (≈${lines} ${lines === 1 ? "linha" : "linhas"}).` });
      }
      if (layer.size < unit * 0.014) issues.push({ code: "tiny-text", severity: "info", layerId: layer.id, message: `"${layerName(layer)}" fica ilegível no celular (${Math.round(layer.size)}px numa peça de ${unit}px).` });
    }

    if ((layer.type === "asset" || layer.type === "browser" || layer.type === "device") && !layer.assetId) {
      issues.push({ code: "empty-image", severity: "warning", layerId: layer.id, message: `"${layerName(layer)}" está sem imagem — sai vazio no render.` });
    }

    if (layer.type === "shape" && (layer.fill === "primary" || layer.fill === "accent")) accentArea += visibleW * visibleH;
  });

  if (accentArea > artboard.width * artboard.height * 0.35) {
    issues.push({ code: "accent-overuse", severity: "info", layerId: null, message: "Cor de destaque cobre mais de um terço da peça — use o destaque para guiar o olhar, não como fundo." });
  }
  if (artboard.layers.length > 0 && placed.length === 0) issues.push({ code: "hidden-only", severity: "warning", layerId: null, message: "Todas as camadas estão ocultas." });
  return issues;
}

function layerName(layer: Layer): string {
  if (layer.name) return layer.name;
  if (layer.type === "text") return layer.text.trim().slice(0, 24) || "texto";
  return { asset: "imagem", browser: "navegador", device: "celular", shape: "forma", group: "grupo" }[layer.type];
}

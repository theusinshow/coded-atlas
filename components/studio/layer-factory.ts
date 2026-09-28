import { browserSize, phoneSize } from "@/src/core/documents/devices";
import { LayerSchema, type Layer, type LayerInput } from "@/src/core/documents/layer";
import type { StudioAsset } from "@/components/create/types";

/** Layers novos com tamanhos proporcionais ao artboard (o que o painel "Adicionar" cria). */

export function newLayerId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `l${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

type Board = { width: number; height: number };

function centered(board: Board, width: number, height: number) {
  return { x: Math.round((board.width - width) / 2), y: Math.round((board.height - height) / 2), width: Math.round(width), height: Math.round(height) };
}

const make = (input: LayerInput): Layer => LayerSchema.parse(input);

export function newText(board: Board): Layer {
  const unit = Math.min(board.width, board.height);
  const size = Math.round(unit * 0.07);
  return make({ id: newLayerId(), type: "text", text: "Novo texto", font: "display", weight: 700, size, color: "text", lineHeight: 1.1, ...centered(board, board.width * 0.8, size * 1.3) });
}

export function newShape(board: Board, shape: "rect" | "ellipse" | "line"): Layer {
  const unit = Math.min(board.width, board.height);
  if (shape === "line") return make({ id: newLayerId(), type: "shape", shape: "rect", fill: "primary", name: "Linha", ...centered(board, unit * 0.12, Math.max(2, unit * 0.006)) });
  const side = unit * 0.3;
  return make({ id: newLayerId(), type: "shape", shape, fill: shape === "ellipse" ? "primary" : "surface", radius: shape === "rect" ? Math.round(unit * 0.02) : 0, ...centered(board, side, side) });
}

const aspectOf = (asset: StudioAsset | null, fallback: number) => (asset?.width && asset.height ? asset.width / asset.height : fallback);

export function newImage(board: Board, asset: StudioAsset): Layer {
  const aspect = aspectOf(asset, 16 / 10);
  // Página inteira muito alta entra cortada numa proporção de tela, não como uma tira fina.
  const shown = Math.max(aspect, 0.5);
  const width = Math.min(board.width * 0.7, board.height * 0.7 * shown);
  return make({ id: newLayerId(), type: "asset", assetId: asset.id as Extract<LayerInput, { type: "asset" }>["assetId"], fit: "cover", radius: Math.round(Math.min(board.width, board.height) * 0.012), shadow: "soft", ...centered(board, width, width / shown) });
}

export function newBrowser(board: Board, asset: StudioAsset | null): Layer {
  const width = board.width * 0.78;
  const size = browserSize(width, Math.max(aspectOf(asset, 16 / 10), 1.2));
  return make({
    id: newLayerId(),
    type: "browser",
    assetId: (asset?.id ?? null) as Extract<LayerInput, { type: "browser" }>["assetId"],
    radius: Math.round(width * 0.012),
    shadow: "device",
    ...centered(board, size.width, Math.min(size.height, board.height * 0.8)),
  });
}

export function newPhone(board: Board, asset: StudioAsset | null): Layer {
  const width = Math.min(board.width * 0.32, board.height * 0.36);
  const size = phoneSize(width, Math.min(Math.max(aspectOf(asset, 9 / 19.5), 0.4), 0.6));
  return make({ id: newLayerId(), type: "device", assetId: (asset?.id ?? null) as Extract<LayerInput, { type: "device" }>["assetId"], shadow: "device", ...centered(board, size.width, size.height) });
}

export function layerLabel(layer: Layer): string {
  if (layer.name) return layer.name;
  switch (layer.type) {
    case "text":
      return layer.text.trim().slice(0, 28) || "Texto";
    case "asset":
      return "Imagem";
    case "device":
      return "Celular";
    case "browser":
      return "Navegador";
    case "shape":
      return layer.shape === "ellipse" ? "Elipse" : "Forma";
    case "group":
      return "Grupo";
  }
}

export const LAYER_TYPE_LABEL: Record<Layer["type"], string> = {
  text: "Texto",
  asset: "Imagem",
  device: "Celular",
  browser: "Navegador",
  shape: "Forma",
  group: "Grupo",
};

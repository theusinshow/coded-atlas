"use client";
import { AppWindow, Circle, Eye, EyeOff, Image as ImageIcon, Layers, Lock, LockOpen, Minus, Shapes, Smartphone, Square, Type, type LucideIcon } from "lucide-react";
import type { Layer } from "@/src/core/documents/layer";
import { insertLayer, updateLayer } from "@/src/core/documents/layer-tree";
import type { CanvasContent } from "@/src/core/documents/creative-document";
import { AssetPicker } from "@/components/create/asset-picker";
import type { StudioAsset } from "@/components/create/types";
import { layerLabel, LAYER_TYPE_LABEL, newBrowser, newPhone, newShape, newText, newImage } from "./layer-factory";
import { useStudio, useStudioApi } from "./store";

/** Ordem de exibição: o que está por cima aparece primeiro (como em qualquer editor). */
function displayRows(layers: readonly Layer[], depth = 0): { layer: Layer; depth: number }[] {
  return [...layers].reverse().flatMap((layer) => [{ layer, depth }, ...(layer.type === "group" ? displayRows(layer.children, depth + 1) : [])]);
}

const TYPE_ICON: Record<Layer["type"], LucideIcon> = { text: Type, asset: ImageIcon, device: Smartphone, browser: AppWindow, shape: Shapes, group: Layers };

export function LayersPanel() {
  const layers = useStudio((s) => s.content.artboard.layers);
  const selectedId = useStudio((s) => s.selectedId);
  const select = useStudio((s) => s.select);
  const apply = useStudio((s) => s.apply);
  const toggle = (id: string, field: "visible" | "locked", value: boolean) =>
    apply((c) => ({ ...c, artboard: { ...c.artboard, layers: updateLayer(c.artboard.layers, id, { [field]: value }) } }));

  if (layers.length === 0) return <p className="px-4 py-6 text-[12px] text-cbm-gray-400">Nenhuma camada. Adicione texto, formas ou imagens na aba Adicionar.</p>;
  const toggleBtn = "grid h-6 w-6 shrink-0 place-items-center transition-opacity";
  return (
    <ul className="py-1" aria-label="Camadas">
      {displayRows(layers).map(({ layer, depth }) => {
        const Icon = TYPE_ICON[layer.type];
        const label = layerLabel(layer);
        return (
          <li key={layer.id}>
            <div
              data-layer-row={layer.id}
              className={`group flex items-center gap-2 h-8 pr-2 text-[12px] cursor-pointer transition-colors ${selectedId === layer.id ? "bg-surface-2 text-cbm-white" : "text-cbm-gray-400 hover:bg-surface hover:text-cbm-gray-100"}`}
              style={{ paddingLeft: 12 + depth * 14 }}
              onClick={() => select(layer.id)}
            >
              <Icon size={13} className="shrink-0 text-cbm-gray-400" aria-hidden />
              <span className="sr-only">{LAYER_TYPE_LABEL[layer.type]}:</span>
              <span className={`flex-1 truncate ${layer.visible ? "" : "opacity-40"}`}>{label}</span>
              <button
                type="button"
                title={layer.visible ? "Ocultar" : "Mostrar"}
                aria-label={`${layer.visible ? "Ocultar" : "Mostrar"} ${label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(layer.id, "visible", !layer.visible);
                }}
                className={`${toggleBtn} ${layer.visible ? "text-cbm-gray-400 hover:text-cbm-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100" : "text-cbm-gray-200"}`}
              >
                {layer.visible ? <Eye size={13} aria-hidden /> : <EyeOff size={13} aria-hidden />}
              </button>
              <button
                type="button"
                title={layer.locked ? "Destravar" : "Travar"}
                aria-label={`${layer.locked ? "Destravar" : "Travar"} ${label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(layer.id, "locked", !layer.locked);
                }}
                className={`${toggleBtn} ${layer.locked ? "text-cbm-gray-200" : "text-cbm-gray-400 hover:text-cbm-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`}
              >
                {layer.locked ? <Lock size={13} aria-hidden /> : <LockOpen size={13} aria-hidden />}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function AddPanel({ assets }: { assets: StudioAsset[] }) {
  const api = useStudioApi();
  const add = (make: (board: CanvasContent["artboard"]) => Layer) => {
    const { apply, select, content } = api.getState();
    const layer = make(content.artboard);
    apply((c) => ({ ...c, artboard: { ...c.artboard, layers: insertLayer(c.artboard.layers, layer) } }));
    select(layer.id);
  };
  const lastDesktop = assets.find((a) => a.metadata.device !== "mobile" && a.kind !== "section") ?? null;
  const lastMobile = assets.find((a) => a.metadata.device === "mobile") ?? null;

  const buttons: { label: string; icon: LucideIcon; make: (b: CanvasContent["artboard"]) => Layer }[] = [
    { label: "Texto", icon: Type, make: newText },
    { label: "Retângulo", icon: Square, make: (b) => newShape(b, "rect") },
    { label: "Elipse", icon: Circle, make: (b) => newShape(b, "ellipse") },
    { label: "Linha", icon: Minus, make: (b) => newShape(b, "line") },
    { label: "Navegador", icon: AppWindow, make: (b) => newBrowser(b, lastDesktop) },
    { label: "Celular", icon: Smartphone, make: (b) => newPhone(b, lastMobile) },
  ];

  return (
    <div className="p-4 space-y-5">
      <div className="grid grid-cols-2 gap-1.5">
        {buttons.map((b) => (
          <button
            key={b.label}
            type="button"
            onClick={() => add(b.make)}
            className="h-9 border border-line text-[12px] text-cbm-gray-200 transition-colors hover:border-cbm-gray-400 hover:text-cbm-white flex items-center gap-2 px-3"
          >
            <b.icon size={14} className="text-cbm-gray-400" aria-hidden />
            {b.label}
          </button>
        ))}
      </div>
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-cbm-gray-400 mb-2">Imagem do projeto</p>
        <AssetPicker assets={assets} columns={2} maxHeight="calc(100vh - 360px)" onPick={(asset) => add((b) => newImage(b, asset))} />
      </div>
    </div>
  );
}

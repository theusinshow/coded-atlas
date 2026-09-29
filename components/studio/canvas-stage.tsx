"use client";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { StyleTokens } from "@/src/core/creative/tokens";
import type { Layer } from "@/src/core/documents/layer";
import { absoluteBox, findLayer, updateLayer } from "@/src/core/documents/layer-tree";
import { ArtboardView } from "@/src/render/artboard-view";
import { assetFileUrl } from "@/components/atlas/asset-image";
import { useStudio, useStudioApi } from "./store";

export type Zoom = "fit" | number;

type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const HANDLE_POS: Record<Handle, { left: string; top: string; cursor: string }> = {
  nw: { left: "0%", top: "0%", cursor: "nwse-resize" },
  n: { left: "50%", top: "0%", cursor: "ns-resize" },
  ne: { left: "100%", top: "0%", cursor: "nesw-resize" },
  e: { left: "100%", top: "50%", cursor: "ew-resize" },
  se: { left: "100%", top: "100%", cursor: "nwse-resize" },
  s: { left: "50%", top: "100%", cursor: "ns-resize" },
  sw: { left: "0%", top: "100%", cursor: "nesw-resize" },
  w: { left: "0%", top: "50%", cursor: "ew-resize" },
};
const MIN_SIZE = 8;
const SNAP_PX = 6;

interface Gesture {
  id: string;
  mode: "move" | Handle;
  startX: number;
  startY: number;
  box: { x: number; y: number; width: number; height: number };
  offset: { x: number; y: number };
  rotation: number;
  pointerId: number;
}

interface Guides {
  x: number[];
  y: number[];
}

/** Snapping de movimento: bordas/centro do artboard e dos outros layers de topo. */
function snapMove(
  abs: { x: number; y: number; width: number; height: number },
  targets: { x: number[]; y: number[] },
  threshold: number
): { dx: number; dy: number; guides: Guides } {
  const pick = (edges: number[], lines: number[]) => {
    let best: { d: number; line: number } | null = null;
    for (const e of edges) for (const line of lines) {
      const d = line - e;
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, line };
    }
    return best;
  };
  const bx = pick([abs.x, abs.x + abs.width / 2, abs.x + abs.width], targets.x);
  const by = pick([abs.y, abs.y + abs.height / 2, abs.y + abs.height], targets.y);
  return { dx: bx?.d ?? 0, dy: by?.d ?? 0, guides: { x: bx ? [bx.line] : [], y: by ? [by.line] : [] } };
}

function resizeBox(box: Gesture["box"], handle: Handle, dx: number, dy: number, keepAspect: boolean) {
  let { x, y, width, height } = box;
  const aspect = box.width / Math.max(1, box.height);
  if (handle.includes("e")) width = box.width + dx;
  if (handle.includes("w")) width = box.width - dx;
  if (handle.includes("s")) height = box.height + dy;
  if (handle.includes("n")) height = box.height - dy;
  width = Math.max(MIN_SIZE, width);
  height = Math.max(MIN_SIZE, height);
  if (keepAspect && handle.length === 2) {
    if (Math.abs(dx) * box.height > Math.abs(dy) * box.width) height = width / aspect;
    else width = height * aspect;
  }
  if (handle.includes("w")) x = box.x + box.width - width;
  if (handle.includes("n")) y = box.y + box.height - height;
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

export function CanvasStage({ tokens, zoom, onFit, videos }: { tokens: StyleTokens; zoom: Zoom; onFit: (scale: number) => void; videos?: ReadonlySet<string> }) {
  const api = useStudioApi();
  const artboard = useStudio((s) => s.content.artboard);
  const selectedId = useStudio((s) => s.selectedId);
  const select = useStudio((s) => s.select);
  const containerRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0.3);
  const [guides, setGuides] = useState<Guides>({ x: [], y: [] });
  const gesture = useRef<Gesture | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const next = Math.max(0.05, Math.min((width - 96) / artboard.width, (height - 96) / artboard.height, 2));
      setFit(next);
      onFit(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [artboard.width, artboard.height, onFit]);

  const scale = zoom === "fit" ? fit : zoom;
  const selected = selectedId ? findLayer(artboard.layers, selectedId) : null;

  function begin(e: ReactPointerEvent, id: string, mode: Gesture["mode"]) {
    const found = findLayer(api.getState().content.artboard.layers, id);
    if (!found || found.layer.locked) return;
    e.stopPropagation();
    e.preventDefault();
    // preventDefault impede o foco natural: tirar o foco do campo em edição, senão Ctrl+Z vai para ele.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    gesture.current = {
      id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      box: { x: found.layer.x, y: found.layer.y, width: found.layer.width, height: found.layer.height },
      offset: found.offset,
      rotation: found.layer.rotation,
      pointerId: e.pointerId,
    };
  }

  function move(e: ReactPointerEvent) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointerId) return;
    let dx = (e.clientX - g.startX) / scale;
    let dy = (e.clientY - g.startY) / scale;
    const layers = api.getState().content.artboard.layers;
    let patch: Partial<Gesture["box"]>;
    if (g.mode === "move") {
      let nx = Math.round(g.box.x + dx);
      let ny = Math.round(g.box.y + dy);
      if (!e.altKey) {
        const others = layers.filter((l) => l.id !== g.id && l.visible);
        const targets = {
          x: [0, artboard.width / 2, artboard.width, ...others.flatMap((l) => [l.x, l.x + l.width / 2, l.x + l.width])],
          y: [0, artboard.height / 2, artboard.height, ...others.flatMap((l) => [l.y, l.y + l.height / 2, l.y + l.height])],
        };
        const snap = snapMove({ x: g.offset.x + nx, y: g.offset.y + ny, width: g.box.width, height: g.box.height }, targets, SNAP_PX / scale);
        nx += Math.round(snap.dx);
        ny += Math.round(snap.dy);
        setGuides(snap.guides);
      }
      patch = { x: nx, y: ny };
    } else {
      // Arrasto convertido para os eixos do próprio layer (funciona com rotação).
      const rad = (-g.rotation * Math.PI) / 180;
      [dx, dy] = [dx * Math.cos(rad) - dy * Math.sin(rad), dx * Math.sin(rad) + dy * Math.cos(rad)];
      patch = resizeBox(g.box, g.mode, dx, dy, e.shiftKey);
    }
    api.getState().apply((c) => ({ ...c, artboard: { ...c.artboard, layers: updateLayer(c.artboard.layers, g.id, patch) } }), `${g.mode === "move" ? "move" : "resize"}:${g.id}`);
  }

  function end(e: ReactPointerEvent) {
    if (gesture.current?.pointerId === e.pointerId) gesture.current = null;
    setGuides({ x: [], y: [] });
  }

  const box = (layer: Layer, offset = { x: 0, y: 0 }) => ({
    left: (offset.x + layer.x) * scale,
    top: (offset.y + layer.y) * scale,
    width: layer.width * scale,
    height: layer.height * scale,
    transform: layer.rotation ? `rotate(${layer.rotation}deg)` : undefined,
  });

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-auto bg-[#08090b]"
      onPointerDown={() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        select(null);
      }}
    >
      <div className="grid place-items-center" style={{ minWidth: "100%", minHeight: "100%", width: artboard.width * scale + 96, height: artboard.height * scale + 96 }}>
        <div className="relative shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]" style={{ width: artboard.width * scale, height: artboard.height * scale }} data-studio-artboard>
          <div className="absolute left-0 top-0 origin-top-left pointer-events-none" style={{ width: artboard.width, height: artboard.height, transform: `scale(${scale})` }}>
            <ArtboardView artboard={artboard} tokens={tokens} mode="preview" resolveAsset={assetFileUrl} videos={videos} />
          </div>

          {/* Alvos de clique dos layers de topo (último = por cima). */}
          <div className="absolute inset-0" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
            {artboard.layers.map((layer) =>
              !layer.visible ? null : (
                <div
                  key={layer.id}
                  data-layer-hit={layer.id}
                  className={`absolute ${layer.locked ? "pointer-events-none" : "cursor-move hover:outline hover:outline-1 hover:outline-accent/60"}`}
                  style={box(layer)}
                  onPointerDown={(e) => {
                    select(layer.id);
                    begin(e, layer.id, "move");
                  }}
                  onDoubleClick={() => layer.type === "text" && api.getState().requestTextFocus()}
                />
              )
            )}

            {selected && selected.layer.visible && (
              <div
                data-selection={selected.layer.id}
                className={`absolute outline outline-1 ${selected.layer.locked ? "outline-cbm-gray-400 outline-dashed" : "outline-accent cursor-move"}`}
                style={box(selected.layer, selected.offset)}
                onPointerDown={(e) => begin(e, selected.layer.id, "move")}
                onDoubleClick={() => selected.layer.type === "text" && api.getState().requestTextFocus()}
              >
                {!selected.layer.locked &&
                  HANDLES.map((h) => (
                    <span
                      key={h}
                      data-handle={h}
                      className="absolute w-2.5 h-2.5 -ml-[5px] -mt-[5px] bg-cbm-white border border-accent"
                      style={{ left: HANDLE_POS[h].left, top: HANDLE_POS[h].top, cursor: HANDLE_POS[h].cursor }}
                      onPointerDown={(e) => begin(e, selected.layer.id, h)}
                    />
                  ))}
              </div>
            )}

            {guides.x.map((x) => (
              <div key={`gx${x}`} className="absolute top-0 bottom-0 w-px bg-signal pointer-events-none" style={{ left: x * scale }} />
            ))}
            {guides.y.map((y) => (
              <div key={`gy${y}`} className="absolute left-0 right-0 h-px bg-signal pointer-events-none" style={{ top: y * scale }} />
            ))}
          </div>
        </div>
      </div>
      {selected && (
        <p className="pointer-events-none absolute bottom-3 left-3 text-[10px] font-mono text-cbm-gray-400 tabular-nums">
          {(() => {
            const b = absoluteBox(selected);
            return `x ${Math.round(b.x)} · y ${Math.round(b.y)} · ${Math.round(b.width)}×${Math.round(b.height)}`;
          })()}
        </p>
      )}
    </div>
  );
}

"use client";
import { useState } from "react";
import { AssetThumb } from "@/components/atlas/asset-image";
import type { StudioAsset } from "./types";

const FILTERS = [
  { id: "all", label: "Todos" },
  { id: "desktop", label: "Desktop" },
  { id: "mobile", label: "Mobile" },
  { id: "section", label: "Seções" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

function matches(asset: StudioAsset, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "section") return asset.kind === "section";
  return asset.metadata.device === filter;
}

/** Grade de imagens do projeto com filtros rápidos (Criar e Studio). */
export function AssetPicker({
  assets,
  value,
  onPick,
  onClear,
  columns = 3,
  maxHeight = "16rem",
}: {
  assets: StudioAsset[];
  value?: string | null;
  onPick: (asset: StudioAsset) => void;
  onClear?: () => void;
  columns?: 2 | 3;
  maxHeight?: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const visible = assets.filter((a) => matches(a, filter));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`px-2 py-1 text-[11px] border ${filter === f.id ? "border-accent text-cbm-white" : "border-line text-cbm-gray-400 hover:text-cbm-gray-200"}`}
          >
            {f.label}
          </button>
        ))}
        {onClear && (
          <button type="button" onClick={onClear} className="ml-auto px-2 py-1 text-[11px] text-cbm-gray-400 hover:text-bad">
            Deixar vazio
          </button>
        )}
      </div>
      {visible.length === 0 ? (
        <p className="text-[12px] text-cbm-gray-400 px-1 py-3">Nenhum asset neste filtro.</p>
      ) : (
        <ul className={`grid gap-1.5 overflow-y-auto ${columns === 2 ? "grid-cols-2" : "grid-cols-3"}`} style={{ maxHeight }}>
          {visible.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onPick(a)}
                title={a.label ?? a.kind}
                data-asset={a.id}
                className={`block w-full aspect-[16/10] border overflow-hidden ${a.id === value ? "border-accent" : "border-line hover:border-cbm-gray-400"}`}
              >
                {a.mimeType.startsWith("video/") ? (
                  <span className="grid w-full h-full place-items-center bg-surface-2 text-[10px] font-medium uppercase tracking-[0.22em] text-accent">▶ vídeo</span>
                ) : (
                  <AssetThumb id={a.id} alt={a.label ?? a.kind} width={320} className="w-full h-full" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

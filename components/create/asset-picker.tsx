"use client";
import { Play } from "lucide-react";
import { useState } from "react";
import { AssetThumb } from "@/components/atlas/asset-image";
import { assetTitle } from "@/components/ui/format";
import type { StudioAsset } from "./types";

const FILTERS = [
  { id: "all", label: "Todos" },
  { id: "desktop", label: "Desktop" },
  { id: "mobile", label: "Celular" },
  { id: "section", label: "Seções" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

function matches(asset: StudioAsset, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "section") return asset.kind === "section";
  return asset.metadata.device === filter;
}

/** Grade de imagens do projeto com filtros rápidos (Criar, Studio e Case). */
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
      <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Filtrar imagens">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`h-10 sm:h-7 px-2.5 text-[12px] border transition-colors ${filter === f.id ? "border-cbm-white text-cbm-white" : "border-line text-cbm-gray-400 hover:text-cbm-white"}`}
          >
            {f.label}
          </button>
        ))}
        {onClear && (
          <button type="button" onClick={onClear} className="ml-auto h-10 sm:h-7 px-2 text-[12px] text-cbm-gray-400 hover:text-cbm-white">
            Deixar vazio
          </button>
        )}
      </div>
      {visible.length === 0 ? (
        <p className="text-[12px] text-cbm-gray-400 px-1 py-3">Nenhuma imagem neste filtro.</p>
      ) : (
        <ul className={`grid gap-1.5 overflow-y-auto ${columns === 2 ? "grid-cols-2" : "grid-cols-3"}`} style={{ maxHeight }}>
          {visible.map((a) => {
            const title = assetTitle(a);
            const selected = a.id === value;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onPick(a)}
                  title={title}
                  aria-label={title}
                  aria-pressed={selected}
                  data-asset={a.id}
                  className={`relative block w-full aspect-[16/10] border overflow-hidden transition-colors ${selected ? "border-cbm-white" : "border-line hover:border-cbm-gray-400"}`}
                >
                  <AssetThumb id={a.id} alt="" width={320} className="w-full h-full" />
                  {a.mimeType.startsWith("video/") && (
                    <span className="absolute left-1 bottom-1 grid h-5 w-5 place-items-center bg-base/85 text-cbm-white" aria-hidden>
                      <Play size={11} />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

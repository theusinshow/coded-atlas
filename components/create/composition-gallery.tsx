"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { createInstanceAction } from "@/app/actions/create";
import type { Binding, CompositionInstance } from "@/src/core/creative/composition";
import { COMPOSITIONS } from "@/src/core/creative/compositions";
import { FORMAT_IDS, FORMATS, type FormatId } from "@/src/core/creative/formats";
import type { VisualProfile } from "@/src/core/creative/visual-profile";
import { buttonClass } from "@/components/ui/primitives";
import { ArtboardPreview } from "./artboard-preview";
import { FAMILY_LABEL, instanceDefinition, renderModel, type StudioAsset } from "./types";

interface Props {
  projectId: string;
  slug: string;
  assets: StudioAsset[];
  profile: VisualProfile | null;
  profilesByRevision: Record<number, VisualProfile>;
  suggestions: Record<string, Record<string, Binding>>;
  instances: CompositionInstance[];
}

const GRID: Record<FormatId, string> = {
  "post-1x1": "grid-cols-2 lg:grid-cols-4",
  "post-4x5": "grid-cols-2 lg:grid-cols-4",
  "story-9x16": "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
  "landscape-16x9": "grid-cols-1 sm:grid-cols-2",
  "og-1.91x1": "grid-cols-1 sm:grid-cols-2",
};

/** Galeria de composições curadas, já com o material do projeto, + peças salvas. */
export function CompositionGallery({ projectId, slug, assets, profile, profilesByRevision, suggestions, instances }: Props) {
  const [format, setFormat] = useState<FormatId>("post-4x5");
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const available = COMPOSITIONS.filter((c) => c.formats.includes(format));

  return (
    <div className="space-y-10">
      {instances.length > 0 && (
        <section aria-labelledby="pecas">
          <h2 id="pecas" className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 mb-3">
            Suas peças ({instances.length})
          </h2>
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 items-end">
            {instances.map((instance) => {
              const definition = instanceDefinition(instance);
              if (!definition) return null;
              const snapshot = (instance.visualProfileRevision && profilesByRevision[instance.visualProfileRevision]) || profile;
              const model = renderModel(definition, { ...instance, primary: instance.overrides.primary }, assetMap, snapshot);
              return (
                <li key={instance.id}>
                  <Link href={`/projects/${slug}/create/${instance.id}`} className="group block space-y-2">
                    <ArtboardPreview {...model} className="border border-line group-hover:border-zinc-500 transition-colors" />
                    <p className="text-[12px] text-zinc-200 truncate">{instance.name}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="galeria" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="galeria" className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
              Composições curadas
            </h2>
            <p className="text-[13px] text-zinc-500 mt-1">Já preenchidas com o material do projeto. Escolha uma para ajustar e renderizar.</p>
          </div>
          <div role="radiogroup" aria-label="Formato" className="flex flex-wrap gap-1">
            {FORMAT_IDS.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={format === id}
                onClick={() => setFormat(id)}
                className={`h-8 px-3 text-[12px] border transition-colors ${
                  format === id ? "border-accent text-accent-bright" : "border-line text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {FORMATS[id].label}
              </button>
            ))}
          </div>
        </div>

        <ul className={`grid gap-6 ${GRID[format]}`}>
          {available.map((definition) => {
            const model = renderModel(
              definition,
              { formatId: format, variant: definition.variants[0].id, styleMode: "hybrid", bindings: suggestions[definition.id] ?? {} },
              assetMap,
              profile
            );
            return (
              <li key={definition.id} className="space-y-2.5" data-composition={definition.id}>
                <ArtboardPreview {...model} className="border border-line" />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] text-zinc-100">{definition.name}</p>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-accent">{FAMILY_LABEL[definition.family]}</p>
                  </div>
                  <form action={createInstanceAction}>
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="compositionId" value={definition.id} />
                    <input type="hidden" name="formatId" value={format} />
                    <button type="submit" className={buttonClass("secondary", "sm")}>
                      Usar
                    </button>
                  </form>
                </div>
                <p className="text-[12px] text-zinc-500 leading-snug">{definition.description}</p>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

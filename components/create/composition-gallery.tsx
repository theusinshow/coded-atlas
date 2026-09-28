"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { createInstanceAction } from "@/app/actions/create";
import { createBlankCanvasAction, createVideoFromRecipeAction, createWebsiteScrollAction } from "@/app/actions/studio";
import { VIDEO_RECIPES } from "@/src/core/motion/recipes";
import { contentPages, isCarousel, type DocumentContent } from "@/src/core/documents/creative-document";
import { resolveTokens } from "@/src/core/creative/tokens";
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
  documents: { id: string; name: string; headRevision: number; content: DocumentContent }[];
}

const GRID: Record<FormatId, string> = {
  "post-1x1": "grid-cols-2 lg:grid-cols-4",
  "post-4x5": "grid-cols-2 lg:grid-cols-4",
  "story-9x16": "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
  "landscape-16x9": "grid-cols-1 sm:grid-cols-2",
  "og-1.91x1": "grid-cols-1 sm:grid-cols-2",
};

/** Galeria de composições curadas, já com o material do projeto, + peças salvas. */
export function CompositionGallery({ projectId, slug, assets, profile, profilesByRevision, suggestions, instances, documents }: Props) {
  const [format, setFormat] = useState<FormatId>("post-4x5");
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const available = COMPOSITIONS.filter((c) => c.formats.includes(format));
  // Website Scroll precisa da página inteira (ou qualquer imagem bem mais alta que larga).
  const tallPages = assets.filter((a) => a.metadata.role === "fullpage" || a.metadata.role === "page-fullpage" || (!!a.width && !!a.height && a.height > a.width * 2));

  return (
    <div className="space-y-10">
      <section aria-labelledby="canvas" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="canvas" className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
            Documentos ({documents.length})
          </h2>
          <form action={createBlankCanvasAction} className="flex items-center gap-2">
            <input type="hidden" name="projectId" value={projectId} />
            <label htmlFor="blank-kind" className="text-[12px] text-zinc-500">
              Em branco
            </label>
            <select id="blank-kind" name="kind" defaultValue="canvas" className="h-8 bg-surface border border-line text-[12px] text-zinc-300 px-2" aria-label="Tipo">
              <option value="canvas">Canvas</option>
              <option value="carousel">Carrossel (3 páginas)</option>
              <option value="motion">Vídeo (1 cena)</option>
            </select>
            <select id="blank-format" name="formatId" defaultValue={format} className="h-8 bg-surface border border-line text-[12px] text-zinc-300 px-2">
              {FORMAT_IDS.map((id) => (
                <option key={id} value={id}>
                  {FORMATS[id].label}
                </option>
              ))}
            </select>
            <button type="submit" className={buttonClass("secondary", "sm")}>
              Criar
            </button>
          </form>
        </div>
        {documents.length === 0 ? (
          <p className="text-[12px] text-zinc-500">Edição livre: abra uma composição com “Editar no canvas” ou comece em branco.</p>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 items-end">
            {documents.map((doc) => {
              const { style } = doc.content;
              const tokens = resolveTokens((style.profileRevision && profilesByRevision[style.profileRevision]) || null, style.mode, style.primary ? { primary: style.primary } : {});
              return (
                <li key={doc.id}>
                  <Link href={`/studio/${doc.id}`} className="group block space-y-2" data-document={doc.id}>
                    <div className="relative">
                      <ArtboardPreview artboard={contentPages(doc.content)[0].artboard} tokens={tokens} className="border border-line group-hover:border-zinc-500 transition-colors" />
                      {isCarousel(doc.content) && (
                        <span className="absolute right-1.5 top-1.5 bg-black/70 px-1.5 py-0.5 text-[10px] font-mono text-zinc-200">{doc.content.pages.length} pág.</span>
                      )}
                    </div>
                    <p className="text-[12px] text-zinc-200 truncate">
                      {doc.name} <span className="text-zinc-600 font-mono text-[10px]">rev {doc.headRevision}</span>
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="receitas" className="border border-line bg-surface/40 p-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="receitas" className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
            Vídeo por receita
          </h2>
          <p className="text-[12px] text-zinc-500 mt-1">Estruturas prontas (abertura, site, mobile, scroll, assinatura) montadas com o material do projeto e animadas por presets.</p>
        </div>
        <form action={createVideoFromRecipeAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="projectId" value={projectId} />
          <select name="recipeId" aria-label="Receita de vídeo" className="h-8 max-w-64 bg-surface border border-line text-[12px] text-zinc-300 px-2">
            {VIDEO_RECIPES.map((r) => (
              <option key={r.id} value={r.id} title={r.description}>
                {r.name} · {r.durationRange[0]}–{r.durationRange[1]} s
              </option>
            ))}
          </select>
          <select name="formatId" aria-label="Formato do vídeo por receita" defaultValue="story-9x16" className="h-8 bg-surface border border-line text-[12px] text-zinc-300 px-2">
            {FORMAT_IDS.map((id) => (
              <option key={id} value={id}>
                {FORMATS[id].label}
              </option>
            ))}
          </select>
          <button type="submit" className={buttonClass("secondary", "sm")}>
            Montar vídeo
          </button>
        </form>
      </section>

      {tallPages.length > 0 && (
        <section aria-labelledby="scroll" className="border border-line bg-surface/40 p-4 flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="scroll" className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
              Vídeo rápido · Website Scroll
            </h2>
            <p className="text-[12px] text-zinc-500 mt-1">A página inteira capturada rolando dentro de uma janela de navegador — pronto para Reels e apresentação.</p>
          </div>
          <form action={createWebsiteScrollAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="projectId" value={projectId} />
            <select name="assetId" aria-label="Página inteira" className="h-8 max-w-56 bg-surface border border-line text-[12px] text-zinc-300 px-2">
              {tallPages.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label ?? `${a.metadata.device ?? ""} ${a.metadata.pagePath ?? "página inteira"}`.trim()} · {a.width}×{a.height}
                </option>
              ))}
            </select>
            <select name="formatId" aria-label="Formato do vídeo" defaultValue="story-9x16" className="h-8 bg-surface border border-line text-[12px] text-zinc-300 px-2">
              {FORMAT_IDS.map((id) => (
                <option key={id} value={id}>
                  {FORMATS[id].label}
                </option>
              ))}
            </select>
            <button type="submit" className={buttonClass("primary", "sm")}>
              Criar vídeo
            </button>
          </form>
        </section>
      )}

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

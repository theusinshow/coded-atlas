"use client";
import type { StyleTokens } from "@/src/core/creative/tokens";
import { MAX_PAGES, MAX_SLIDES, isMotion, isPresentation, isSequence, type SequenceContent } from "@/src/core/documents/creative-document";
import { addPage, blankArtboard, duplicatePage, movePage, removePage, renamePage, sequenceItems } from "@/src/core/documents/pages";
import { MAX_SCENES, totalDurationMs, type Scene } from "@/src/core/motion/motion";
import { ArtboardPreview } from "@/components/create/artboard-preview";
import { newLayerId } from "./layer-factory";
import { useStudio, useStudioApi } from "./store";

const seconds = (ms: number) => `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;

/**
 * Storyboard de uma sequência: páginas do carrossel ou cenas do vídeo, na ordem de
 * saída. Selecionar, reordenar, duplicar, adicionar em branco e remover — com undo.
 */
export function PageStrip({ tokens, onPlay }: { tokens: StyleTokens; onPlay?: () => void }) {
  const api = useStudioApi();
  const doc = useStudio((s) => s.doc);
  const active = useStudio((s) => s.activePage);
  if (!isSequence(doc)) return null;
  const motion = isMotion(doc);
  const presentation = isPresentation(doc);
  const items = sequenceItems(doc);
  const current = items[active];
  const noun = motion ? "Cena" : presentation ? "Slide" : "Página";
  const limit = motion ? MAX_SCENES : presentation ? MAX_SLIDES : MAX_PAGES;
  const btn = "h-7 px-2 border border-line text-[11px] text-cbm-gray-200 hover:border-cbm-gray-400 hover:text-cbm-white disabled:opacity-30";
  const run = (change: (d: SequenceContent) => SequenceContent, page?: number, key?: string) => api.getState().applyDoc((d) => (isSequence(d) ? change(d) : d), { page, key });
  const blank = (d: SequenceContent) => {
    const source = sequenceItems(d)[active];
    const artboard = blankArtboard(source.artboard);
    if (isPresentation(d)) return addPage(d, { id: newLayerId(), notes: "", artboard }, active);
    if (!isMotion(d)) return addPage(d, { id: newLayerId(), artboard }, active);
    const scene: Scene = { id: newLayerId(), durationMs: 3000, artboard, animations: [], transition: { type: "fade", durationMs: 450 } };
    return addPage(d, scene, active);
  };

  return (
    <section aria-label={motion ? "Cenas do vídeo" : presentation ? "Slides da apresentação" : "Páginas do carrossel"} className="shrink-0 border-t border-line bg-base">
      <div className="flex items-center gap-2 px-3 pt-2">
        {motion && onPlay && (
          <button type="button" onClick={onPlay} className="h-7 px-3 border border-line text-cbm-white text-[11px] font-medium hover:border-cbm-gray-400" aria-label="Tocar vídeo">
            ▶ Tocar
          </button>
        )}
        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-cbm-gray-400">
          {noun} {active + 1}/{items.length}
          {motion && ` · total ${seconds(totalDurationMs(doc))}`}
        </p>
        <input
          aria-label={`Título ${presentation ? "do slide" : `da ${noun.toLowerCase()}`}`}
          value={current?.title ?? ""}
          placeholder={`Título ${presentation ? "do slide" : `da ${noun.toLowerCase()}`}`}
          maxLength={80}
          onChange={(e) => run((d) => renamePage(d, active, e.target.value), undefined, `title:${active}`)}
          className="h-7 w-48 bg-transparent border border-transparent hover:border-line focus:border-accent focus:outline-none px-1.5 text-[12px] text-cbm-gray-200"
        />
        <div className="ml-auto flex gap-1">
          <button type="button" className={btn} disabled={active === 0} onClick={() => run((d) => movePage(d, active, active - 1), active - 1)} title="Mover para a esquerda">
            ←
          </button>
          <button type="button" className={btn} disabled={active === items.length - 1} onClick={() => run((d) => movePage(d, active, active + 1), active + 1)} title="Mover para a direita">
            →
          </button>
          <button type="button" className={btn} disabled={items.length >= limit} onClick={() => run((d) => duplicatePage(d, active, newLayerId), active + 1)}>
            Duplicar
          </button>
          <button type="button" className={btn} disabled={items.length >= limit} onClick={() => run(blank, active + 1)}>
            + {noun}
          </button>
          <button type="button" className={`${btn} hover:!border-bad hover:!text-bad`} disabled={items.length <= 1} onClick={() => run((d) => removePage(d, active), Math.max(0, active - 1))}>
            Remover
          </button>
        </div>
      </div>
      <ol className="flex gap-2 overflow-x-auto px-3 py-2">
        {items.map((item, index) => {
          const width = Math.round((item.artboard.width / item.artboard.height) * 88);
          return (
            <li key={item.id} className="shrink-0">
              <button
                type="button"
                onClick={() => api.getState().setActivePage(index)}
                aria-current={index === active ? "page" : undefined}
                aria-label={`${noun} ${index + 1}${item.title ? `: ${item.title}` : ""}`}
                data-page-thumb={index}
                className={`block border-2 ${index === active ? "border-accent" : "border-transparent hover:border-cbm-gray-600"}`}
                style={{ width }}
              >
                <ArtboardPreview artboard={item.artboard} tokens={tokens} mode="render" />
              </button>
              <p className="mt-1 text-[10px] font-mono text-cbm-gray-400 tabular-nums truncate" style={{ width }}>
                {String(index + 1).padStart(2, "0")} {"durationMs" in item ? seconds(item.durationMs) : (item.title ?? "")}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

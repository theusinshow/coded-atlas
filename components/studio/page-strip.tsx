"use client";
import type { StyleTokens } from "@/src/core/creative/tokens";
import { MAX_PAGES, isCarousel } from "@/src/core/documents/creative-document";
import { addPage, blankArtboard, duplicatePage, movePage, removePage, renamePage } from "@/src/core/documents/pages";
import { ArtboardPreview } from "@/components/create/artboard-preview";
import { newLayerId } from "./layer-factory";
import { useStudio, useStudioApi } from "./store";

/**
 * Storyboard do carrossel: miniaturas das páginas na ordem de saída. Selecionar,
 * reordenar, duplicar, adicionar em branco e remover — tudo com undo.
 */
export function PageStrip({ tokens }: { tokens: StyleTokens }) {
  const api = useStudioApi();
  const doc = useStudio((s) => s.doc);
  const active = useStudio((s) => s.activePage);
  if (!isCarousel(doc)) return null;
  const pages = doc.pages;
  const current = pages[active];
  const btn = "h-7 px-2 border border-line text-[11px] text-zinc-300 hover:border-zinc-500 hover:text-zinc-50 disabled:opacity-30";
  const run = (change: Parameters<ReturnType<typeof api.getState>["applyDoc"]>[0], page?: number) => api.getState().applyDoc(change, page);

  return (
    <section aria-label="Páginas do carrossel" className="shrink-0 border-t border-line bg-base">
      <div className="flex items-center gap-2 px-3 pt-2">
        <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
          Página {active + 1}/{pages.length}
        </p>
        <input
          aria-label="Título da página"
          value={current?.title ?? ""}
          placeholder="Título da página"
          maxLength={80}
          onChange={(e) => run((d) => (isCarousel(d) ? renamePage(d, active, e.target.value) : d))}
          className="h-7 w-48 bg-transparent border border-transparent hover:border-line focus:border-accent focus:outline-none px-1.5 text-[12px] text-zinc-200"
        />
        <div className="ml-auto flex gap-1">
          <button type="button" className={btn} disabled={active === 0} onClick={() => run((d) => (isCarousel(d) ? movePage(d, active, active - 1) : d), active - 1)} title="Mover para a esquerda">
            ←
          </button>
          <button type="button" className={btn} disabled={active === pages.length - 1} onClick={() => run((d) => (isCarousel(d) ? movePage(d, active, active + 1) : d), active + 1)} title="Mover para a direita">
            →
          </button>
          <button type="button" className={btn} disabled={pages.length >= MAX_PAGES} onClick={() => run((d) => (isCarousel(d) ? duplicatePage(d, active, newLayerId) : d), active + 1)}>
            Duplicar
          </button>
          <button
            type="button"
            className={btn}
            disabled={pages.length >= MAX_PAGES}
            onClick={() => run((d) => (isCarousel(d) ? addPage(d, { id: newLayerId(), artboard: blankArtboard(d.pages[active].artboard) }, active) : d), active + 1)}
          >
            + Página
          </button>
          <button type="button" className={`${btn} hover:!border-bad hover:!text-bad`} disabled={pages.length <= 1} onClick={() => run((d) => (isCarousel(d) ? removePage(d, active) : d), Math.max(0, active - 1))}>
            Remover
          </button>
        </div>
      </div>
      <ol className="flex gap-2 overflow-x-auto px-3 py-2">
        {pages.map((page, index) => (
          <li key={page.id} className="shrink-0">
            <button
              type="button"
              onClick={() => api.getState().setActivePage(index)}
              aria-current={index === active ? "page" : undefined}
              aria-label={`Página ${index + 1}${page.title ? `: ${page.title}` : ""}`}
              data-page-thumb={index}
              className={`block border-2 ${index === active ? "border-accent" : "border-transparent hover:border-zinc-600"}`}
              style={{ width: Math.round((page.artboard.width / page.artboard.height) * 88) }}
            >
              <ArtboardPreview artboard={page.artboard} tokens={tokens} mode="render" />
            </button>
            <p className="mt-1 text-[10px] font-mono text-zinc-500 tabular-nums truncate" style={{ width: Math.round((page.artboard.width / page.artboard.height) * 88) }}>
              {String(index + 1).padStart(2, "0")} {page.title ?? ""}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

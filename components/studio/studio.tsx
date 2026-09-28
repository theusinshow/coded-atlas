"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { animateDocumentAction, deleteDocumentAction, listRevisionsAction, renameDocumentAction, renderCanvasAction, restoreRevisionAction, saveCanvasAction } from "@/app/actions/studio";
import { resolveTokens } from "@/src/core/creative/tokens";
import type { VisualProfile } from "@/src/core/creative/visual-profile";
import { isMotion, isSequence, type CanvasContent, type DocumentContent, type RevisionSummary } from "@/src/core/documents/creative-document";
import { duplicateLayer, findLayer, removeLayer, reorderLayer, updateLayer } from "@/src/core/documents/layer-tree";
import { JobFollower } from "@/components/atlas/job-follower";
import type { StudioAsset } from "@/components/create/types";
import { CanvasStage, type Zoom } from "./canvas-stage";
import { Inspector } from "./inspector";
import { newLayerId } from "./layer-factory";
import { AddPanel, LayersPanel } from "./layers-panel";
import { MotionPlayer } from "./motion-player";
import { PageStrip } from "./page-strip";
import { createStudioStore, StudioContext, useStudio, useStudioApi, type SaveState } from "./store";

const AUTOSAVE_MS = 1200;

interface StudioProps {
  documentId: string;
  name: string;
  project: { slug: string; name: string };
  initialContent: DocumentContent;
  initialRevision: number;
  /** Imagens e vídeos do projeto (vídeos só entram em documentos de motion). */
  assets: StudioAsset[];
  audioAssets: StudioAsset[];
  profiles: Record<number, VisualProfile>;
  latestProfileRevision: number | null;
}

export function Studio(props: StudioProps) {
  const [store] = useState(() => createStudioStore({ doc: props.initialContent, revision: props.initialRevision }));
  return (
    <StudioContext.Provider value={store}>
      <StudioShell {...props} />
    </StudioContext.Provider>
  );
}

const SAVE_LABEL: Record<SaveState, { text: string; className: string }> = {
  saved: { text: "Salvo", className: "text-zinc-500" },
  dirty: { text: "Alterado", className: "text-zinc-400" },
  saving: { text: "Salvando…", className: "text-accent" },
  error: { text: "Falha ao salvar", className: "text-bad" },
  conflict: { text: "Conflito", className: "text-bad" },
};

/** Autosave com debounce: grava a revisão; conflito congela a edição até recarregar. */
function useAutosave(documentId: string) {
  const api = useStudioApi();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    const flush = async () => {
      const { doc, revision, saveState, markSaving, markSaved, markError } = api.getState();
      if (saveState !== "dirty" || inFlight) return;
      inFlight = true;
      markSaving();
      const result = await saveCanvasAction(documentId, revision, doc);
      inFlight = false;
      if (result.ok) markSaved(result.revision, doc);
      else markError(result.error, result.conflict);
      if (api.getState().saveState === "dirty") schedule();
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), AUTOSAVE_MS);
    };
    const unsubscribe = api.subscribe((state, prev) => {
      if (state.doc !== prev.doc && state.saveState === "dirty") schedule();
    });
    // Sair com alterações pendentes: o navegador pergunta.
    const beforeUnload = (e: BeforeUnloadEvent) => {
      const s = api.getState().saveState;
      if (s === "dirty" || s === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [api, documentId]);
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

function useShortcuts() {
  const api = useStudioApi();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { selectedId, undo, redo, apply, select, content } = api.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z") {
        if (isTyping(e.target)) return; // desfazer do próprio campo
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && key === "y") {
        if (isTyping(e.target)) return;
        e.preventDefault();
        redo();
        return;
      }
      if (isTyping(e.target)) return;
      if (key === "escape") return select(null);
      if (!selectedId) return;
      const found = findLayer(content.artboard.layers, selectedId);
      if (!found) return;
      const change = (fn: (layers: CanvasContent["artboard"]["layers"]) => CanvasContent["artboard"]["layers"], gesture?: string) =>
        apply((c) => ({ ...c, artboard: { ...c.artboard, layers: fn(c.artboard.layers) } }), gesture);
      if (key === "delete" || key === "backspace") {
        e.preventDefault();
        change((ls) => removeLayer(ls, selectedId));
        select(null);
      } else if (mod && key === "d") {
        e.preventDefault();
        const { layers, newId } = duplicateLayer(content.artboard.layers, selectedId, newLayerId);
        change(() => layers);
        if (newId) select(newId);
      } else if (mod && (e.key === "]" || e.key === "[")) {
        e.preventDefault();
        const forward = e.key === "]";
        change((ls) => reorderLayer(ls, selectedId, e.shiftKey ? (forward ? "front" : "back") : forward ? "forward" : "backward"));
      } else if (key.startsWith("arrow") && !found.layer.locked) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = key === "arrowleft" ? -step : key === "arrowright" ? step : 0;
        const dy = key === "arrowup" ? -step : key === "arrowdown" ? step : 0;
        change((ls) => updateLayer(ls, selectedId, { x: found.layer.x + dx, y: found.layer.y + dy }), `nudge:${selectedId}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [api]);
}

function RevisionsMenu({ documentId, onClose }: { documentId: string; onClose: () => void }) {
  const api = useStudioApi();
  const current = useStudio((s) => s.revision);
  const [revisions, setRevisions] = useState<RevisionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    void listRevisionsAction(documentId).then((r) => (r.ok ? setRevisions(r.revisions) : setError(r.error)));
  }, [documentId]);
  const ORIGIN: Record<RevisionSummary["origin"], string> = { create: "criação", edit: "edição", restore: "restauração" };
  return (
    <div className="absolute right-0 top-full mt-1 w-80 max-h-96 overflow-y-auto border border-line bg-surface shadow-2xl z-20" role="dialog" aria-label="Revisões">
      <div className="flex items-center justify-between px-3 py-2 border-b border-line">
        <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Revisões</p>
        <button type="button" onClick={onClose} className="text-[11px] text-zinc-500 hover:text-zinc-200">
          Fechar
        </button>
      </div>
      {error && <p className="px-3 py-2 text-[12px] text-bad">{error}</p>}
      {!revisions && !error && <p className="px-3 py-3 text-[12px] text-zinc-500">Carregando…</p>}
      <ul>
        {revisions?.map((r) => (
          <li key={r.revision} className="flex items-center gap-2 px-3 py-2 border-b border-line/60 text-[12px]">
            <span className="font-mono text-zinc-300 w-12">rev {r.revision}</span>
            <span className="flex-1 text-zinc-500">
              {ORIGIN[r.origin]} · {new Date(r.updatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
              {r.pinned && <span className="text-accent"> · renderizada</span>}
            </span>
            {r.revision === current ? (
              <span className="text-[10px] font-mono uppercase text-zinc-600">atual</span>
            ) : (
              <button
                type="button"
                disabled={pending}
                className="text-[11px] text-accent hover:text-accent-bright disabled:opacity-40"
                onClick={() =>
                  start(async () => {
                    const result = await restoreRevisionAction(documentId, r.revision);
                    if (!result.ok || !result.content) return setError(result.ok ? "Revisão sem conteúdo." : result.error);
                    api.getState().reset(result.content, result.revision);
                    onClose();
                  })
                }
              >
                Restaurar
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

type OutFormat = "png" | "jpg" | "webp" | "mp4" | "webm";

function RenderMenu({ documentId, onJob, motion }: { documentId: string; onJob: (id: string) => void; motion: boolean }) {
  const api = useStudioApi();
  const [formats, setFormats] = useState<OutFormat[]>(motion ? ["mp4"] : ["png"]);
  const [quality, setQuality] = useState<"preview" | "final">("final");
  const options: OutFormat[] = motion ? ["mp4", "webm", "png"] : ["png", "jpg", "webp"];
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="absolute right-0 top-full mt-1 w-64 border border-line bg-surface shadow-2xl z-20 p-3 space-y-3" role="dialog" aria-label="Renderizar">
      <p className="text-[11px] text-zinc-400">
        {motion ? "Salva e gera o vídeo desta revisão quadro a quadro (PNG = um pôster por cena)." : "Salva e renderiza exatamente esta revisão."} A peça aparece em Publicar.
      </p>
      <div className="flex gap-3">
        {options.map((f) => (
          <label key={f} className="flex items-center gap-1.5 text-[12px] font-mono uppercase text-zinc-300">
            <input type="checkbox" checked={formats.includes(f)} onChange={(e) => setFormats((cur) => (e.target.checked ? [...cur, f] : cur.filter((x) => x !== f)))} />
            {f}
          </label>
        ))}
      </div>
      {motion && (
        <div role="radiogroup" aria-label="Qualidade do vídeo" className="flex border border-line">
          {(
            [
              ["preview", "Preview rápido"],
              ["final", "Final"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={quality === id} onClick={() => setQuality(id)} className={`flex-1 h-7 text-[11px] ${quality === id ? "bg-surface-2 text-accent-bright" : "text-zinc-400"}`}>
              {label}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        disabled={pending || formats.length === 0}
        className="w-full h-8 bg-accent text-zinc-950 text-[12px] font-medium hover:bg-accent-bright disabled:opacity-40"
        onClick={() =>
          start(async () => {
            setError(null);
            const { doc, revision, markSaved, markError } = api.getState();
            const result = await renderCanvasAction(documentId, revision, doc, formats, quality);
            if (!result.ok) {
              setError(result.error);
              if (result.conflict) markError(result.error, true);
              return;
            }
            markSaved(result.revision, doc);
            if (result.jobId) onJob(result.jobId);
          })
        }
      >
        Renderizar agora
      </button>
      {error && <p className="text-[12px] text-bad">{error}</p>}
    </div>
  );
}

function StudioShell({ documentId, name: initialName, project, assets: allAssets, audioAssets, profiles, latestProfileRevision }: StudioProps) {
  const api = useStudioApi();
  const style = useStudio((s) => s.content.style);
  const saveState = useStudio((s) => s.saveState);
  const saveError = useStudio((s) => s.saveError);
  const revision = useStudio((s) => s.revision);
  const canUndo = useStudio((s) => s.past.length > 0);
  const canRedo = useStudio((s) => s.future.length > 0);
  const sequence = useStudio((s) => isSequence(s.doc));
  const doc = useStudio((s) => s.doc);
  const motion = isMotion(doc) ? doc : null;
  // Vídeo (movimento capturado) só entra em documentos de motion.
  const assets = useMemo(() => (motion ? allAssets : allAssets.filter((a) => a.mimeType.startsWith("image/"))), [allAssets, motion]);
  const videos = useMemo(() => new Set(allAssets.filter((a) => a.mimeType.startsWith("video/")).map((a) => a.id as string)), [allAssets]);
  const activePage = useStudio((s) => s.activePage);
  const [playing, setPlaying] = useState(false);
  const [animating, startAnimate] = useTransition();
  const [tab, setTab] = useState<"layers" | "add">("layers");
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [fitScale, setFitScale] = useState(0.3);
  const [menu, setMenu] = useState<"revisions" | "render" | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [name, setName] = useState(initialName);
  const [, startDelete] = useTransition();
  useAutosave(documentId);
  useShortcuts();
  const onFit = useCallback((s: number) => setFitScale(s), []);

  const profile = style.profileRevision ? (profiles[style.profileRevision] ?? null) : null;
  const tokens = useMemo(() => resolveTokens(profile, style.mode, style.primary ? { primary: style.primary } : {}), [profile, style.mode, style.primary]);
  const scale = zoom === "fit" ? fitScale : zoom;
  const label = SAVE_LABEL[saveState];
  const btn = "h-8 px-3 border border-line text-[12px] text-zinc-300 hover:border-zinc-500 hover:text-zinc-50 disabled:opacity-30 disabled:hover:border-line";

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-base text-zinc-100" data-studio>
      <header className="h-12 shrink-0 flex items-center gap-3 border-b border-line px-3">
        <Link href={`/projects/${project.slug}/create`} className="text-[12px] text-zinc-500 hover:text-zinc-100 whitespace-nowrap">
          ← {project.name}
        </Link>
        <span className="text-zinc-700">/</span>
        <input
          aria-label="Nome do documento"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const trimmed = name.trim();
            if (!trimmed) return setName(initialName);
            if (trimmed !== initialName) void renameDocumentAction(documentId, trimmed);
          }}
          className="min-w-0 w-64 bg-transparent text-[13px] text-zinc-100 px-1.5 h-8 border border-transparent hover:border-line focus:border-accent focus:outline-none"
        />
        <span className={`text-[11px] font-mono whitespace-nowrap ${label.className}`} title={saveError ?? undefined} data-save-state={saveState}>
          {label.text} · rev {revision}
        </span>
        {saveState === "conflict" && (
          <button type="button" className="text-[11px] text-accent" onClick={() => window.location.reload()}>
            Recarregar
          </button>
        )}
        {saveState === "error" && saveError && <span className="text-[11px] text-bad truncate max-w-64">{saveError}</span>}

        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" className={btn} disabled={!canUndo} onClick={() => api.getState().undo()} title="Desfazer (Ctrl+Z)" aria-label="Desfazer">
            ↶
          </button>
          <button type="button" className={btn} disabled={!canRedo} onClick={() => api.getState().redo()} title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer">
            ↷
          </button>
          <select
            aria-label="Zoom"
            value={zoom === "fit" ? "fit" : String(zoom)}
            onChange={(e) => setZoom(e.target.value === "fit" ? "fit" : Number(e.target.value))}
            className="h-8 bg-surface border border-line text-[12px] text-zinc-300 px-2"
          >
            <option value="fit">Ajustar ({Math.round(fitScale * 100)}%)</option>
            {[0.25, 0.5, 0.75, 1].map((z) => (
              <option key={z} value={z}>
                {Math.round(z * 100)}%
              </option>
            ))}
          </select>
          {!motion && (
            <button
              type="button"
              className={btn}
              disabled={animating}
              title="Cria um vídeo a partir deste documento (cada página vira uma cena animada)"
              onClick={() => startAnimate(async () => void (await animateDocumentAction(documentId)))}
            >
              Animar
            </button>
          )}
          <div className="relative">
            <button type="button" className={btn} onClick={() => setMenu((m) => (m === "revisions" ? null : "revisions"))} aria-expanded={menu === "revisions"}>
              Revisões
            </button>
            {menu === "revisions" && <RevisionsMenu documentId={documentId} onClose={() => setMenu(null)} />}
          </div>
          <button
            type="button"
            className={`${btn} hover:!border-bad hover:!text-bad`}
            onClick={() => {
              if (!window.confirm("Excluir este documento e todas as revisões? As peças já renderizadas continuam em Publicar.")) return;
              startDelete(async () => void (await deleteDocumentAction(documentId)));
            }}
          >
            Excluir
          </button>
          <div className="relative">
            <button
              type="button"
              className="h-8 px-4 bg-accent text-zinc-950 text-[12px] font-medium hover:bg-accent-bright"
              onClick={() => setMenu((m) => (m === "render" ? null : "render"))}
              aria-expanded={menu === "render"}
            >
              Renderizar
            </button>
            {menu === "render" && (
              <RenderMenu
                motion={!!motion}
                documentId={documentId}
                onJob={(id) => {
                  setJobId(id);
                  setMenu(null);
                }}
              />
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-64 shrink-0 border-r border-line flex flex-col min-h-0" aria-label="Camadas e material">
          <div role="tablist" className="flex border-b border-line">
            {(
              [
                ["layers", "Camadas"],
                ["add", "Adicionar"],
              ] as const
            ).map(([id, text]) => (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`flex-1 h-10 text-[12px] ${tab === id ? "text-accent-bright border-b-2 border-accent -mb-px" : "text-zinc-400 hover:text-zinc-100"}`}
              >
                {text}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">{tab === "layers" ? <LayersPanel /> : <AddPanel assets={assets} />}</div>
        </aside>

        <main className="flex-1 min-w-0 relative flex flex-col">
          <div className="flex-1 min-h-0 relative">
            <CanvasStage tokens={tokens} zoom={zoom} onFit={onFit} videos={videos} />
          </div>
          {motion && playing && (
            <MotionPlayer
              content={motion}
              tokens={tokens}
              videos={videos}
              audioSrc={motion.audio ? `/api/atlas/assets/${motion.audio.assetId}/file` : null}
              audioVolume={motion.audio?.volume ?? 1}
              startScene={activePage}
              onClose={(scene) => {
                setPlaying(false);
                api.getState().setActivePage(scene);
              }}
            />
          )}
          {sequence && <PageStrip tokens={tokens} onPlay={motion ? () => setPlaying(true) : undefined} />}
          {jobId && (
            <div className="absolute right-4 bottom-4 w-80 space-y-2">
              <JobFollower key={jobId} jobId={jobId} />
              <div className="flex justify-between text-[11px]">
                <Link href={`/projects/${project.slug}/publish`} className="text-accent hover:text-accent-bright">
                  Ver em Publicar →
                </Link>
                <button type="button" className="text-zinc-500 hover:text-zinc-200" onClick={() => setJobId(null)}>
                  Fechar
                </button>
              </div>
            </div>
          )}
          <p className="pointer-events-none absolute right-3 top-3 text-[10px] font-mono text-zinc-600">{Math.round(scale * 100)}%</p>
        </main>

        <aside className="w-80 shrink-0 border-l border-line overflow-y-auto" aria-label="Inspetor">
          <Inspector tokens={tokens} assets={assets} audioAssets={audioAssets} profiles={profiles} latestRevision={latestProfileRevision} />
        </aside>
      </div>
    </div>
  );
}

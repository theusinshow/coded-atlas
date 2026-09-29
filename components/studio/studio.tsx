"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ChevronLeft, MoreHorizontal, Redo2, Trash2, Undo2, X } from "lucide-react";
import { animateDocumentAction, deleteDocumentAction, listRevisionsAction, renameDocumentAction, renderCanvasAction, restoreRevisionAction, saveCanvasAction } from "@/app/actions/studio";
import { resolveTokens } from "@/src/core/creative/tokens";
import type { VisualProfile } from "@/src/core/creative/visual-profile";
import { isMotion, isSequence, kindOf, type CanvasContent, type DocumentContent, type DocumentKind, type RevisionSummary } from "@/src/core/documents/creative-document";
import { duplicateLayer, findLayer, removeLayer, reorderLayer, updateLayer } from "@/src/core/documents/layer-tree";
import { JobFollower } from "@/components/atlas/job-follower";
import { ArtboardPreview } from "@/components/create/artboard-preview";
import type { StudioAsset } from "@/components/create/types";
import { buttonClass } from "@/components/ui/primitives";
import { DURATION, EASE_OUT } from "@/components/ui/motion";
import { CanvasStage, type Zoom } from "./canvas-stage";
import { DesktopOnlyNotice, useDismiss, useIsDesktop } from "./desktop-only";
import { Inspector } from "./inspector";
import { newLayerId } from "./layer-factory";
import { AddPanel, LayersPanel } from "./layers-panel";
import { MotionPlayer } from "./motion-player";
import { PageStrip } from "./page-strip";
import { SaveIndicator } from "./save-indicator";
import { createStudioStore, StudioContext, useStudio, useStudioApi } from "./store";

const AUTOSAVE_MS = 1200;

interface StudioProps {
  documentId: string;
  name: string;
  project: { id: string; slug: string; name: string };
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
  const desktop = useIsDesktop();
  return (
    <StudioContext.Provider value={store}>
      {/* Abaixo de 1024 px não há canvas utilizável: aviso + prévia só de leitura. */}
      <DesktopOnlyNotice title="Studio" backHref={`/projects/${props.project.slug}/create`} className="lg:hidden" preview={<StudioReadOnlyPreview profiles={props.profiles} />} />
      {desktop && <StudioShell {...props} />}
    </StudioContext.Provider>
  );
}

/** Tokens do estilo do documento (identidade congelada + modo + cor de destaque). */
function useDocumentTokens(profiles: Record<number, VisualProfile>) {
  const style = useStudio((s) => s.content.style);
  const profile = style.profileRevision ? (profiles[style.profileRevision] ?? null) : null;
  return useMemo(() => resolveTokens(profile, style.mode, style.primary ? { primary: style.primary } : {}), [profile, style.mode, style.primary]);
}

function StudioReadOnlyPreview({ profiles }: { profiles: Record<number, VisualProfile> }) {
  const artboard = useStudio((s) => s.content.artboard);
  const tokens = useDocumentTokens(profiles);
  return <ArtboardPreview artboard={artboard} tokens={tokens} mode="render" />;
}

/** Entrada/saída dos menus do cabeçalho: presença curta, sem deslocamento grande. */
const MENU_MOTION = {
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0, transition: { duration: DURATION.instant, ease: EASE_OUT } },
  exit: { opacity: 0, y: -2, transition: { duration: 0.1, ease: "easeIn" as const } },
};
const MENU_PANEL = "absolute right-0 top-full mt-1 border border-line bg-surface z-20";

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
  const ORIGIN: Record<RevisionSummary["origin"], string> = { create: "Criação", edit: "Edição", restore: "Restauração" };
  return (
    <motion.div {...MENU_MOTION} className={`${MENU_PANEL} w-80 max-h-96 overflow-y-auto`} role="dialog" aria-label="Revisões">
      <div className="flex items-center justify-between px-3 py-2 border-b border-line">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-cbm-gray-400">Revisões</p>
        <button type="button" onClick={onClose} aria-label="Fechar revisões" className="grid h-7 w-7 place-items-center text-cbm-gray-400 hover:text-cbm-white">
          <X size={14} aria-hidden />
        </button>
      </div>
      {error && <p className="px-3 py-2 text-[12px] text-bad">{error}</p>}
      {!revisions && !error && <p className="px-3 py-3 text-[12px] text-cbm-gray-400">Carregando…</p>}
      <ul>
        {revisions?.map((r) => (
          <li key={r.revision} className="flex items-center gap-2 px-3 py-2 border-b border-line/60 text-[12px]">
            <span className="w-8 text-cbm-gray-200 tabular-nums">{r.revision}</span>
            <span className="flex-1 text-cbm-gray-400">
              {ORIGIN[r.origin]} · {new Date(r.updatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
              {r.pinned && <span className="text-cbm-gray-200"> · renderizada</span>}
            </span>
            {r.revision === current ? (
              <span className="text-[12px] text-cbm-gray-400">Atual</span>
            ) : (
              <button
                type="button"
                disabled={pending}
                className="text-[12px] text-accent hover:text-accent-bright disabled:opacity-40"
                onClick={() =>
                  start(async () => {
                    const result = await restoreRevisionAction(documentId, r.revision);
                    if (!result.ok || !result.content) return setError(result.ok ? "Essa versão está vazia." : result.error);
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
    </motion.div>
  );
}

type OutFormat = "png" | "jpg" | "webp" | "mp4" | "webm" | "pdf" | "pptx";

const RENDER_OPTIONS: Record<DocumentKind, { options: OutFormat[]; initial: OutFormat[]; hint: string }> = {
  canvas: { options: ["png", "jpg", "webp", "pdf"], initial: ["png"], hint: "Salva e renderiza a versão atual." },
  carousel: { options: ["png", "jpg", "webp", "pdf"], initial: ["png"], hint: "Uma imagem por página; o PDF junta todas (carrossel do LinkedIn)." },
  motion: { options: ["mp4", "webm", "png"], initial: ["mp4"], hint: "Salva e gera o vídeo. PNG sai como uma capa por cena." },
  presentation: { options: ["pdf", "pptx", "png"], initial: ["pdf"], hint: "Um slide por página. O PPTX leva as notas do apresentador." },
  case: { options: ["pdf", "png"], initial: ["pdf"], hint: "Página web, PDF e módulos." },
};

function RenderMenu({ documentId, onJob, kind }: { documentId: string; onJob: (id: string) => void; kind: DocumentKind }) {
  const api = useStudioApi();
  const motionDoc = kind === "motion";
  const [formats, setFormats] = useState<OutFormat[]>(RENDER_OPTIONS[kind].initial);
  const [quality, setQuality] = useState<"preview" | "final">("final");
  const options = RENDER_OPTIONS[kind].options;
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <motion.div {...MENU_MOTION} className={`${MENU_PANEL} w-72 p-3 space-y-3`} role="dialog" aria-label="Renderizar">
      <p className="text-[12px] text-cbm-gray-400">{RENDER_OPTIONS[kind].hint} A peça aparece em Entregar.</p>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {options.map((f) => (
          <label key={f} className="flex h-7 items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.12em] text-cbm-gray-200 cursor-pointer">
            <input type="checkbox" checked={formats.includes(f)} onChange={(e) => setFormats((cur) => (e.target.checked ? [...cur, f] : cur.filter((x) => x !== f)))} />
            {f}
          </label>
        ))}
      </div>
      {motionDoc && (
        <div role="radiogroup" aria-label="Qualidade do vídeo" className="flex border border-line">
          {(
            [
              ["preview", "Prévia rápida"],
              ["final", "Final"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={quality === id} onClick={() => setQuality(id)} className={`flex-1 h-8 text-[12px] transition-colors ${quality === id ? "bg-surface-2 text-cbm-white" : "text-cbm-gray-400 hover:text-cbm-gray-100"}`}>
              {label}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        disabled={pending || formats.length === 0}
        className={`${buttonClass("primary", "sm")} w-full`}
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
      {error && (
        <p role="alert" className="text-[12px] text-bad">
          {error}
        </p>
      )}
    </motion.div>
  );
}

/** Ações raras (e a destrutiva) longe do Renderizar. */
function MoreMenu({ projectSlug, onDelete, onClose }: { projectSlug: string; onDelete: () => void; onClose: () => void }) {
  const item = "flex h-9 w-full items-center gap-2 px-3 text-left text-[13px] transition-colors";
  return (
    <motion.div {...MENU_MOTION} className={`${MENU_PANEL} w-56 py-1`} role="menu" aria-label="Mais ações">
      <Link href={`/projects/${projectSlug}/publish`} role="menuitem" onClick={onClose} className={`${item} text-cbm-gray-200 hover:bg-surface-2 hover:text-cbm-white`}>
        <ArrowRight size={14} aria-hidden />
        Ver peças em Entregar
      </Link>
      <div className="my-1 border-t border-line" role="separator" />
      <button
        type="button"
        role="menuitem"
        className={`${item} text-cbm-gray-200 hover:bg-surface-2 hover:text-bad`}
        onClick={() => {
          onClose();
          onDelete();
        }}
      >
        <Trash2 size={14} aria-hidden />
        Excluir documento
      </button>
    </motion.div>
  );
}

type Menu = "revisions" | "render" | "more";

function StudioShell({ documentId, name: initialName, project, assets: allAssets, audioAssets, profiles, latestProfileRevision }: StudioProps) {
  const api = useStudioApi();
  const saveState = useStudio((s) => s.saveState);
  const saveError = useStudio((s) => s.saveError);
  const revision = useStudio((s) => s.revision);
  const canUndo = useStudio((s) => s.past.length > 0);
  const canRedo = useStudio((s) => s.future.length > 0);
  const sequence = useStudio((s) => isSequence(s.doc));
  const doc = useStudio((s) => s.doc);
  const motionDoc = isMotion(doc) ? doc : null;
  // Vídeo (movimento capturado) só entra em documentos de motion.
  const assets = useMemo(() => (motionDoc ? allAssets : allAssets.filter((a) => a.mimeType.startsWith("image/"))), [allAssets, motionDoc]);
  const videos = useMemo(() => new Set(allAssets.filter((a) => a.mimeType.startsWith("video/")).map((a) => a.id as string)), [allAssets]);
  const activePage = useStudio((s) => s.activePage);
  const [playing, setPlaying] = useState(false);
  const [animating, startAnimate] = useTransition();
  const [tab, setTab] = useState<"layers" | "add">("layers");
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [fitScale, setFitScale] = useState(0.3);
  const [menu, setMenu] = useState<Menu | null>(null);
  const menusRef = useRef<HTMLDivElement>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [name, setName] = useState(initialName);
  const [, startDelete] = useTransition();
  useAutosave(documentId);
  useShortcuts();
  useDismiss(menusRef, menu !== null, () => setMenu(null));
  const onFit = useCallback((s: number) => setFitScale(s), []);
  const toggleMenu = (id: Menu) => setMenu((m) => (m === id ? null : id));

  const tokens = useDocumentTokens(profiles);
  const btn =
    "inline-flex h-8 items-center justify-center gap-1.5 px-3 border border-line text-[12px] text-cbm-gray-200 transition-colors hover:border-cbm-gray-400 hover:text-cbm-white disabled:opacity-30 disabled:hover:border-line";
  const iconBtn = `${btn} w-8 !px-0`;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-base text-cbm-gray-100 max-lg:hidden" data-studio>
      <header className="h-12 shrink-0 flex items-center gap-3 border-b border-line px-3">
        <Link href={`/projects/${project.slug}/create`} className="flex min-w-0 max-w-[12rem] items-center gap-1 text-[12px] text-cbm-gray-400 hover:text-cbm-white" title={`Voltar a ${project.name}`}>
          <ChevronLeft size={14} className="shrink-0" aria-hidden />
          <span className="truncate">{project.name}</span>
        </Link>
        <span className="text-cbm-gray-600" aria-hidden>
          /
        </span>
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
          className="min-w-0 w-40 xl:w-80 bg-transparent text-[13px] text-cbm-gray-100 px-1.5 h-8 border border-transparent hover:border-line focus:border-accent focus:outline-none"
        />
        <SaveIndicator state={saveState} revision={revision} error={saveError} />
        {saveState === "conflict" && (
          <button type="button" className="text-[12px] text-accent hover:text-accent-bright" onClick={() => window.location.reload()}>
            Recarregar
          </button>
        )}
        {saveState === "error" && saveError && <span className="text-[12px] text-bad truncate max-w-64">{saveError}</span>}

        <div className="ml-auto flex items-center gap-1.5" ref={menusRef}>
          <button type="button" className={iconBtn} disabled={!canUndo} onClick={() => api.getState().undo()} title="Desfazer (Ctrl+Z)" aria-label="Desfazer">
            <Undo2 size={14} aria-hidden />
          </button>
          <button type="button" className={iconBtn} disabled={!canRedo} onClick={() => api.getState().redo()} title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer">
            <Redo2 size={14} aria-hidden />
          </button>
          {/* A única leitura de zoom da tela. */}
          <select
            aria-label="Zoom"
            value={zoom === "fit" ? "fit" : String(zoom)}
            onChange={(e) => setZoom(e.target.value === "fit" ? "fit" : Number(e.target.value))}
            className="h-8 bg-surface border border-line text-[12px] text-cbm-gray-200 px-2 tabular-nums"
          >
            <option value="fit">Ajustar · {Math.round(fitScale * 100)}%</option>
            {[0.25, 0.5, 0.75, 1].map((z) => (
              <option key={z} value={z}>
                {Math.round(z * 100)}%
              </option>
            ))}
          </select>
          {!motionDoc && (
            <button
              type="button"
              className={btn}
              disabled={animating}
              title="Cria um vídeo a partir deste documento: cada página vira uma cena animada"
              onClick={() => startAnimate(async () => void (await animateDocumentAction(documentId)))}
            >
              Animar
            </button>
          )}
          <div className="relative">
            <button type="button" className={btn} onClick={() => toggleMenu("revisions")} aria-expanded={menu === "revisions"}>
              Revisões
            </button>
            <AnimatePresence>{menu === "revisions" && <RevisionsMenu documentId={documentId} onClose={() => setMenu(null)} />}</AnimatePresence>
          </div>
          <div className="relative">
            <button type="button" className={iconBtn} onClick={() => toggleMenu("more")} aria-expanded={menu === "more"} aria-haspopup="menu" aria-label="Mais ações" title="Mais ações">
              <MoreHorizontal size={16} aria-hidden />
            </button>
            <AnimatePresence>
              {menu === "more" && (
                <MoreMenu
                  projectSlug={project.slug}
                  onClose={() => setMenu(null)}
                  onDelete={() => {
                    if (!window.confirm("Excluir este documento e todas as versões dele? As peças já renderizadas continuam em Entregar.")) return;
                    startDelete(async () => void (await deleteDocumentAction(documentId)));
                  }}
                />
              )}
            </AnimatePresence>
          </div>
          <div className="relative ml-2">
            <button type="button" className={buttonClass("primary", "sm")} onClick={() => toggleMenu("render")} aria-expanded={menu === "render"}>
              Renderizar
            </button>
            <AnimatePresence>
              {menu === "render" && (
                <RenderMenu
                  kind={kindOf(doc)}
                  documentId={documentId}
                  onJob={(id) => {
                    setJobId(id);
                    setMenu(null);
                  }}
                />
              )}
            </AnimatePresence>
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
                className={`relative flex-1 h-10 text-[12px] transition-colors ${tab === id ? "text-cbm-white" : "text-cbm-gray-400 hover:text-cbm-gray-100"}`}
              >
                {text}
                {tab === id && <motion.span layoutId="studio-left-tab" className="absolute inset-x-0 -bottom-px h-0.5 bg-cbm-white" transition={{ duration: DURATION.quick, ease: EASE_OUT }} />}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">{tab === "layers" ? <LayersPanel /> : <AddPanel assets={assets} />}</div>
        </aside>

        <main className="flex-1 min-w-0 relative flex flex-col">
          <div className="flex-1 min-h-0 relative">
            <CanvasStage tokens={tokens} zoom={zoom} onFit={onFit} videos={videos} />
          </div>
          {motionDoc && playing && (
            <MotionPlayer
              content={motionDoc}
              tokens={tokens}
              videos={videos}
              audioSrc={motionDoc.audio ? `/api/atlas/assets/${motionDoc.audio.assetId}/file` : null}
              audioVolume={motionDoc.audio?.volume ?? 1}
              startScene={activePage}
              onClose={(scene) => {
                setPlaying(false);
                api.getState().setActivePage(scene);
              }}
            />
          )}
          {sequence && <PageStrip tokens={tokens} onPlay={motionDoc ? () => setPlaying(true) : undefined} />}
          <AnimatePresence>
            {jobId && (
              <motion.div
                key={jobId}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0, transition: { duration: DURATION.quick, ease: EASE_OUT } }}
                exit={{ opacity: 0, transition: { duration: DURATION.instant, ease: "easeIn" } }}
                className="absolute right-4 bottom-4 z-10 w-80 space-y-2 border border-line bg-base p-2"
              >
                <JobFollower jobId={jobId} />
                <div className="flex items-center justify-between text-[12px]">
                  <Link href={`/projects/${project.slug}/publish`} className="inline-flex items-center gap-1 text-accent hover:text-accent-bright">
                    Ver em Entregar
                    <ArrowRight size={14} aria-hidden />
                  </Link>
                  <button type="button" className="h-7 px-2 text-cbm-gray-400 hover:text-cbm-white" onClick={() => setJobId(null)}>
                    Fechar
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <aside className="w-80 shrink-0 border-l border-line overflow-y-auto" aria-label="Inspetor">
          <Inspector tokens={tokens} assets={assets} audioAssets={audioAssets} profiles={profiles} latestRevision={latestProfileRevision} projectId={project.id} />
        </aside>
      </div>
    </div>
  );
}

"use client";
import { createContext, useContext } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import { isCarousel, type CanvasContent, type DocumentContent } from "@/src/core/documents/creative-document";

/**
 * Estado EFÊMERO do editor (docs/STACK.md: Zustand só para UI). A verdade
 * persistente é a revisão no SQLite — o autosave empurra `doc` para lá.
 *
 * `doc` é o documento inteiro (canvas ou carrossel). `content` é a VISTA da página
 * ativa no formato de canvas ({ artboard, style, formatId }): canvas, camadas e
 * inspetor editam só a vista, e `apply` devolve a mudança para a página certa.
 */
export type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

const HISTORY_LIMIT = 100;
/** Mudanças com a mesma chave dentro desta janela viram UM passo de undo (arrasto, digitação). */
const GESTURE_MS = 800;

function viewOf(doc: DocumentContent, page: number): CanvasContent {
  if (!isCarousel(doc)) return doc;
  const current = doc.pages[Math.min(page, doc.pages.length - 1)];
  return { artboard: current.artboard, style: doc.style, formatId: doc.formatId };
}

function writeBack(doc: DocumentContent, page: number, view: CanvasContent): DocumentContent {
  if (!isCarousel(doc)) return view;
  return { ...doc, style: view.style, formatId: view.formatId, pages: doc.pages.map((p, i) => (i === page ? { ...p, artboard: view.artboard } : p)) };
}

const clampPage = (doc: DocumentContent, page: number) => (isCarousel(doc) ? Math.min(Math.max(page, 0), doc.pages.length - 1) : 0);

export interface StudioState {
  doc: DocumentContent;
  activePage: number;
  /** Vista da página ativa (sempre em sincronia com `doc`). */
  content: CanvasContent;
  selectedId: string | null;
  past: { doc: DocumentContent; page: number }[];
  future: { doc: DocumentContent; page: number }[];
  lastKey: string | null;
  lastAt: number;
  revision: number;
  saveState: SaveState;
  saveError: string | null;
  /** Incrementado para pedir foco no campo de texto do inspetor (duplo clique no canvas). */
  focusTextNonce: number;
  select(id: string | null): void;
  /** Aplica uma mudança à página ativa; `key` agrupa mudanças contínuas num passo de undo. */
  apply(change: (content: CanvasContent) => CanvasContent, key?: string): void;
  /** Mudança no documento inteiro (páginas do carrossel); `page` = página ativa depois. */
  applyDoc(change: (doc: DocumentContent) => DocumentContent, page?: number): void;
  setActivePage(page: number): void;
  undo(): void;
  redo(): void;
  requestTextFocus(): void;
  markSaving(): void;
  markSaved(revision: number, savedDoc: DocumentContent): void;
  markError(message: string, conflict?: boolean): void;
  /** Substitui o documento inteiro (restaurar revisão) sem histórico local. */
  reset(doc: DocumentContent, revision: number): void;
}

export function createStudioStore(initial: { doc: DocumentContent; revision: number }): StoreApi<StudioState> {
  return createStore<StudioState>()((set, get) => {
    const commit = (doc: DocumentContent, page: number, key?: string) => {
      const state = get();
      const now = Date.now();
      const sameGesture = key !== undefined && key === state.lastKey && now - state.lastAt < GESTURE_MS;
      const nextPage = clampPage(doc, page);
      set({
        doc,
        activePage: nextPage,
        content: viewOf(doc, nextPage),
        past: sameGesture ? state.past : [...state.past, { doc: state.doc, page: state.activePage }].slice(-HISTORY_LIMIT),
        future: [],
        lastKey: key ?? null,
        lastAt: now,
        saveState: "dirty",
      });
    };
    return {
      doc: initial.doc,
      activePage: 0,
      content: viewOf(initial.doc, 0),
      selectedId: null,
      past: [],
      future: [],
      lastKey: null,
      lastAt: 0,
      revision: initial.revision,
      saveState: "saved",
      saveError: null,
      focusTextNonce: 0,
      select: (id) => set({ selectedId: id, lastKey: null }),
      apply: (change, key) => {
        const state = get();
        if (state.saveState === "conflict") return;
        const next = change(state.content);
        if (next === state.content) return;
        commit(writeBack(state.doc, state.activePage, next), state.activePage, key);
      },
      applyDoc: (change, page) => {
        const state = get();
        if (state.saveState === "conflict") return;
        const next = change(state.doc);
        if (next === state.doc) return;
        commit(next, page ?? state.activePage);
        set({ selectedId: null });
      },
      setActivePage: (page) => {
        const { doc } = get();
        const next = clampPage(doc, page);
        set({ activePage: next, content: viewOf(doc, next), selectedId: null, lastKey: null });
      },
      undo: () => {
        const { past, doc, activePage, future } = get();
        const previous = past.at(-1);
        if (!previous) return;
        const page = clampPage(previous.doc, previous.page);
        set({ doc: previous.doc, activePage: page, content: viewOf(previous.doc, page), past: past.slice(0, -1), future: [{ doc, page: activePage }, ...future], lastKey: null, saveState: "dirty" });
      },
      redo: () => {
        const { past, doc, activePage, future } = get();
        const [next, ...rest] = future;
        if (!next) return;
        const page = clampPage(next.doc, next.page);
        set({ doc: next.doc, activePage: page, content: viewOf(next.doc, page), past: [...past, { doc, page: activePage }], future: rest, lastKey: null, saveState: "dirty" });
      },
      requestTextFocus: () => set((s) => ({ focusTextNonce: s.focusTextNonce + 1 })),
      markSaving: () => set({ saveState: "saving", saveError: null }),
      // Só volta a "saved" se nada mudou enquanto salvava.
      markSaved: (revision, savedDoc) => set((s) => ({ revision, saveState: s.doc === savedDoc ? "saved" : "dirty", saveError: null })),
      markError: (message, conflict = false) => set({ saveState: conflict ? "conflict" : "error", saveError: message }),
      reset: (doc, revision) => set({ doc, activePage: 0, content: viewOf(doc, 0), revision, past: [], future: [], lastKey: null, saveState: "saved", saveError: null, selectedId: null }),
    };
  });
}

export const StudioContext = createContext<StoreApi<StudioState> | null>(null);

export function useStudio<T>(selector: (state: StudioState) => T): T {
  const store = useContext(StudioContext);
  if (!store) throw new Error("useStudio fora do StudioContext");
  return useStore(store, selector);
}

export function useStudioApi(): StoreApi<StudioState> {
  const store = useContext(StudioContext);
  if (!store) throw new Error("useStudioApi fora do StudioContext");
  return store;
}

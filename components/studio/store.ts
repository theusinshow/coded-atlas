"use client";
import { createContext, useContext } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import type { CanvasContent } from "@/src/core/documents/creative-document";

/**
 * Estado EFÊMERO do editor (docs/STACK.md: Zustand só para UI). A verdade
 * persistente é a revisão no SQLite — o autosave empurra `content` para lá.
 */
export type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

const HISTORY_LIMIT = 100;
/** Mudanças com a mesma chave dentro desta janela viram UM passo de undo (arrasto, digitação). */
const GESTURE_MS = 800;

export interface StudioState {
  content: CanvasContent;
  selectedId: string | null;
  past: CanvasContent[];
  future: CanvasContent[];
  lastKey: string | null;
  lastAt: number;
  revision: number;
  saveState: SaveState;
  saveError: string | null;
  /** Incrementado para pedir foco no campo de texto do inspetor (duplo clique no canvas). */
  focusTextNonce: number;
  select(id: string | null): void;
  /** Aplica uma mudança ao documento; `key` agrupa mudanças contínuas num passo de undo. */
  apply(change: (content: CanvasContent) => CanvasContent, key?: string): void;
  undo(): void;
  redo(): void;
  requestTextFocus(): void;
  markSaving(): void;
  markSaved(revision: number, savedContent: CanvasContent): void;
  markError(message: string, conflict?: boolean): void;
  /** Substitui o documento inteiro (restaurar revisão) sem histórico local. */
  reset(content: CanvasContent, revision: number): void;
}

export function createStudioStore(initial: { content: CanvasContent; revision: number }): StoreApi<StudioState> {
  return createStore<StudioState>()((set, get) => ({
    content: initial.content,
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
      const now = Date.now();
      const sameGesture = key !== undefined && key === state.lastKey && now - state.lastAt < GESTURE_MS;
      set({
        content: next,
        past: sameGesture ? state.past : [...state.past, state.content].slice(-HISTORY_LIMIT),
        future: [],
        lastKey: key ?? null,
        lastAt: now,
        saveState: "dirty",
      });
    },
    undo: () => {
      const { past, content, future } = get();
      const previous = past.at(-1);
      if (!previous) return;
      set({ content: previous, past: past.slice(0, -1), future: [content, ...future], lastKey: null, saveState: "dirty" });
    },
    redo: () => {
      const { past, content, future } = get();
      const [next, ...rest] = future;
      if (!next) return;
      set({ content: next, past: [...past, content], future: rest, lastKey: null, saveState: "dirty" });
    },
    requestTextFocus: () => set((s) => ({ focusTextNonce: s.focusTextNonce + 1 })),
    markSaving: () => set({ saveState: "saving", saveError: null }),
    // Só volta a "saved" se nada mudou enquanto salvava.
    markSaved: (revision, savedContent) => set((s) => ({ revision, saveState: s.content === savedContent ? "saved" : "dirty", saveError: null })),
    markError: (message, conflict = false) => set({ saveState: conflict ? "conflict" : "error", saveError: message }),
    reset: (content, revision) => set({ content, revision, past: [], future: [], lastKey: null, saveState: "saved", saveError: null, selectedId: null }),
  }));
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

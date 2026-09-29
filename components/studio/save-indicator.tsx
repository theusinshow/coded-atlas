"use client";
import { AnimatePresence, motion } from "motion/react";
import { DURATION, EASE_OUT } from "@/components/ui/motion";

export type SaveStateValue = "saved" | "dirty" | "saving" | "error" | "conflict";

const LABEL: Record<SaveStateValue, { text: string; className: string }> = {
  saved: { text: "Salvo", className: "text-cbm-gray-400" },
  dirty: { text: "Alterado", className: "text-cbm-gray-400" },
  saving: { text: "Salvando…", className: "text-cbm-gray-200" },
  error: { text: "Falha ao salvar", className: "text-bad" },
  conflict: { text: "Editado em outra aba", className: "text-bad" },
};

/**
 * Estado do autosave no cabeçalho dos editores: só a palavra (as revisões ficam no
 * menu Revisões). Troca com um crossfade curto — feedback, não enfeite.
 */
export function SaveIndicator({ state, revision, error }: { state: SaveStateValue; revision?: number; error?: string | null }) {
  const label = LABEL[state];
  return (
    <span className="relative inline-flex min-w-[7.5rem] items-center text-[12px] whitespace-nowrap" title={error ?? undefined} data-save-state={state} data-revision={revision} aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={state}
          className={label.className}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: DURATION.instant, ease: EASE_OUT } }}
          exit={{ opacity: 0, transition: { duration: 0.1, ease: "easeIn" } }}
        >
          {label.text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

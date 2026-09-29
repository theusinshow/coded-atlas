"use client";
import { Ban, Check, StickyNote, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useActionState, useState } from "react";
import { addMemoryAction, removeMemoryAction, type CreativeActionState } from "@/app/actions/creative";
import type { CreativeMemory } from "@/src/core/creative/memory";
import { COMPOSITIONS } from "@/src/core/creative/compositions";
import { STYLE_MODES } from "@/components/create/types";
import { Button, FormError, INPUT_CLASS } from "@/components/ui/primitives";
import { DURATION, EASE_OUT } from "@/components/ui/motion";

const POLARITY: Record<CreativeMemory["polarity"], { label: string; icon: typeof Check; className: string }> = {
  prefer: { label: "Preferir", icon: Check, className: "text-ok" },
  avoid: { label: "Evitar", icon: Ban, className: "text-warn" },
  note: { label: "Nota", icon: StickyNote, className: "text-cbm-gray-400" },
};
const SUBJECT: Record<CreativeMemory["subject"], string> = { composition: "Composição", style: "Estilo", tone: "Tom", general: "Geral" };

function describe(m: CreativeMemory): string {
  if (m.subject === "composition") return COMPOSITIONS.find((c) => c.id === m.value)?.name ?? m.value;
  if (m.subject === "style") return STYLE_MODES.find((s) => s.id === m.value)?.label ?? m.value;
  return m.value;
}

/**
 * Memória criativa de um escopo. Sem projectId: preferências da Coded by M
 * (valem para todos os projetos). Com: padrões deste projeto — vencem as gerais.
 */
export function MemoryPanel({ memories, projectId }: { memories: CreativeMemory[]; projectId: string | null }) {
  const [state, action, pending] = useActionState<CreativeActionState, FormData>(addMemoryAction, null);
  const [subject, setSubject] = useState<CreativeMemory["subject"]>("general");
  const scoped = memories.filter((m) => (projectId ? m.projectId === projectId : m.projectId === null));
  const field = `${INPUT_CLASS} !text-[13px]`;

  return (
    <div className="space-y-3">
      {scoped.length === 0 ? (
        <p className="text-[13px] text-cbm-gray-400">
          {projectId ? "Nada ainda. Aplicar ou descartar planos também ensina o Atlas." : "Nada ainda. Ex.: “evitar gradientes”, “sempre creditar a Coded by M”."}
        </p>
      ) : (
        <ul className="divide-y divide-line border border-line" aria-label="Memórias">
          <AnimatePresence initial={false}>
            {scoped.map((m) => {
              const polarity = POLARITY[m.polarity];
              const Icon = polarity.icon;
              return (
                <motion.li
                  key={m.id}
                  className="overflow-hidden"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto", transition: { duration: DURATION.quick, ease: EASE_OUT } }}
                  exit={{ opacity: 0, height: 0, transition: { duration: 0.2, ease: "easeIn" } }}
                >
                  <div className="flex items-center gap-3 px-3 py-1.5 text-[13px]">
                    <span className={`flex w-20 shrink-0 items-center gap-1.5 ${polarity.className}`}>
                      <Icon size={14} aria-hidden />
                      {polarity.label}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-cbm-gray-200" title={m.value}>
                      <span className="text-cbm-gray-400">{SUBJECT[m.subject]}: </span>
                      {describe(m)}
                    </span>
                    {m.source === "signal" && (
                      <span className="hidden sm:inline text-[12px] text-cbm-gray-400 shrink-0" title="Aprendido com planos aplicados ou descartados">
                        Aprendido
                      </span>
                    )}
                    <form action={removeMemoryAction}>
                      <input type="hidden" name="id" value={m.id} />
                      <button
                        type="submit"
                        className="grid h-10 w-10 sm:h-8 sm:w-8 place-items-center text-cbm-gray-400 hover:text-cbm-white"
                        aria-label={`Remover memória ${describe(m)}`}
                        title="Remover"
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </form>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
      <form action={action} className="space-y-2">
        {projectId && <input type="hidden" name="projectId" value={projectId} />}
        <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
          <select name="polarity" aria-label="Tipo" defaultValue="prefer" className={field}>
            <option value="prefer">Preferir</option>
            <option value="avoid">Evitar</option>
            <option value="note">Nota</option>
          </select>
          <select name="subject" aria-label="Assunto" value={subject} onChange={(e) => setSubject(e.target.value as CreativeMemory["subject"])} className={field}>
            {Object.entries(SUBJECT).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            {subject === "composition" ? (
              <select name="value" aria-label="Composição" className={field}>
                {COMPOSITIONS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : subject === "style" ? (
              <select name="value" aria-label="Estilo" className={field}>
                {STYLE_MODES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            ) : (
              <input name="value" aria-label="Memória" required maxLength={300} className={field} placeholder={subject === "tone" ? "Ex.: direto, sem jargão" : "Ex.: não usar fundo claro"} />
            )}
          </div>
          <Button type="submit" disabled={pending} className="shrink-0">
            Adicionar
          </Button>
        </div>
      </form>
      <FormError message={state?.error} />
    </div>
  );
}

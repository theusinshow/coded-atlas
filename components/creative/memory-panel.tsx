"use client";
import { useActionState, useState } from "react";
import { addMemoryAction, removeMemoryAction, type CreativeActionState } from "@/app/actions/creative";
import type { CreativeMemory } from "@/src/core/creative/memory";
import { COMPOSITIONS } from "@/src/core/creative/compositions";
import { STYLE_MODES } from "@/components/create/types";
import { Button, FormError, INPUT_CLASS } from "@/components/ui/primitives";

const POLARITY: Record<CreativeMemory["polarity"], { label: string; className: string }> = {
  prefer: { label: "preferir", className: "text-ok" },
  avoid: { label: "evitar", className: "text-bad" },
  note: { label: "nota", className: "text-zinc-400" },
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
  const small = `${INPUT_CLASS} !py-1.5 !text-[12px]`;

  return (
    <div className="space-y-3">
      {scoped.length === 0 ? (
        <p className="text-[12px] text-zinc-500">Nada ainda. {projectId ? "Aplicar ou descartar planos também ensina o Atlas." : "Ex.: “evitar gradientes”, “sempre creditar a Coded by M”."}</p>
      ) : (
        <ul className="divide-y divide-line border border-line" aria-label="Memórias">
          {scoped.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-[12px]">
              <span className={`w-14 font-mono text-[10px] uppercase ${POLARITY[m.polarity].className}`}>{POLARITY[m.polarity].label}</span>
              <span className="w-20 text-zinc-500">{SUBJECT[m.subject]}</span>
              <span className="flex-1 min-w-0 text-zinc-200 truncate" title={m.value}>
                {describe(m)}
              </span>
              {m.source === "signal" && (
                <span className="text-[10px] font-mono text-zinc-600" title="Aprendido de planos aplicados/descartados">
                  aprendido ×{m.weight}
                </span>
              )}
              <form action={removeMemoryAction}>
                <input type="hidden" name="id" value={m.id} />
                <button type="submit" className="text-[11px] text-zinc-600 hover:text-bad" aria-label={`Remover memória ${describe(m)}`}>
                  remover
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form action={action} className="grid grid-cols-[6.5rem_7.5rem_1fr_auto] gap-2 items-start">
        {projectId && <input type="hidden" name="projectId" value={projectId} />}
        <select name="polarity" aria-label="Tipo" defaultValue="prefer" className={small}>
          <option value="prefer">Preferir</option>
          <option value="avoid">Evitar</option>
          <option value="note">Nota</option>
        </select>
        <select name="subject" aria-label="Assunto" value={subject} onChange={(e) => setSubject(e.target.value as CreativeMemory["subject"])} className={small}>
          {Object.entries(SUBJECT).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        {subject === "composition" ? (
          <select name="value" aria-label="Composição" className={small}>
            {COMPOSITIONS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : subject === "style" ? (
          <select name="value" aria-label="Estilo" className={small}>
            {STYLE_MODES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        ) : (
          <input name="value" aria-label="Memória" required maxLength={300} className={small} placeholder={subject === "tone" ? "Ex.: direto, sem jargão" : "Ex.: não usar fundo claro"} />
        )}
        <Button type="submit" size="sm" disabled={pending}>
          Adicionar
        </Button>
      </form>
      <FormError message={state?.error} />
    </div>
  );
}

"use client";
import { ChevronRight, Trash2 } from "lucide-react";
import { useActionState } from "react";
import { createDirectionAction, deleteDirectionAction, saveDirectionAction, type CreativeActionState } from "@/app/actions/creative";
import type { SavedDirection } from "@/src/core/creative/direction";
import { STYLE_MODES } from "@/components/create/types";
import { Button, FormError, INPUT_CLASS, LABEL_CLASS } from "@/components/ui/primitives";

export function DirectionList({ directions }: { directions: SavedDirection[] }) {
  if (directions.length === 0) return <p className="text-[13px] text-cbm-gray-400">Nenhuma direção salva. Salve uma a partir de um plano que deu certo.</p>;
  return (
    <ul className="divide-y divide-line border border-line" aria-label="Direções salvas">
      {directions.map((d) => (
        <li key={d.id} className="flex items-center gap-3 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[13px] text-cbm-gray-100">
              {d.accent && <span className="inline-block h-2.5 w-2.5 shrink-0 border border-line" style={{ background: d.accent }} aria-hidden />}
              <span className="truncate">{d.name}</span>
            </p>
            <p className="text-[12px] text-cbm-gray-400 truncate">
              {STYLE_MODES.find((s) => s.id === d.styleMode)?.label} · {d.tone}
            </p>
          </div>
          <form action={deleteDirectionAction}>
            <input type="hidden" name="id" value={d.id} />
            <button type="submit" className="grid h-10 w-10 sm:h-8 sm:w-8 place-items-center text-cbm-gray-400 hover:text-cbm-white" aria-label={`Excluir direção ${d.name}`} title="Excluir">
              <Trash2 size={14} aria-hidden />
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

export function SaveDirectionForm({ planId }: { planId: string }) {
  const [state, action, pending] = useActionState<CreativeActionState, FormData>(saveDirectionAction, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="planId" value={planId} />
      <label htmlFor="direction-name" className={LABEL_CLASS}>
        Salvar como direção criativa
      </label>
      <div className="flex gap-2">
        <input id="direction-name" name="name" maxLength={80} placeholder="Ex.: Lançamento técnico" className={`${INPUT_CLASS} !text-[13px]`} />
        <Button type="submit" disabled={pending}>
          Salvar
        </Button>
      </div>
      {state?.message && <p className="text-[12px] text-ok">{state.message}</p>}
      <FormError message={state?.error} />
    </form>
  );
}

export function NewDirectionForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState<CreativeActionState, FormData>(createDirectionAction, null);
  return (
    <details className="group/dir border border-line">
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 text-[13px] text-cbm-gray-200 hover:text-cbm-white [&::-webkit-details-marker]:hidden">
        <ChevronRight size={12} className="transition-transform duration-200 group-open/dir:rotate-90" aria-hidden />
        Nova direção
      </summary>
      <form action={action} className="border-t border-line p-3 space-y-2">
        <input type="hidden" name="projectId" value={projectId} />
        <input name="name" required maxLength={80} placeholder="Nome" aria-label="Nome da direção" className={INPUT_CLASS} />
        <input name="tone" maxLength={160} placeholder="Tom (ex.: técnico e sóbrio)" aria-label="Tom" className={INPUT_CLASS} />
        <input name="emphasis" maxLength={240} placeholder="Ênfase (ex.: aprovação rápida)" aria-label="Ênfase" className={INPUT_CLASS} />
        <div className="flex flex-wrap items-center gap-3">
          <select name="styleMode" aria-label="Estilo" defaultValue="hybrid" className={`${INPUT_CLASS} !w-auto`}>
            {STYLE_MODES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <label className="flex min-h-10 items-center gap-2 text-[13px] text-cbm-gray-200 whitespace-nowrap">
            <input type="checkbox" name="useAccent" /> Usar cor de destaque
          </label>
          <input type="color" name="accent" aria-label="Cor de destaque" defaultValue="#c98a4b" className="h-10 w-12 bg-transparent border border-line" />
        </div>
        <textarea name="notes" rows={2} maxLength={600} placeholder="Notas" aria-label="Notas" className={INPUT_CLASS} />
        <Button type="submit" disabled={pending}>
          Criar direção
        </Button>
        <FormError message={state?.error} />
      </form>
    </details>
  );
}

"use client";
import { useActionState } from "react";
import { createDirectionAction, deleteDirectionAction, saveDirectionAction, type CreativeActionState } from "@/app/actions/creative";
import type { SavedDirection } from "@/src/core/creative/direction";
import { STYLE_MODES } from "@/components/create/types";
import { Button, FormError, INPUT_CLASS, LABEL_CLASS } from "@/components/ui/primitives";

export function DirectionList({ directions }: { directions: SavedDirection[] }) {
  if (directions.length === 0) return <p className="text-[12px] text-cbm-gray-400">Nenhuma direção salva. Salve uma a partir de um plano que funcionou.</p>;
  return (
    <ul className="space-y-2" aria-label="Direções salvas">
      {directions.map((d) => (
        <li key={d.id} className="border border-line px-3 py-2 text-[12px] space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-cbm-gray-100 flex items-center gap-2">
              {d.accent && <span className="inline-block w-2.5 h-2.5" style={{ background: d.accent }} aria-hidden />}
              {d.name}
            </p>
            <form action={deleteDirectionAction}>
              <input type="hidden" name="id" value={d.id} />
              <button type="submit" className="text-[11px] text-cbm-gray-400 hover:text-bad" aria-label={`Excluir direção ${d.name}`}>
                excluir
              </button>
            </form>
          </div>
          <p className="text-cbm-gray-400">
            {STYLE_MODES.find((s) => s.id === d.styleMode)?.label} · {d.tone}
          </p>
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
        <input id="direction-name" name="name" maxLength={80} placeholder="Ex.: Lançamento técnico" className={`${INPUT_CLASS} !py-1.5 !text-[12px]`} />
        <Button type="submit" size="sm" disabled={pending}>
          Salvar
        </Button>
      </div>
      {state?.message && <p className="text-[11px] text-ok">{state.message}</p>}
      <FormError message={state?.error} />
    </form>
  );
}

export function NewDirectionForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState<CreativeActionState, FormData>(createDirectionAction, null);
  const input = `${INPUT_CLASS} !py-1.5 !text-[12px]`;
  return (
    <details className="border border-line">
      <summary className="cursor-pointer px-3 py-2 text-[12px] text-cbm-gray-400 hover:text-cbm-gray-100">Nova direção à mão</summary>
      <form action={action} className="p-3 space-y-2">
        <input type="hidden" name="projectId" value={projectId} />
        <input name="name" required maxLength={80} placeholder="Nome" aria-label="Nome da direção" className={input} />
        <input name="tone" maxLength={160} placeholder="Tom (ex.: técnico e sóbrio)" aria-label="Tom" className={input} />
        <input name="emphasis" maxLength={240} placeholder="Ênfase (ex.: aprovação rápida)" aria-label="Ênfase" className={input} />
        <div className="flex items-center gap-2">
          <select name="styleMode" aria-label="Estilo" defaultValue="hybrid" className={input}>
            {STYLE_MODES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-[12px] text-cbm-gray-400 whitespace-nowrap">
            <input type="checkbox" name="useAccent" /> destaque
          </label>
          <input type="color" name="accent" aria-label="Cor de destaque" defaultValue="#c98a4b" className="h-8 w-10 bg-transparent border border-line" />
        </div>
        <textarea name="notes" rows={2} maxLength={600} placeholder="Notas" aria-label="Notas" className={input} />
        <Button type="submit" size="sm" disabled={pending}>
          Criar direção
        </Button>
        <FormError message={state?.error} />
      </form>
    </details>
  );
}

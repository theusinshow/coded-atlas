"use client";
import { useActionState } from "react";
import { reviseIdentityAction, type CreativeActionState } from "@/app/actions/creative";
import type { VisualProfile } from "@/src/core/creative/visual-profile";
import { Button, FormError, INPUT_CLASS, LABEL_CLASS } from "@/components/ui/primitives";

/** Corrigir paleta/fontes lidas da captura — vira uma revisão nova do VisualProfile. */
export function IdentityEditor({ projectId, profile }: { projectId: string; profile: VisualProfile | null }) {
  const [state, action, pending] = useActionState<CreativeActionState, FormData>(reviseIdentityAction, null);
  return (
    <details className="border border-line">
      <summary className="cursor-pointer px-3 py-2 text-[12px] text-zinc-400 hover:text-zinc-100">{profile ? "Corrigir identidade" : "Definir identidade à mão"}</summary>
      <form action={action} className="p-3 space-y-3">
        <input type="hidden" name="projectId" value={projectId} />
        <div>
          <label htmlFor="identity-palette" className={LABEL_CLASS}>
            Paleta (hex, a primeira é o fundo)
          </label>
          <textarea id="identity-palette" name="palette" rows={2} defaultValue={profile?.palette.join(", ") ?? ""} className={`${INPUT_CLASS} font-mono !text-[12px]`} placeholder="#0b1f33, #f2a900, #ffffff" />
        </div>
        <div>
          <label htmlFor="identity-fonts" className={LABEL_CLASS}>
            Fontes da marca
          </label>
          <input id="identity-fonts" name="fonts" defaultValue={profile?.fonts.join(", ") ?? ""} className={`${INPUT_CLASS} !text-[12px]`} placeholder="Sora, Inter" />
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          Salvar nova revisão
        </Button>
        {state?.message && <p className="text-[11px] text-ok">{state.message}</p>}
        <FormError message={state?.error} />
      </form>
    </details>
  );
}

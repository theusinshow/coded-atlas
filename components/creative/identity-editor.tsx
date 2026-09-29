"use client";
import { ChevronRight } from "lucide-react";
import { useActionState } from "react";
import { reviseIdentityAction, type CreativeActionState } from "@/app/actions/creative";
import type { VisualProfile } from "@/src/core/creative/visual-profile";
import { Button, FormError, INPUT_CLASS, LABEL_CLASS } from "@/components/ui/primitives";

/** Corrigir cores/fontes lidas da captura — grava uma versão nova da identidade (a anterior fica no histórico). */
export function IdentityEditor({ projectId, profile }: { projectId: string; profile: VisualProfile | null }) {
  const [state, action, pending] = useActionState<CreativeActionState, FormData>(reviseIdentityAction, null);
  return (
    <details className="group/identity border border-line">
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 text-[13px] text-cbm-gray-200 hover:text-cbm-white [&::-webkit-details-marker]:hidden">
        <ChevronRight size={12} className="transition-transform duration-200 group-open/identity:rotate-90" aria-hidden />
        {profile ? "Corrigir identidade" : "Definir identidade à mão"}
      </summary>
      <form action={action} className="border-t border-line p-3 space-y-3">
        <input type="hidden" name="projectId" value={projectId} />
        <div>
          <label htmlFor="identity-palette" className={LABEL_CLASS}>
            Cores
          </label>
          <textarea
            id="identity-palette"
            name="palette"
            rows={2}
            defaultValue={profile?.palette.join(", ") ?? ""}
            className={`${INPUT_CLASS} font-mono !text-[13px]`}
            placeholder="#0b1f33, #f2a900, #ffffff"
          />
          <p className="text-[12px] text-cbm-gray-400 mt-1">Códigos hex separados por vírgula. A primeira cor é o fundo.</p>
        </div>
        <div>
          <label htmlFor="identity-fonts" className={LABEL_CLASS}>
            Fontes da marca
          </label>
          <input id="identity-fonts" name="fonts" defaultValue={profile?.fonts.join(", ") ?? ""} className={`${INPUT_CLASS} !text-[13px]`} placeholder="Sora, Inter" />
        </div>
        <Button type="submit" disabled={pending}>
          Salvar nova revisão
        </Button>
        {state?.message && <p className="text-[12px] text-ok">{state.message}</p>}
        <FormError message={state?.error} />
      </form>
    </details>
  );
}

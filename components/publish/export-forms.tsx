"use client";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { createPackageAction, createPortfolioAction, type PublishActionState } from "@/app/actions/publish";
import { JobFollower } from "@/components/atlas/job-follower";
import { Button, FormError, INPUT_CLASS, LABEL_CLASS } from "@/components/ui/primitives";

export type DestinationView = Record<"download" | "folder" | "github", { available: boolean; label: string }>;

const DESTINATIONS = [
  { id: "download", title: "Baixar ZIP", hint: () => "Pacote guardado no Atlas, pronto para baixar" },
  { id: "folder", title: "Pasta local", hint: (d: DestinationView) => d.folder.label },
  { id: "github", title: "Repositório GitHub", hint: (d: DestinationView) => (d.github.available ? `Commit em ${d.github.label}` : "Não configurado — ATLAS_GITHUB_TOKEN + ATLAS_GITHUB_REPO") },
] as const;

function picks(formId: string): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="outputId"][form="${formId}"]`));
}

/**
 * Formulário de entrega. As peças são checkboxes espalhados pela página ligados
 * a este form pelo atributo `form` — a seleção fica onde as peças estão.
 */
export function ExportForm({ formId, mode, projectId, destinations, defaultName }: { formId: string; mode: "package" | "portfolio"; projectId?: string; destinations: DestinationView; defaultName: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<PublishActionState, FormData>(mode === "package" ? createPackageAction : createPortfolioAction, null);
  const [destination, setDestination] = useState<"download" | "folder" | "github">("download");
  const [count, setCount] = useState(0);

  useEffect(() => {
    const update = () => setCount(picks(formId).filter((i) => i.checked).length);
    update();
    document.addEventListener("change", update);
    return () => document.removeEventListener("change", update);
  }, [formId]);

  function selectAll(checked: boolean) {
    for (const input of picks(formId)) input.checked = checked;
    setCount(checked ? picks(formId).length : 0);
  }

  return (
    <form id={formId} action={action} className="space-y-4" data-export-form={mode}>
      {projectId && <input type="hidden" name="projectId" value={projectId} />}
      <div className="flex flex-wrap items-center gap-3 text-[12px]">
        <span className="font-mono text-accent tabular-nums" data-export-count={count}>
          {count} {count === 1 ? "peça marcada" : "peças marcadas"}
        </span>
        <button type="button" onClick={() => selectAll(true)} className="text-cbm-gray-400 hover:text-cbm-gray-100">
          Marcar todas
        </button>
        <button type="button" onClick={() => selectAll(false)} className="text-cbm-gray-400 hover:text-cbm-gray-100">
          Limpar
        </button>
      </div>
      <fieldset>
        <legend className={LABEL_CLASS}>Destino</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {DESTINATIONS.map((d) => {
            const available = destinations[d.id].available;
            const active = destination === d.id;
            return (
              <label
                key={d.id}
                className={`border px-3 py-2.5 transition-colors ${!available ? "opacity-50 cursor-not-allowed border-line" : active ? "cursor-pointer border-accent bg-accent/5" : "cursor-pointer border-line hover:border-cbm-gray-400"}`}
              >
                <input type="radio" name="destination" value={d.id} checked={active} disabled={!available} onChange={() => setDestination(d.id)} className="sr-only" />
                <span className={`block text-[13px] ${active ? "text-cbm-white" : "text-cbm-gray-100"}`}>{d.title}</span>
                <span className="block text-[11px] text-cbm-gray-400 leading-snug break-all">{d.hint(destinations)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <label htmlFor={`${formId}-name`} className={LABEL_CLASS}>
            Nome
          </label>
          <input id={`${formId}-name`} name="name" defaultValue={defaultName} maxLength={120} className={INPUT_CLASS} />
        </div>
        <Button variant="primary" type="submit" disabled={pending || count === 0}>
          {pending ? "Preparando…" : mode === "package" ? "Criar pacote" : "Exportar portfólio"}
        </Button>
      </div>
      <FormError message={state?.error} />
      {state?.jobId && <JobFollower key={state.jobId} jobId={state.jobId} onDone={() => router.refresh()} />}
    </form>
  );
}

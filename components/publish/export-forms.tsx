"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { createPackageAction, createPortfolioAction, type PublishActionState } from "@/app/actions/publish";
import { JobFollower } from "@/components/atlas/job-follower";
import { Button, FormError, INPUT_CLASS } from "@/components/ui/primitives";
import { plural } from "@/components/ui/format";
import { DURATION, EASE_OUT } from "@/components/ui/motion";

export type DestinationView = Record<"download" | "folder" | "github", { available: boolean; label: string }>;
type Destination = keyof DestinationView;

const DESTINATIONS: { id: Destination; title: string }[] = [
  { id: "download", title: "Baixar ZIP" },
  { id: "folder", title: "Pasta de entregas" },
  { id: "github", title: "GitHub" },
];

function picks(formId: string): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="outputId"][form="${formId}"]`));
}

function setAll(formId: string, checked: boolean): void {
  for (const input of picks(formId)) input.checked = checked;
  // Mesmo evento que um clique geraria: contadores ouvindo "change" se atualizam.
  document.dispatchEvent(new Event("change"));
}

const TEXT_BUTTON = "inline-flex h-10 items-center px-2 text-[12px] text-cbm-gray-400 transition-colors hover:text-cbm-white sm:h-8";

/** "Marcar todas" para o cabeçalho da lista (antes de haver seleção, a barra não aparece). */
export function SelectAllButton({ formId }: { formId: string }) {
  return (
    <button type="button" onClick={() => setAll(formId, true)} className={`${TEXT_BUTTON} -mr-2`}>
      Marcar todas
    </button>
  );
}

/**
 * Entrega (pacote do projeto ou portfólio). As peças são cartões selecionáveis
 * espalhados pela página, ligados a este form pelo atributo `form` (FormData com
 * uma lista `outputId`). A barra fixa no rodapé só aparece quando há algo marcado
 * (ou uma entrega em andamento): contagem, destino, nome e a ação.
 */
export function ExportForm({ formId, mode, projectId, destinations, defaultName }: { formId: string; mode: "package" | "portfolio"; projectId?: string; destinations: DestinationView; defaultName: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<PublishActionState, FormData>(mode === "package" ? createPackageAction : createPortfolioAction, null);
  const [destination, setDestination] = useState<Destination>("download");
  const [count, setCount] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [barHeight, setBarHeight] = useState(0);
  const bar = useRef<HTMLDivElement>(null);
  const jobId = state?.jobId && state.jobId !== dismissed ? state.jobId : null;
  const visible = count > 0 || pending || Boolean(jobId) || Boolean(state?.error);

  useEffect(() => {
    const update = () => setCount(picks(formId).filter((i) => i.checked).length);
    update();
    document.addEventListener("change", update);
    return () => document.removeEventListener("change", update);
  }, [formId]);

  // Reserva o espaço da barra no fim da página: nada fica escondido atrás dela.
  useEffect(() => {
    const el = bar.current;
    if (!visible || !el) return setBarHeight(0);
    const observer = new ResizeObserver(() => setBarHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  const submitLabel = mode === "package" ? "Criar pacote" : "Exportar portfólio";

  return (
    <form id={formId} action={action} data-export-form={mode}>
      {projectId && <input type="hidden" name="projectId" value={projectId} />}
      <div aria-hidden style={{ height: barHeight }} />
      <AnimatePresence>
        {visible && (
          <motion.div
            ref={bar}
            key="bar"
            role="region"
            aria-label="Peças marcadas"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE_OUT } }}
            exit={{ opacity: 0, y: 8, transition: { duration: DURATION.instant, ease: "easeIn" } }}
            className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface"
          >
            <div className="mx-auto max-w-6xl space-y-3 px-4 py-3 sm:px-6">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex min-w-0 items-center gap-1">
                  <span className="mr-2 text-[13px] tabular-nums text-cbm-white" data-export-count={count}>
                    {count === 0 ? "Nenhuma peça marcada" : plural(count, "peça marcada", "peças marcadas")}
                  </span>
                  <button type="button" onClick={() => setAll(formId, true)} className={TEXT_BUTTON}>
                    Marcar todas
                  </button>
                  <button type="button" onClick={() => setAll(formId, false)} className={TEXT_BUTTON}>
                    Limpar
                  </button>
                </div>

                <fieldset className="grid w-full grid-cols-3 gap-1 sm:flex sm:w-auto sm:flex-none lg:ml-auto">
                  <legend className="sr-only">Destino</legend>
                  {DESTINATIONS.map((d) => {
                    const available = destinations[d.id].available;
                    const active = destination === d.id;
                    if (!available) {
                      // Destino indisponível: o segmento inteiro leva a Ajustes (sem radio morto).
                      return (
                        <Link
                          key={d.id}
                          href="/settings"
                          className="flex min-h-10 flex-col justify-center border border-line-soft px-3 py-1 text-center text-cbm-gray-400 transition-colors duration-150 hover:border-line hover:text-cbm-gray-200 sm:text-left"
                        >
                          <span className="text-[12px] leading-tight">{d.title}</span>
                          <span className="text-[11px] leading-tight">
                            não configurado · <span className="text-accent">ver Ajustes</span>
                          </span>
                        </Link>
                      );
                    }
                    return (
                      <label
                        key={d.id}
                        title={d.id === "github" ? destinations.github.label : undefined}
                        className={`flex min-h-10 cursor-pointer flex-col justify-center border px-3 py-1 text-center transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-signal sm:text-left ${
                          active ? "border-cbm-white bg-surface-2 text-cbm-white" : "border-line text-cbm-gray-200 hover:border-cbm-gray-400"
                        }`}
                      >
                        <input type="radio" name="destination" value={d.id} checked={active} onChange={() => setDestination(d.id)} className="sr-only" />
                        <span className="text-[12px] leading-tight">{d.title}</span>
                      </label>
                    );
                  })}
                </fieldset>

                <div className="flex w-full items-center gap-2 sm:w-auto sm:flex-1 lg:flex-none">
                  <label htmlFor={`${formId}-name`} className="sr-only">
                    Nome
                  </label>
                  <input id={`${formId}-name`} name="name" defaultValue={defaultName} maxLength={120} className={`${INPUT_CLASS} min-w-0 flex-1 lg:w-36 lg:flex-none`} />
                  <Button variant="primary" type="submit" disabled={pending || count === 0} className="shrink-0">
                    {pending ? "Preparando…" : submitLabel}
                  </Button>
                </div>
              </div>

              {(jobId || state?.error) && (
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <FormError message={state?.error} />
                    {jobId && (
                      <JobFollower
                        key={jobId}
                        jobId={jobId}
                        onDone={(status) => {
                          router.refresh();
                          if (status === "completed") setAll(formId, false);
                        }}
                      />
                    )}
                  </div>
                  {jobId && !pending && (
                    <button type="button" aria-label="Fechar" onClick={() => setDismissed(jobId)} className="grid size-10 shrink-0 place-items-center text-cbm-gray-400 hover:text-cbm-white sm:size-8">
                      <X size={16} aria-hidden />
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}

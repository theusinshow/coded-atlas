"use client";
import { useActionState, useState, useTransition } from "react";
import { Camera, Plus, Trash2 } from "lucide-react";
import { addSourceAction, captureSourceAction, removeSourceAction, type ActionState } from "@/app/actions/projects";
import { JobFollower } from "@/components/atlas/job-follower";
import { Button, FormError, INPUT_CLASS, Panel } from "@/components/ui/primitives";

interface SourceView {
  id: string;
  type: "url" | "github" | "local" | "upload";
  locator: string;
  label: string | null;
}

const TYPE_LABEL: Record<SourceView["type"], string> = {
  url: "Site",
  local: "Servidor local",
  github: "GitHub",
  upload: "Arquivos enviados",
};

const PLACEHOLDER: Record<"url" | "local" | "github", string> = {
  url: "https://site.com",
  local: "http://localhost:3000",
  github: "dono/repositório ou link do GitHub",
};

/** Botões da linha: 40 px de alvo no celular, compactos no desktop. */
const ROW_BUTTON = "max-sm:h-10 max-sm:flex-1";

export function SourcesPanel({ projectId, sources }: { projectId: string; sources: SourceView[] }) {
  const [addState, addAction, adding] = useActionState<ActionState, FormData>(addSourceAction.bind(null, projectId), null);
  const [type, setType] = useState<"url" | "local" | "github">("url");
  const [jobs, setJobs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function capture(sourceId: string) {
    setError(null);
    startTransition(async () => {
      const result = await captureSourceAction(projectId, sourceId);
      if (result?.error) setError(result.error);
      else if (result?.jobId) setJobs((j) => ({ ...j, [sourceId]: result.jobId! }));
    });
  }

  function remove(sourceId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeSourceAction(projectId, sourceId);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-4">
      {sources.length === 0 ? (
        <p className="text-[13px] text-cbm-gray-400">Nenhuma origem ainda. Adicione o site abaixo.</p>
      ) : (
        <Panel>
          <ul className="divide-y divide-line">
            {sources.map((s) => (
              <li key={s.id} className="px-4 py-3 space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-cbm-gray-400">{TYPE_LABEL[s.type]}</p>
                    <p className="text-[13px] text-cbm-gray-200 truncate" title={s.locator}>
                      {s.label ? `${s.label} · ` : ""}
                      {s.locator}
                    </p>
                  </div>
                  {s.type !== "upload" && (
                    <div className="flex shrink-0 gap-2 sm:gap-1">
                      {(s.type === "url" || s.type === "local") && (
                        <Button size="sm" disabled={pending || Boolean(jobs[s.id])} onClick={() => capture(s.id)} className={ROW_BUTTON}>
                          <Camera size={14} aria-hidden />
                          Capturar
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => remove(s.id)} aria-label={`Remover ${s.locator}`} title="Remover origem" className={ROW_BUTTON}>
                        <Trash2 size={14} aria-hidden />
                        <span className="sm:sr-only">Remover</span>
                      </Button>
                    </div>
                  )}
                </div>
                {jobs[s.id] && (
                  <JobFollower
                    jobId={jobs[s.id]}
                    onDone={() =>
                      setJobs((current) => {
                        const next = { ...current };
                        delete next[s.id];
                        return next;
                      })
                    }
                  />
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <FormError message={error} />

      <form action={addAction} className="grid gap-2 sm:grid-cols-[9.5rem_minmax(0,1fr)_auto]">
        <select name="type" aria-label="Tipo de origem" className={INPUT_CLASS} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="url">Site</option>
          <option value="local">Servidor local</option>
          <option value="github">GitHub</option>
        </select>
        <input name="locator" required aria-label="Endereço da origem" placeholder={PLACEHOLDER[type]} className={`${INPUT_CLASS} min-w-0 font-mono`} />
        <Button type="submit" disabled={adding} className="h-[42px]">
          <Plus size={14} aria-hidden />
          {adding ? "Adicionando…" : "Adicionar"}
        </Button>
      </form>
      <FormError message={addState?.error} />
      {addState?.message && <p className="text-[12px] text-ok">{addState.message}</p>}
    </div>
  );
}

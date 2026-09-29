"use client";
import { useActionState, useState, useTransition } from "react";
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
  local: "Dev local",
  github: "GitHub",
  upload: "Uploads",
};

const PLACEHOLDER: Record<"url" | "local" | "github", string> = {
  url: "https://site.com",
  local: "http://localhost:3000",
  github: "owner/repo ou URL do GitHub",
};

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
        <p className="text-[13px] text-cbm-gray-400">Nenhuma origem ainda.</p>
      ) : (
        <Panel>
          <ul className="divide-y divide-line">
            {sources.map((s) => (
              <li key={s.id} className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-cbm-gray-400">{TYPE_LABEL[s.type]}</p>
                    <p className="text-[13px] text-cbm-gray-200 truncate font-mono">{s.label ? `${s.label} · ` : ""}{s.locator}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {(s.type === "url" || s.type === "local") && (
                      <Button size="sm" variant="primary" disabled={pending || Boolean(jobs[s.id])} onClick={() => capture(s.id)}>
                        Capturar
                      </Button>
                    )}
                    {s.type !== "upload" && (
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => remove(s.id)} aria-label={`Remover ${s.locator}`}>
                        Remover
                      </Button>
                    )}
                  </div>
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

      <form action={addAction} className="grid gap-2 sm:grid-cols-[8rem_1fr_auto]">
        <select name="type" aria-label="Tipo de origem" className={INPUT_CLASS} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="url">Site</option>
          <option value="local">Dev local</option>
          <option value="github">GitHub</option>
        </select>
        <input name="locator" required aria-label="Endereço da origem" placeholder={PLACEHOLDER[type]} className={INPUT_CLASS} />
        <Button type="submit" disabled={adding}>
          Adicionar
        </Button>
      </form>
      <FormError message={addState?.error} />
      {addState?.message && <p className="text-[12px] text-ok">{addState.message}</p>}
    </div>
  );
}

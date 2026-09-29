"use client";
import { useActionState, useState } from "react";
import { captureWithPlanAction, type JobActionState } from "@/app/actions/projects";
import { JobFollower } from "@/components/atlas/job-follower";
import { Button, Field, FormError, INPUT_CLASS } from "@/components/ui/primitives";

interface SourceOption {
  id: string;
  locator: string;
  type: string;
}

const PROFILES = {
  quick: { label: "Rápido", hint: "Desktop e mobile, página inteira e seções. Sem vídeo.", video: false },
  complete: { label: "Completo", hint: "Tudo do rápido + vídeo de scroll (mais lento).", video: true },
} as const;

/** Captura completa como job: perfil pronto + ajustes finos (páginas extras e estados de interação). */
export function CaptureForm({ projectId, sources }: { projectId: string; sources: SourceOption[] }) {
  const [state, action, pending] = useActionState<JobActionState, FormData>(captureWithPlanAction.bind(null, projectId), null);
  const [profile, setProfile] = useState<keyof typeof PROFILES>("quick");
  const [video, setVideo] = useState(false);
  const [finishedJobId, setFinishedJobId] = useState<string | null>(null);
  const jobId = state?.jobId && state.jobId !== finishedJobId ? state.jobId : null;

  if (sources.length === 0) {
    return <p className="text-[13px] text-cbm-gray-400">Adicione a URL do site (ou do servidor de desenvolvimento) nas origens para capturar.</p>;
  }

  return (
    <form action={action} className="space-y-5">
      <Field label="Origem" htmlFor="cf-source">
        <select id="cf-source" name="sourceId" className={INPUT_CLASS} defaultValue={sources[0].id}>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.locator}
            </option>
          ))}
        </select>
      </Field>

      <fieldset>
        <legend className="block text-[11px] font-medium text-cbm-gray-400 tracking-[0.22em] uppercase mb-2">Perfil</legend>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(PROFILES) as (keyof typeof PROFILES)[]).map((key) => (
            <label
              key={key}
              className={`border p-3 cursor-pointer ${profile === key ? "border-accent bg-accent/5" : "border-line hover:border-cbm-gray-600"}`}
            >
              <input
                type="radio"
                name="profile"
                value={key}
                checked={profile === key}
                onChange={() => {
                  setProfile(key);
                  setVideo(PROFILES[key].video);
                }}
                className="sr-only"
              />
              <span className="block text-sm text-cbm-gray-100">{PROFILES[key].label}</span>
              <span className="block text-[11px] text-cbm-gray-400 mt-1">{PROFILES[key].hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] text-cbm-gray-200">
        <legend className="sr-only">Ajustes</legend>
        <label className="flex items-center gap-2"><input type="checkbox" name="device-desktop" defaultChecked /> Desktop</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="device-mobile" defaultChecked /> Mobile</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="fullPage" defaultChecked /> Página inteira</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="sections" defaultChecked /> Seções</label>
        <label className="flex items-center gap-2 col-span-2">
          <input type="checkbox" name="video" checked={video} onChange={(e) => setVideo(e.target.checked)} /> Vídeo de scroll
        </label>
      </fieldset>

      <details className="border border-line p-3">
        <summary className="text-[12px] text-cbm-gray-400 cursor-pointer">Páginas extras e estados de interação</summary>
        <div className="space-y-4 pt-3">
          <Field label="Páginas extras" htmlFor="cf-pages" hint="Uma por linha: /sobre, /contato ou URL completa do mesmo site (máx. 10).">
            <textarea id="cf-pages" name="pages" rows={3} className={INPUT_CLASS} placeholder={"/sobre\n/servicos"} />
          </Field>
          <Field label="Estados" htmlFor="cf-states" hint="Uma por linha: Nome | seletor CSS a clicar (ex.: Menu aberto | .menu-toggle).">
            <textarea id="cf-states" name="states" rows={3} className={INPUT_CLASS} placeholder="Menu aberto | .menu-toggle" />
          </Field>
        </div>
      </details>

      <FormError message={state?.error} />
      <Button type="submit" variant="primary" disabled={pending || Boolean(jobId)} className="w-full">
        {pending ? "Enfileirando…" : "Capturar"}
      </Button>
      {jobId && <JobFollower jobId={jobId} onDone={() => setFinishedJobId(jobId)} />}
    </form>
  );
}

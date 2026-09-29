"use client";
import { useActionState, useState } from "react";
import { captureWithPlanAction, type JobActionState } from "@/app/actions/projects";
import { JobFollower } from "@/components/atlas/job-follower";
import { Button, Collapsible, Field, FormError, INPUT_CLASS, LABEL_CLASS, LinkButton } from "@/components/ui/primitives";

interface SourceOption {
  id: string;
  locator: string;
  type: string;
}

const PROFILES = {
  quick: { label: "Rápido", hint: "Desktop e celular, página inteira e seções.", video: false },
  complete: { label: "Completo", hint: "Tudo do rápido + vídeo de rolagem (mais lento).", video: true },
} as const;

const CHECK = "flex min-h-10 items-center gap-2.5 cursor-pointer sm:min-h-8";

/** Captura completa como job: perfil pronto + ajustes finos (páginas extras e estados de interação). */
export function CaptureForm({ projectId, sources, addSourceHref }: { projectId: string; sources: SourceOption[]; addSourceHref: string }) {
  const [state, action, pending] = useActionState<JobActionState, FormData>(captureWithPlanAction.bind(null, projectId), null);
  const [profile, setProfile] = useState<keyof typeof PROFILES>("quick");
  const [video, setVideo] = useState(false);
  const [finishedJobId, setFinishedJobId] = useState<string | null>(null);
  const jobId = state?.jobId && state.jobId !== finishedJobId ? state.jobId : null;

  if (sources.length === 0) {
    return (
      <div className="space-y-3 border border-dashed border-line p-5">
        <p className="text-[13px] text-cbm-gray-200">Adicione o endereço do site para capturar.</p>
        <LinkButton href={addSourceHref} size="sm" className="h-10 sm:h-8">
          Adicionar endereço
        </LinkButton>
      </div>
    );
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
        <legend className={LABEL_CLASS}>Perfil</legend>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(PROFILES) as (keyof typeof PROFILES)[]).map((key) => (
            <label
              key={key}
              className={`cursor-pointer border p-3 transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-signal ${
                profile === key ? "border-cbm-white bg-surface-2" : "border-line hover:border-cbm-gray-400"
              }`}
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
              <span className="block text-sm text-cbm-white">{PROFILES[key].label}</span>
              <span className="mt-1 block text-[12px] leading-snug text-cbm-gray-400">{PROFILES[key].hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid grid-cols-2 gap-x-4 text-[13px] text-cbm-gray-200">
        <legend className="sr-only">Ajustes</legend>
        <label className={CHECK}>
          <input type="checkbox" name="device-desktop" defaultChecked /> Desktop
        </label>
        <label className={CHECK}>
          <input type="checkbox" name="device-mobile" defaultChecked /> Celular
        </label>
        <label className={CHECK}>
          <input type="checkbox" name="fullPage" defaultChecked /> Página inteira
        </label>
        <label className={CHECK}>
          <input type="checkbox" name="sections" defaultChecked /> Seções
        </label>
        <label className={`${CHECK} col-span-2`}>
          <input type="checkbox" name="video" checked={video} onChange={(e) => setVideo(e.target.checked)} /> Vídeo de rolagem
        </label>
      </fieldset>

      <Collapsible title="Páginas extras e estados de interação">
        <div className="space-y-4">
          <Field label="Páginas extras" htmlFor="cf-pages" hint="Uma por linha: /sobre, /contato ou endereço completo do mesmo site (até 10).">
            <textarea id="cf-pages" name="pages" rows={3} className={INPUT_CLASS} placeholder={"/sobre\n/servicos"} />
          </Field>
          <Field label="Estados" htmlFor="cf-states" hint="Um por linha: nome | seletor CSS do elemento a clicar.">
            <textarea id="cf-states" name="states" rows={3} className={INPUT_CLASS} placeholder="Menu aberto | .menu-toggle" />
          </Field>
        </div>
      </Collapsible>

      <FormError message={state?.error} />
      <div className="space-y-2">
        <Button type="submit" variant="primary" disabled={pending || Boolean(jobId)} className="w-full">
          {pending ? "Enfileirando…" : "Capturar"}
        </Button>
        <p className="text-[12px] text-cbm-gray-400">Roda em segundo plano — pode sair desta página.</p>
      </div>
      {jobId && <JobFollower jobId={jobId} onDone={() => setFinishedJobId(jobId)} />}
    </form>
  );
}

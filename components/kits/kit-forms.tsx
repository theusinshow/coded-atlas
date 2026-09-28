"use client";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { generateKitAction, renderKitAction, type KitActionState } from "@/app/actions/kits";
import { KIT_PRESETS } from "@/src/core/kits/media-kit";
import { JobFollower } from "@/components/atlas/job-follower";
import { Button, FormError, INPUT_CLASS, LABEL_CLASS } from "@/components/ui/primitives";

const KIND_LABEL = { composition: "peça", carousel: "carrossel", video: "vídeo" } as const;

/** Gerar Media Kit: escolher o preset e a direção criativa única do kit. */
export function KitGenerator({ projectId, directions }: { projectId: string; directions: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<KitActionState, FormData>(generateKitAction, null);
  const [preset, setPreset] = useState(KIT_PRESETS[0].id);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="projectId" value={projectId} />
      <fieldset>
        <legend className={LABEL_CLASS}>Kit</legend>
        <div className="grid gap-2">
          {KIT_PRESETS.map((p) => (
            <label key={p.id} className={`cursor-pointer border px-3 py-3 transition-colors ${preset === p.id ? "border-accent bg-accent/5" : "border-line hover:border-zinc-500"}`}>
              <input type="radio" name="presetId" value={p.id} checked={preset === p.id} onChange={() => setPreset(p.id)} className="sr-only" />
              <span className={`block text-[13px] ${preset === p.id ? "text-accent-bright" : "text-zinc-100"}`}>{p.name}</span>
              <span className="block text-[11px] text-zinc-500 leading-snug">{p.description}</span>
              <span className="mt-1.5 flex flex-wrap gap-1">
                {p.items.map((i) => (
                  <span key={i.id} className="border border-line px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">
                    {i.label} · {KIND_LABEL[i.kind]}
                  </span>
                ))}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="kit-direction" className={LABEL_CLASS}>
          Direção criativa (uma para o kit inteiro)
        </label>
        <select id="kit-direction" name="directionId" defaultValue="" className={INPUT_CLASS}>
          <option value="">Automática — identidade + memória do projeto</option>
          {directions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      <Button variant="primary" type="submit" disabled={pending}>
        {pending ? "Gerando os itens…" : "Gerar Media Kit"}
      </Button>
      <FormError message={state?.error} />
    </form>
  );
}

/** Render em lote do kit: um job para todas as peças e vídeos. */
export function KitRenderForm({ kitId, hasVideo, busyJobId }: { kitId: string; hasVideo: boolean; busyJobId: string | null }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<KitActionState, FormData>(renderKitAction, null);
  const jobId = state?.jobId ?? busyJobId;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="kitId" value={kitId} />
      <div className="flex flex-wrap items-center gap-4 text-[12px] text-zinc-300">
        <label className="flex items-center gap-1.5">
          Imagens
          <select name="image" defaultValue="png" className="h-8 bg-surface border border-line px-2 text-[12px]">
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
          </select>
        </label>
        {hasVideo && (
          <>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" name="video" defaultChecked /> Vídeos em MP4
            </label>
            <label className="flex items-center gap-1.5">
              Qualidade
              <select name="quality" defaultValue="final" className="h-8 bg-surface border border-line px-2 text-[12px]">
                <option value="final">Final</option>
                <option value="preview">Preview rápido</option>
              </select>
            </label>
          </>
        )}
      </div>
      <Button variant="primary" type="submit" disabled={pending}>
        Renderizar kit
      </Button>
      <FormError message={state?.error} />
      {jobId && <JobFollower key={jobId} jobId={jobId} onDone={() => router.refresh()} />}
    </form>
  );
}

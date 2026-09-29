"use client";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Download, Play, Trash2 } from "lucide-react";
import { deleteKitAction, generateKitAction, renderKitAction, type KitActionState } from "@/app/actions/kits";
import { KIT_PRESETS, type KitItemKind, type KitPresetItem } from "@/src/core/kits/media-kit";
import { JobFollower } from "@/components/atlas/job-follower";
import { SubmitButton } from "@/components/create/submit-button";
import { Button, buttonClass, FormError, INPUT_CLASS, LABEL_CLASS } from "@/components/ui/primitives";
import { formatDuration, plural } from "@/components/ui/format";

const KIND_WORD: Partial<Record<KitItemKind, string>> = { carousel: "carrossel", video: "vídeo" };

/** "Reel · vídeo", mas "Carrossel do projeto" (o tipo já está no nome) e "Post 1:1" (peça é o padrão). */
function chipLabel(item: KitPresetItem): string {
  const word = KIND_WORD[item.kind];
  return word && !item.label.toLowerCase().includes(word) ? `${item.label} · ${word}` : item.label;
}

const SELECT_CLASS = "h-10 sm:h-8 bg-surface border border-line px-2 text-[12px] text-cbm-gray-200 focus:outline-none focus:border-accent";

/** Novo Media Kit: escolher o modelo e a direção criativa única do kit. */
export function KitGenerator({ projectId, directions }: { projectId: string; directions: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<KitActionState, FormData>(generateKitAction, null);
  const [preset, setPreset] = useState(KIT_PRESETS[0].id);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="projectId" value={projectId} />
      <fieldset>
        <legend className={LABEL_CLASS}>Modelo</legend>
        <div className="grid gap-2">
          {KIT_PRESETS.map((p) => {
            const selected = preset === p.id;
            return (
              <label
                key={p.id}
                className={`block cursor-pointer border px-3 py-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-signal ${selected ? "border-cbm-white" : "border-line hover:border-cbm-gray-400"}`}
              >
                <input type="radio" name="presetId" value={p.id} checked={selected} onChange={() => setPreset(p.id)} className="sr-only" />
                <span className={`block text-[13px] ${selected ? "text-cbm-white" : "text-cbm-gray-100"}`}>{p.name}</span>
                <span className="block text-[12px] text-cbm-gray-400 leading-snug mt-0.5">{p.description}</span>
                <span className="mt-2 flex flex-wrap gap-1">
                  {p.items.map((i) => (
                    <span key={i.id} className="border border-line px-1.5 py-0.5 text-[11px] text-cbm-gray-400">
                      {chipLabel(i)}
                    </span>
                  ))}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div>
        <label htmlFor="kit-direction" className={LABEL_CLASS}>
          Direção criativa
        </label>
        <select id="kit-direction" name="directionId" defaultValue="" className={INPUT_CLASS}>
          <option value="">Automática (identidade e memória do projeto)</option>
          {directions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <p className="text-[12px] text-cbm-gray-400 mt-1.5">Vale para todas as peças do kit.</p>
      </div>
      <Button variant="primary" type="submit" disabled={pending} className="w-full">
        {pending ? "Gerando…" : "Gerar Media Kit"}
      </Button>
      <FormError message={state?.error} />
    </form>
  );
}

/** Render em lote do kit (um job para todas as peças e vídeos) + o ZIP do último render. */
export function KitRenderForm({ kitId, hasVideo, busyJobId, zip }: { kitId: string; hasVideo: boolean; busyJobId: string | null; zip: { href: string; files: number } | null }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<KitActionState, FormData>(renderKitAction, null);
  const jobId = state?.jobId ?? busyJobId;
  const [finished, setFinished] = useState<string | null>(null);
  const running = !!jobId && finished !== jobId;
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <input type="hidden" name="kitId" value={kitId} />
        <div className="flex items-center gap-2 text-[13px] text-cbm-gray-200">
          <label htmlFor="kit-image">Imagens</label>
          <select id="kit-image" name="image" defaultValue="png" className={SELECT_CLASS}>
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
          </select>
        </div>
        {hasVideo && (
          <>
            <label className="flex items-center gap-2 min-h-10 sm:min-h-8 text-[13px] text-cbm-gray-200">
              <input type="checkbox" name="video" defaultChecked /> Vídeos em MP4
            </label>
            <div className="flex items-center gap-2 text-[13px] text-cbm-gray-200">
              <label htmlFor="kit-quality">Qualidade</label>
              <select id="kit-quality" name="quality" defaultValue="final" className={SELECT_CLASS}>
                <option value="final">Final</option>
                <option value="preview">Prévia rápida</option>
              </select>
            </div>
          </>
        )}
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {zip && (
            <a href={zip.href} className={buttonClass("secondary", "md")}>
              <Download size={14} aria-hidden />
              Baixar kit (.zip)
              <span className="text-cbm-gray-400">· {plural(zip.files, "arquivo", "arquivos")}</span>
            </a>
          )}
          <Button variant="primary" type="submit" disabled={pending || running}>
            Renderizar kit
          </Button>
        </div>
      </form>
      <FormError message={state?.error} />
      {jobId && (
        <JobFollower
          key={jobId}
          jobId={jobId}
          onDone={() => {
            setFinished(jobId);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/** Excluir o kit pede confirmação; rascunhos e arquivos renderizados ficam no projeto. */
export function DeleteKitForm({ kitId }: { kitId: string }) {
  return (
    <form
      action={deleteKitAction}
      onSubmit={(e) => {
        if (!window.confirm("Excluir este kit? Os rascunhos e os arquivos renderizados continuam no projeto.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="kitId" value={kitId} />
      <SubmitButton className={`${buttonClass("ghost", "sm")} max-sm:h-10`}>
        <Trash2 size={14} aria-hidden />
        Excluir kit
      </SubmitButton>
    </form>
  );
}

/** Vídeo renderizado de um item: pôster com Play; o arquivo só carrega ao tocar. */
export function KitVideo({ src, poster, durationMs, label, ratio }: { src: string; poster: string; durationMs: number | null; label: string; ratio: number }) {
  const [playing, setPlaying] = useState(false);
  if (playing) {
    return <video src={src} poster={poster} controls autoPlay playsInline className="block w-full bg-base" style={{ aspectRatio: ratio }} />;
  }
  return (
    <button type="button" onClick={() => setPlaying(true)} className="group/play relative block w-full bg-surface-2" style={{ aspectRatio: ratio }} aria-label={`Tocar ${label}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- pôster servido pelo AssetStorage */}
      <img src={poster} alt="" loading="lazy" className="h-full w-full object-contain" />
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid h-11 w-11 place-items-center border border-cbm-white/60 bg-base/70 text-cbm-white transition-colors group-hover/play:border-cbm-white">
          <Play size={16} aria-hidden />
        </span>
      </span>
      {durationMs && <span className="absolute left-2 bottom-2 bg-base/85 px-1.5 py-0.5 text-[11px] text-cbm-gray-100 tabular-nums">{formatDuration(durationMs)}</span>}
    </button>
  );
}

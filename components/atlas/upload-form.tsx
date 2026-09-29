"use client";
import { useActionState, useRef } from "react";
import { uploadAssetsAction, type ActionState } from "@/app/actions/projects";
import { Button, FormError, INPUT_CLASS } from "@/components/ui/primitives";

const KINDS = [
  { value: "screenshot", label: "Screenshot" },
  { value: "image", label: "Imagem" },
  { value: "logo", label: "Logo" },
  { value: "icon", label: "Ícone" },
  { value: "background", label: "Fundo" },
  { value: "illustration", label: "Ilustração" },
  { value: "video", label: "Vídeo" },
  { value: "audio", label: "Áudio (trilha)" },
];

/** Upload manual: o formato é conferido pelos bytes no servidor; arquivos repetidos não duplicam. */
export function UploadForm({ projectId }: { projectId: string }) {
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, data) => {
    const result = await uploadAssetsAction(projectId, prev, data);
    if (!result?.error) form.current?.reset();
    return result;
  }, null);

  return (
    <form ref={form} action={action} className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
        <input
          type="file"
          name="files"
          multiple
          required
          accept="image/png,image/jpeg,image/webp,image/avif,image/gif,image/svg+xml,video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg,audio/mp4,.m4a"
          aria-label="Arquivos"
          className={`${INPUT_CLASS} file:mr-3 file:border-0 file:bg-surface-2 file:text-cbm-gray-200 file:px-3 file:py-1`}
        />
        <select name="kind" aria-label="Tipo de asset" defaultValue="image" className={INPUT_CLASS}>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Enviando…" : "Enviar"}
        </Button>
      </div>
      <p className="text-[11px] text-cbm-gray-400">PNG, JPG, WebP, AVIF, GIF, SVG, MP4 ou WebM · até 30 arquivos · 50 MB cada.</p>
      <FormError message={state?.error} />
      {state?.message && <p className="text-[12px] text-ok">{state.message}</p>}
    </form>
  );
}

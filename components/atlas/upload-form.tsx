"use client";
import { useActionState, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Upload, X } from "lucide-react";
import { uploadAssetsAction, type ActionState } from "@/app/actions/projects";
import { FileDrop, SelectedFiles } from "@/components/media/file-drop";
import { Button, FormError, INPUT_CLASS, LABEL_CLASS } from "@/components/ui/primitives";
import { plural } from "@/components/ui/format";
import { DURATION, EASE_OUT } from "@/components/ui/motion";

const KINDS = [
  { value: "image", label: "Imagem" },
  { value: "screenshot", label: "Captura de tela" },
  { value: "logo", label: "Logo" },
  { value: "icon", label: "Ícone" },
  { value: "background", label: "Fundo" },
  { value: "illustration", label: "Ilustração" },
  { value: "video", label: "Vídeo" },
  { value: "audio", label: "Áudio (trilha)" },
];

const ACCEPT = "image/png,image/jpeg,image/webp,image/avif,image/gif,image/svg+xml,video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg,audio/mp4,.m4a";

/** Tipo sugerido pelo conteúdo: tudo vídeo → Vídeo; tudo áudio → Áudio; senão mantém a escolha (ou Imagem). */
function guessKind(files: readonly File[], current: string): string {
  if (files.length === 0) return current;
  if (files.every((f) => f.type.startsWith("video/"))) return "video";
  if (files.every((f) => f.type.startsWith("audio/") || f.name.endsWith(".m4a"))) return "audio";
  return current === "video" || current === "audio" ? "image" : current;
}

/**
 * Envio manual, atrás do botão "Enviar arquivos" do cabeçalho da grade (o conteúdo
 * vem primeiro). O `<input type="file">` fica sempre montado e escondido — é ele que
 * vai no FormData (`files` + `kind`); a área de soltar e a lista só o alimentam.
 * O formato é conferido pelos bytes no servidor; arquivos repetidos não duplicam.
 */
export function UploadForm({ projectId, children }: { projectId: string; children?: ReactNode }) {
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [kind, setKind] = useState("image");
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, data) => {
    const result = await uploadAssetsAction(projectId, prev, data);
    if (!result?.error) {
      form.current?.reset();
      setFiles([]);
      setOpen(false);
    }
    return result;
  }, null);

  function applyFiles(next: File[]) {
    const dt = new DataTransfer();
    for (const f of next) dt.items.add(f);
    if (input.current) input.current.files = dt.files;
    setFiles(next);
    setKind((k) => guessKind(next, k));
    if (next.length > 0) setOpen(true);
  }

  function close() {
    applyFiles([]);
    setOpen(false);
  }

  return (
    <form ref={form} action={action} className="space-y-3">
      <input
        ref={input}
        id={inputId}
        type="file"
        name="files"
        multiple
        required
        accept={ACCEPT}
        aria-label="Arquivos"
        tabIndex={-1}
        className="sr-only"
        onChange={(e) => applyFiles(Array.from(e.target.files ?? []))}
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">{children}</div>
        <Button type="button" size="sm" variant="secondary" className="h-10 sm:h-8" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
          {open ? <X size={14} aria-hidden /> : <Upload size={14} aria-hidden />}
          {open ? "Cancelar" : "Enviar arquivos"}
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="upload"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1, transition: { duration: DURATION.quick, ease: EASE_OUT } }}
            exit={{ height: 0, opacity: 0, transition: { duration: DURATION.instant, ease: "easeIn" } }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border border-line bg-surface p-4">
              <FileDrop
                inputId={inputId}
                onDropFiles={(list) => applyFiles([...files, ...Array.from(list)])}
                hint="Imagens, SVG, MP4, WebM ou áudio · até 30 arquivos de 50 MB"
              />
              <SelectedFiles files={files} onRemove={(i) => applyFiles(files.filter((_, j) => j !== i))} />
              <div className="grid gap-3 sm:grid-cols-[14rem_auto] sm:items-end sm:justify-between">
                <div>
                  <label htmlFor={`${inputId}-kind`} className={LABEL_CLASS}>
                    Tipo de arquivo
                  </label>
                  <select id={`${inputId}-kind`} name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={INPUT_CLASS}>
                    {KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit" variant="secondary" disabled={pending || files.length === 0}>
                  {pending ? "Enviando…" : files.length > 0 ? `Enviar ${plural(files.length, "arquivo", "arquivos")}` : "Enviar"}
                </Button>
              </div>
              <FormError message={state?.error} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!open && state?.message && (
          <motion.p
            key={state.message}
            role="status"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: DURATION.quick, ease: EASE_OUT } }}
            exit={{ opacity: 0, transition: { duration: DURATION.instant } }}
            className="text-[13px] text-ok"
          >
            {state.message}
          </motion.p>
        )}
      </AnimatePresence>
    </form>
  );
}

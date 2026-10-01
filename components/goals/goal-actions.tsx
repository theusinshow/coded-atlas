"use client";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Check, Copy, Download, FolderOpen, Loader2, RefreshCw, Shuffle, X } from "lucide-react";
import { buildGoalKitAction, recaptureAction, removePieceAction, revealExportAction, saveKitToFolderAction, swapPieceAction, type GoalActionState } from "@/app/actions/goals";
import { renderKitAction, type KitActionState } from "@/app/actions/kits";
import { JobFollower } from "@/components/atlas/job-follower";
import { Button, buttonClass, FormError } from "@/components/ui/primitives";

/**
 * Ações do caminho guiado (Atlas 3.3). Cada botão é um clique explícito; o trabalho
 * pesado vira job e o progresso aparece no próprio passo (JobFollower → refresh).
 */

type Variant = "primary" | "secondary";

/** Segue um job até o fim e então recarrega a tela do servidor (o passo muda de estado). */
function useFinishedJob(jobId: string | null | undefined) {
  const [finished, setFinished] = useState<string | null>(null);
  return { running: !!jobId && finished !== jobId, done: () => setFinished(jobId ?? null) };
}

/** Passo 1: captura completa do endereço do site. */
export function RecaptureButton({ projectId, variant, label, busyJobId }: { projectId: string; variant: Variant; label: string; busyJobId: string | null }) {
  const [state, action, pending] = useActionState<GoalActionState, FormData>(recaptureAction.bind(null, projectId), null);
  const jobId = state?.jobId ?? busyJobId;
  const { running, done } = useFinishedJob(jobId);
  return (
    <div className="space-y-3">
      <form action={action}>
        <Button variant={variant} type="submit" disabled={pending || running}>
          {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />}
          {label}
        </Button>
      </form>
      <FormError message={state?.error} />
      {jobId && running && <JobFollower key={jobId} jobId={jobId} onDone={done} />}
      {running && <p className="text-[12px] text-cbm-gray-400">A captura completa grava também o vídeo de rolagem e leva alguns minutos. Pode sair desta tela: ela continua.</p>}
    </div>
  );
}

/** Passo 2: monta (ou remonta) o conjunto de peças do objetivo. */
export function BuildKitButton({ projectId, goalId, variant, label, disabled }: { projectId: string; goalId: string; variant: Variant; label: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState<GoalActionState, FormData>(buildGoalKitAction.bind(null, projectId, goalId), null);
  return (
    <div className="space-y-2">
      <form action={action}>
        <Button variant={variant} type="submit" disabled={disabled || pending}>
          {pending && <Loader2 size={14} className="animate-spin" aria-hidden />}
          {pending ? "Montando…" : label}
        </Button>
      </form>
      <FormError message={state?.error} />
    </div>
  );
}

/** Passo 2: trocar visual / tirar uma peça. */
export function PieceActions({ kitId, itemId, label, canSwap, canRemove, locked }: { kitId: string; itemId: string; label: string; canSwap: boolean; canRemove: boolean; locked: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setError(null);
      const result = await fn();
      if (result.error) setError(result.error);
      else router.refresh();
    });
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {canSwap && (
          <button type="button" disabled={locked || pending} onClick={() => run(() => swapPieceAction(kitId, itemId))} className="inline-flex h-10 sm:h-8 items-center gap-1.5 text-[12px] text-accent hover:text-accent-bright disabled:opacity-40" aria-label={`Trocar visual de ${label}`}>
            {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Shuffle size={14} aria-hidden />}
            Trocar visual
          </button>
        )}
        {canRemove && (
          <button type="button" disabled={locked || pending} onClick={() => run(() => removePieceAction(kitId, itemId))} className="inline-flex h-10 sm:h-8 items-center gap-1.5 text-[12px] text-cbm-gray-400 hover:text-cbm-white disabled:opacity-40" aria-label={`Tirar ${label}`}>
            <X size={14} aria-hidden />
            Tirar
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-[12px] text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

/** Passo 3: gerar todos os arquivos (imagens PNG + vídeos MP4, qualidade final). */
export function GenerateButton({ kitId, hasVideo, busyJobId, variant, label }: { kitId: string; hasVideo: boolean; busyJobId: string | null; variant: Variant; label: string }) {
  const [state, action, pending] = useActionState<KitActionState, FormData>(renderKitAction, null);
  const jobId = state?.jobId ?? busyJobId;
  const { running, done } = useFinishedJob(jobId);
  return (
    <div className="space-y-3">
      <form action={action}>
        <input type="hidden" name="kitId" value={kitId} />
        <input type="hidden" name="image" value="png" />
        {hasVideo && <input type="hidden" name="video" value="on" />}
        <input type="hidden" name="quality" value="final" />
        <Button variant={variant} type="submit" disabled={pending || running}>
          {(pending || running) && <Loader2 size={14} className="animate-spin" aria-hidden />}
          {running ? "Gerando…" : label}
        </Button>
      </form>
      <FormError message={state?.error} />
      {jobId && running && <JobFollower key={jobId} jobId={jobId} onDone={done} />}
      {running && hasVideo && <p className="text-[12px] text-cbm-gray-400">O vídeo é a parte mais lenta. Pode sair desta tela: a geração continua.</p>}
    </div>
  );
}

/** Passo 4: salvar os arquivos na pasta de entregas. */
export function SaveToFolderButton({ kitId, label }: { kitId: string; label: string }) {
  const [state, action, pending] = useActionState<GoalActionState, FormData>(saveKitToFolderAction.bind(null, kitId), null);
  const { running, done } = useFinishedJob(state?.jobId);
  return (
    <div className="space-y-3">
      <form action={action}>
        <Button type="submit" disabled={pending || running}>
          {pending || running ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <FolderOpen size={14} aria-hidden />}
          {label}
        </Button>
      </form>
      <FormError message={state?.error} />
      {state?.jobId && running && <JobFollower key={state.jobId} jobId={state.jobId} onDone={done} />}
    </div>
  );
}

/** Abre a pasta da entrega no Explorador; o caminho vem do registro, nunca do navegador. */
export function RevealFolderButton({ exportId, primary = false }: { exportId: string; primary?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await revealExportAction(exportId);
            if (result.error) setError(result.error);
          })
        }
        className={primary ? buttonClass("secondary", "md") : "inline-flex h-10 sm:h-8 items-center gap-1.5 text-[12px] text-accent hover:text-accent-bright disabled:opacity-40"}
      >
        {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <FolderOpen size={14} aria-hidden />}
        Abrir pasta
      </button>
      {error && (
        <span role="alert" className="text-[12px] text-bad">
          {error}
        </span>
      )}
    </span>
  );
}

/** Caminho da pasta por extenso, com "copiar". */
export function CopyPath({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <code className="min-w-0 break-all text-[12px] text-cbm-gray-200">{path}</code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(path);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            setCopied(false);
          }
        }}
        className="inline-flex h-10 sm:h-8 shrink-0 items-center gap-1 text-[12px] text-cbm-gray-400 hover:text-cbm-white"
        aria-label="Copiar caminho da pasta"
      >
        {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
        {copied ? "Copiado" : "Copiar"}
      </button>
    </span>
  );
}

/** Link de download com ícone (arquivo único ou ZIP). */
export function DownloadLink({ href, children, primary = false }: { href: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <a href={href} className={primary ? buttonClass("primary", "md") : "inline-flex h-10 sm:h-8 items-center gap-1.5 text-[12px] text-accent hover:text-accent-bright"}>
      <Download size={14} aria-hidden />
      {children}
    </a>
  );
}

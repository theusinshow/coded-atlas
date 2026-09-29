"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { JobStatusBadge, jobOutcome, type JobStatusValue } from "@/components/ui/status";
import { DURATION, EASE_OUT } from "@/components/ui/motion";

interface JobView {
  id: string;
  /** O SSE manda o job inteiro; o tipo decide a linha de resultado. */
  type?: string;
  status: JobStatusValue;
  progress: number;
  message: string | null;
  error: { code: string; message: string } | null;
  result: Record<string, unknown> | null;
}

const TERMINAL = new Set<JobStatusValue>(["completed", "failed", "cancelled"]);

/** Troca de estado (rodando → concluído) e de linha (progresso → resultado): crossfade curto. */
const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DURATION.quick, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: 0.1, ease: "easeIn" as const } },
};

/**
 * Acompanha um job pelo SSE (estado lido do SQLite). Fechar a página não afeta o
 * trabalho — só o botão Cancelar interrompe. Ao terminar, atualiza a tela do servidor.
 */
export function JobFollower({ jobId, onDone }: { jobId: string; onDone?: (status: JobStatusValue, result: Record<string, unknown> | null) => void }) {
  const router = useRouter();
  const [job, setJob] = useState<JobView | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const es = new EventSource(`/api/atlas/jobs/${jobId}/events`);
    es.onmessage = (event: MessageEvent<string>) => {
      const next = JSON.parse(event.data) as JobView;
      setJob(next);
      if (TERMINAL.has(next.status)) {
        es.close();
        router.refresh();
        done.current?.(next.status, next.result ?? null);
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [jobId, router]);

  async function cancel() {
    await fetch(`/api/atlas/jobs/${jobId}/cancel`, { method: "POST" });
  }

  if (!job) return <p className="text-[12px] text-cbm-gray-400">Conectando…</p>;
  const active = !TERMINAL.has(job.status);
  return (
    <div className="border border-line bg-surface p-3 space-y-2" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={job.status} {...fade} className="inline-flex">
            <JobStatusBadge status={job.status} />
          </motion.span>
        </AnimatePresence>
        {active && <span className="text-[12px] text-cbm-gray-200 tabular-nums">{job.progress}%</span>}
      </div>
      <div className="h-1 bg-surface-2 overflow-hidden">
        <div
          className={`h-full transition-[width,background-color] duration-500 ${job.status === "failed" ? "bg-bad" : job.status === "cancelled" ? "bg-cbm-gray-600" : job.status === "completed" ? "bg-ok" : "bg-signal"}`}
          style={{ width: `${job.status === "completed" ? 100 : job.progress}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-3 min-h-5">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={active ? "progress" : "outcome"} {...fade} className={`text-[12px] truncate ${job.status === "failed" ? "text-bad" : "text-cbm-gray-400"}`}>
            {jobOutcome({ ...job, type: job.type ?? "" })}
          </motion.p>
        </AnimatePresence>
        {active && (
          <button type="button" onClick={cancel} className="h-8 shrink-0 px-2 text-[12px] text-cbm-gray-400 hover:text-bad">
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

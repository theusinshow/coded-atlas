"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { JobStatusBadge, type JobStatusValue } from "@/components/ui/status";

interface JobView {
  id: string;
  status: JobStatusValue;
  progress: number;
  message: string | null;
  error: { code: string; message: string } | null;
  result: Record<string, unknown> | null;
}

const TERMINAL = new Set<JobStatusValue>(["completed", "failed", "cancelled"]);

/**
 * Acompanha um job pelo SSE (estado lido do SQLite). Fechar a página não afeta o
 * job — só o botão Cancelar interrompe. Ao terminar, atualiza a tela do servidor.
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

  if (!job) return <p className="text-[12px] text-cbm-gray-400">Conectando ao job…</p>;
  const active = !TERMINAL.has(job.status);
  return (
    <div className="border border-line bg-surface p-3 space-y-2" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <JobStatusBadge status={job.status} />
        <span className="text-[12px] font-mono text-accent tabular-nums">{job.progress}%</span>
      </div>
      <div className="h-1 bg-surface-2 overflow-hidden">
        <div
          className={`h-full transition-[width] duration-500 ${job.status === "failed" ? "bg-bad" : job.status === "cancelled" ? "bg-cbm-gray-600" : "bg-signal"}`}
          style={{ width: `${job.progress}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-3 min-h-5">
        <p className="text-[12px] text-cbm-gray-400 truncate">{job.error?.message ?? job.message ?? ""}</p>
        {active && (
          <button type="button" onClick={cancel} className="text-[11px] font-medium uppercase tracking-[0.22em] text-cbm-gray-400 hover:text-bad">
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

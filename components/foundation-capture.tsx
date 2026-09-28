"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/validation/slugify";

const INPUT =
  "w-full bg-surface border border-line text-zinc-100 text-sm px-3 py-2.5 " +
  "placeholder:text-zinc-500 focus:outline-none focus:border-accent transition-colors";
const LABEL = "block text-[11px] font-mono text-zinc-400 tracking-wider uppercase mb-1.5";

/** Espelho mínimo do Job exposto pela API (só o que a tela usa). */
interface JobView {
  id: string;
  status: "queued" | "preparing" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  message: string | null;
  error: { code: string; message: string } | null;
}

const STATUS_LABEL: Record<JobView["status"], string> = {
  queued: "Na fila",
  preparing: "Preparando",
  running: "Capturando",
  completed: "Concluído",
  failed: "Falhou",
  cancelled: "Cancelado",
};

const TERMINAL = new Set<JobView["status"]>(["completed", "failed", "cancelled"]);

/**
 * Enfileira uma captura no pipeline 2.x e acompanha o job por SSE. Fechar a aba
 * não cancela nada: o job vive no worker; só o botão Cancelar interrompe.
 */
export function FoundationCapture() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [job, setJob] = useState<JobView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const source = useRef<EventSource | null>(null);

  useEffect(() => () => source.current?.close(), []);

  function follow(jobId: string) {
    source.current?.close();
    const es = new EventSource(`/api/atlas/jobs/${jobId}/events`);
    source.current = es;
    es.onmessage = (event: MessageEvent<string>) => {
      const next = JSON.parse(event.data) as JobView;
      setJob(next);
      if (TERMINAL.has(next.status)) {
        es.close();
        router.refresh();
      }
    };
    es.onerror = () => es.close();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/atlas/captures", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim(), name: name.trim(), slug: slugify(name), category: "Site" }),
      });
      const data = (await res.json()) as { jobId?: string; error?: { message: string } };
      if (!res.ok || !data.jobId) throw new Error(data.error?.message ?? "Falha ao enfileirar.");
      setJob({ id: data.jobId, status: "queued", progress: 0, message: null, error: null });
      follow(data.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!job) return;
    await fetch(`/api/atlas/jobs/${job.id}/cancel`, { method: "POST" });
  }

  const active = job !== null && !TERMINAL.has(job.status);

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-[1fr_14rem_auto] items-end">
        <div>
          <label htmlFor="fc-url" className={LABEL}>URL</label>
          <input id="fc-url" className={INPUT} type="url" required placeholder="https://site.com"
            value={url} onChange={(e) => setUrl(e.target.value)} disabled={active} />
        </div>
        <div>
          <label htmlFor="fc-name" className={LABEL}>Nome</label>
          <input id="fc-name" className={INPUT} required placeholder="Nome do projeto"
            value={name} onChange={(e) => setName(e.target.value)} disabled={active} />
        </div>
        <button type="submit" disabled={busy || active || !slugify(name)}
          className="h-[42px] px-5 bg-accent text-zinc-950 text-sm font-medium hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          Enfileirar
        </button>
      </form>

      {error && <p role="alert" className="text-[13px] text-bad">{error}</p>}

      {job && (
        <div className="border border-line bg-surface p-4 space-y-3" aria-live="polite">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm font-medium text-zinc-100">
              {STATUS_LABEL[job.status]}
              <span className="ml-2 text-[11px] font-mono text-zinc-500">{job.id}</span>
            </span>
            <span className="text-[13px] font-mono text-accent tabular-nums">{job.progress}%</span>
          </div>
          <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
            <div className={["h-full rounded-full transition-[width] duration-500 ease-out",
              job.status === "failed" ? "bg-bad" : job.status === "cancelled" ? "bg-zinc-500" : "bg-accent"].join(" ")}
              style={{ width: `${job.progress}%` }} />
          </div>
          <div className="flex items-center justify-between gap-4 min-h-[1.5rem]">
            <p className="text-[12px] text-zinc-400">{job.error?.message ?? job.message ?? ""}</p>
            {active && (
              <button type="button" onClick={cancel}
                className="text-[12px] font-mono uppercase tracking-wider text-zinc-400 hover:text-bad transition-colors">
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

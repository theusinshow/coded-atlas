/** Estados reais de job/projeto (atlas.job.* no design system). Status só em estado — nunca decoração. */
export type JobStatusValue = "queued" | "preparing" | "running" | "completed" | "failed" | "cancelled";

const JOB: Record<JobStatusValue, { label: string; className: string }> = {
  queued: { label: "Na fila", className: "text-zinc-300 border-line" },
  preparing: { label: "Preparando", className: "text-accent border-accent/50" },
  running: { label: "Em execução", className: "text-accent border-accent/50" },
  completed: { label: "Concluído", className: "text-ok border-ok/40" },
  failed: { label: "Falhou", className: "text-bad border-bad/50" },
  cancelled: { label: "Cancelado", className: "text-zinc-500 border-line" },
};

export function JobStatusBadge({ status }: { status: JobStatusValue }) {
  const s = JOB[status];
  return (
    <span className={`inline-flex items-center gap-1.5 border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider ${s.className}`}>
      {(status === "running" || status === "preparing") && (
        <span className="w-1.5 h-1.5 bg-accent animate-atlas-pulse" aria-hidden />
      )}
      {s.label}
    </span>
  );
}

export const JOB_TYPE_LABEL: Record<string, string> = {
  capture: "Captura",
  import: "Importação v1",
  render: "Render",
  plan: "Plano criativo",
  export: "Exportação",
};

export function ProjectStatusBadge({ status }: { status: "active" | "archived" }) {
  if (status === "active") return null;
  return (
    <span className="inline-flex border border-line px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-zinc-400">
      Arquivado
    </span>
  );
}

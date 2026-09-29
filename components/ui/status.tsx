/** Estados reais de job/projeto (atlas.job.* no design system). Status só em estado — nunca decoração. */
export type JobStatusValue = "queued" | "preparing" | "running" | "completed" | "failed" | "cancelled";

const JOB: Record<JobStatusValue, { label: string; className: string }> = {
  queued: { label: "Na fila", className: "text-cbm-gray-200 border-line" },
  preparing: { label: "Preparando", className: "text-accent border-accent/50" },
  running: { label: "Em execução", className: "text-accent border-accent/50" },
  completed: { label: "Concluído", className: "text-ok border-ok/40" },
  failed: { label: "Falhou", className: "text-bad border-bad/50" },
  cancelled: { label: "Cancelado", className: "text-cbm-gray-400 border-line" },
};

export function JobStatusBadge({ status }: { status: JobStatusValue }) {
  const s = JOB[status];
  return (
    <span className={`inline-flex items-center gap-1.5 border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.22em] ${s.className}`}>
      {(status === "running" || status === "preparing") && (
        <span className="w-1.5 h-1.5 bg-signal animate-atlas-pulse" aria-hidden />
      )}
      {s.label}
    </span>
  );
}

export const JOB_TYPE_LABEL: Record<string, string> = {
  capture: "Captura",
  import: "Importação",
  render: "Render",
  plan: "Plano criativo",
  copy: "Redação do case",
  export: "Exportação",
  diff: "Comparação visual",
};

export function ProjectStatusBadge({ status }: { status: "active" | "archived" }) {
  if (status === "active") return null;
  return (
    <span className="inline-flex border border-line px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.22em] text-cbm-gray-400">
      Arquivado
    </span>
  );
}

const count = (v: unknown): number | null => (Array.isArray(v) ? v.length : typeof v === "number" ? v : null);
const n = (value: number, one: string, many: string) => `${value.toLocaleString("pt-BR")} ${value === 1 ? one : many}`;

/**
 * Linha de resultado de um job: terminado mostra o RESULTADO (nunca a mensagem de
 * progresso que sobrou, tipo "Salvando…" ao lado de Concluído); em andamento mostra
 * o progresso; falha mostra o motivo.
 */
export function jobOutcome(job: { type: string; status: JobStatusValue; message: string | null; error: { message: string } | null; result: Record<string, unknown> | null }): string {
  if (job.status === "failed") return `Falhou: ${job.error?.message ?? "erro desconhecido"}`;
  if (job.status === "cancelled") return "Cancelado";
  if (job.status !== "completed") return job.message ?? (job.status === "queued" ? "Na fila" : "Em execução");
  const r = job.result ?? {};
  switch (job.type) {
    case "capture": {
      const c = count(r.assetIds);
      return c !== null ? `${n(c, "imagem capturada", "imagens capturadas")}${r.authenticated ? " · com login" : ""}` : "Captura concluída";
    }
    case "import": {
      const created = count(r.created) ?? 0;
      const refreshed = count(r.refreshed) ?? 0;
      return created + refreshed > 0 ? `${n(created + refreshed, "projeto importado", "projetos importados")}` : "Biblioteca já estava em dia";
    }
    case "render": {
      const c = count(r.count) ?? count(r.outputIds);
      return c !== null ? n(c, "arquivo gerado", "arquivos gerados") : "Render concluído";
    }
    case "plan":
      return "Plano pronto";
    case "copy":
      return "Textos do case escritos";
    case "export": {
      const c = count(r.files);
      return c !== null ? `Entrega pronta · ${n(c, "arquivo", "arquivos")}` : "Entrega pronta";
    }
    case "diff":
      return typeof r.percent === "number" ? `${r.percent.toLocaleString("pt-BR")}% diferente` : "Comparação pronta";
    default:
      return "Concluído";
  }
}

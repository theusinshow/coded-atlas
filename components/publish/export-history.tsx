import type { ExportRecord } from "@/src/core/publish/export";

const DESTINATION_LABEL = { download: "ZIP", folder: "Pasta local", github: "GitHub" } as const;

type ViewStatus = ExportRecord["status"] | "cancelled";

const STATUS: Record<ViewStatus, { label: string; className: string }> = {
  queued: { label: "Na fila", className: "text-zinc-300 border-line" },
  running: { label: "Entregando", className: "text-accent border-accent/50" },
  delivered: { label: "Entregue", className: "text-ok border-ok/40" },
  failed: { label: "Falhou", className: "text-bad border-bad/50" },
  cancelled: { label: "Cancelado", className: "text-zinc-500 border-line" },
};

function bytes(n: number): string {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Histórico de entregas. `jobStatus` corrige registros cujo job morreu antes de
 * começar (cancelado/falhou na fila): o registro fica "na fila" para sempre sem isso.
 */
export function ExportHistory({ records, jobStatus }: { records: ExportRecord[]; jobStatus: Record<string, string> }) {
  return (
    <ul className="divide-y divide-line border border-line" data-export-history>
      {records.map((r) => {
        const job = r.jobId ? jobStatus[r.jobId] : undefined;
        const status: ViewStatus = (r.status === "queued" || r.status === "running") && (job === "failed" || job === "cancelled") ? (job === "failed" ? "failed" : "cancelled") : r.status;
        const s = STATUS[status];
        return (
          <li key={r.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center" data-export={r.id} data-export-status={status}>
            <div className="min-w-0">
              <p className="text-[13px] text-zinc-100 truncate">{r.name}</p>
              <p className="text-[11px] font-mono text-zinc-500">
                {DESTINATION_LABEL[r.destination]} · {r.outputIds.length} {r.outputIds.length === 1 ? "peça" : "peças"}
                {r.result.files ? ` · ${r.result.files} arquivos` : ""}
                {r.result.archive ? ` · ${bytes(r.result.archive.byteSize)}` : ""} · {new Date(r.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
              </p>
              {r.result.folder && <p className="text-[11px] font-mono text-zinc-400 break-all">pasta: {r.result.folder}/</p>}
              {r.result.error && <p className="text-[11px] text-bad">{r.result.error}</p>}
            </div>
            <div className="flex items-center gap-3 justify-self-start sm:justify-self-end">
              <span className={`inline-flex border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider ${s.className}`}>{s.label}</span>
              {status === "delivered" && r.result.archive && (
                <a href={`/api/atlas/exports/${r.id}/file`} className="text-[11px] font-mono uppercase tracking-wider text-accent hover:text-accent-bright">
                  Baixar (.zip)
                </a>
              )}
              {status === "delivered" && r.result.commitUrl && (
                <a href={r.result.commitUrl} target="_blank" rel="noreferrer" className="text-[11px] font-mono uppercase tracking-wider text-accent hover:text-accent-bright">
                  Ver commit →
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Checkbox de seleção de uma peça, ligado ao formulário de entrega pelo atributo `form`. */
export function PickOutput({ formId, outputId }: { formId: string; outputId: string }) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-100 cursor-pointer">
      <input type="checkbox" name="outputId" value={outputId} form={formId} className="accent-[var(--color-accent)]" />
      Incluir
    </label>
  );
}

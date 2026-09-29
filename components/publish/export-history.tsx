import { Download, ExternalLink } from "lucide-react";
import { formatBytes, plural, relativeTime } from "@/components/ui/format";
import type { ExportRecord } from "@/src/core/publish/export";

const DESTINATION_LABEL = { download: "ZIP para baixar", folder: "Pasta de entregas", github: "GitHub" } as const;

type ViewStatus = ExportRecord["status"] | "cancelled";

const STATUS: Record<ViewStatus, { label: string; className: string }> = {
  queued: { label: "Na fila", className: "text-cbm-gray-200 border-line" },
  running: { label: "Entregando", className: "text-cbm-white border-cbm-gray-400" },
  delivered: { label: "Entregue", className: "text-ok border-ok/40" },
  failed: { label: "Falhou", className: "text-bad border-bad/50" },
  cancelled: { label: "Cancelado", className: "text-cbm-gray-400 border-line" },
};

const LINK = "inline-flex h-10 items-center gap-1.5 text-[12px] text-accent transition-colors hover:text-accent-bright sm:h-8";

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
        const detail = [
          DESTINATION_LABEL[r.destination],
          plural(r.outputIds.length, "peça", "peças"),
          r.result.files ? plural(r.result.files, "arquivo", "arquivos") : null,
          r.result.archive ? formatBytes(r.result.archive.byteSize) : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <li key={r.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" data-export={r.id} data-export-status={status}>
            <div className="min-w-0">
              <p className="truncate text-[13px] text-cbm-gray-100">{r.name}</p>
              <p className="text-[12px] text-cbm-gray-400">
                {detail} ·{" "}
                <time dateTime={r.createdAt} title={new Date(r.createdAt).toLocaleString("pt-BR")}>
                  {relativeTime(r.createdAt)}
                </time>
              </p>
              {r.result.folder && <p className="break-words text-[12px] text-cbm-gray-400">Salvo na pasta: {r.result.folder}/</p>}
              {r.result.error && <p className="text-[12px] text-bad">{r.result.error}</p>}
            </div>
            <div className="flex items-center gap-4 justify-self-start sm:justify-self-end">
              <span className={`inline-flex border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.22em] ${s.className}`}>{s.label}</span>
              {status === "delivered" && r.result.archive && (
                <a href={`/api/atlas/exports/${r.id}/file`} className={LINK}>
                  <Download size={14} aria-hidden />
                  Baixar (.zip)
                </a>
              )}
              {status === "delivered" && r.result.commitUrl && (
                <a href={r.result.commitUrl} target="_blank" rel="noreferrer" className={LINK}>
                  Ver commit
                  <ExternalLink size={14} aria-hidden />
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

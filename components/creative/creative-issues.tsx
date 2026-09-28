import type { CreativeIssue } from "@/src/core/creative/guardrails";

/** Resultado dos guardrails criativos: avisa antes do render, nunca bloqueia. */
export function CreativeIssues({ issues, onSelect, compact = false }: { issues: CreativeIssue[]; onSelect?: (layerId: string) => void; compact?: boolean }) {
  if (issues.length === 0) {
    return compact ? null : <p className="text-[11px] text-zinc-600" data-creative-issues="0">Checagens criativas: tudo certo.</p>;
  }
  const warnings = issues.filter((i) => i.severity === "warning").length;
  return (
    <div className="space-y-1.5" data-creative-issues={issues.length}>
      <p className="text-[10px] font-mono uppercase tracking-wider text-warn">
        {warnings > 0 ? `${warnings} aviso(s)` : "Sugestões"} · checagens criativas
      </p>
      <ul className="space-y-1">
        {issues.slice(0, compact ? 3 : 12).map((issue, i) => (
          <li key={`${issue.code}-${issue.layerId}-${i}`} className="text-[11px] leading-snug text-zinc-400 flex gap-1.5">
            <span className={issue.severity === "warning" ? "text-warn" : "text-zinc-600"} aria-hidden>
              {issue.severity === "warning" ? "⚠" : "·"}
            </span>
            {onSelect && issue.layerId ? (
              <button type="button" onClick={() => onSelect(issue.layerId!)} className="text-left hover:text-zinc-100 underline decoration-dotted underline-offset-2">
                {issue.message}
              </button>
            ) : (
              <span>{issue.message}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

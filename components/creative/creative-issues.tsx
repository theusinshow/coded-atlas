import { AlertTriangle, Check, Info } from "lucide-react";
import type { CreativeIssue } from "@/src/core/creative/guardrails";
import { plural } from "@/components/ui/format";

/**
 * Checagens de legibilidade e contraste antes do render: avisam, nunca bloqueiam.
 * Sem nada a dizer, uma linha discreta; só os avisos ganham espaço.
 */
export function CreativeIssues({ issues, onSelect, compact = false }: { issues: CreativeIssue[]; onSelect?: (layerId: string) => void; compact?: boolean }) {
  if (issues.length === 0) {
    return compact ? null : (
      <p className="flex items-center gap-1.5 text-[12px] text-cbm-gray-400" data-creative-issues="0">
        <Check size={14} aria-hidden />
        Sem avisos de leitura ou contraste
      </p>
    );
  }
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const sorted = [...issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "warning" ? -1 : 1));
  return (
    <div className="space-y-1.5" data-creative-issues={issues.length}>
      <p className={`text-[11px] font-medium uppercase tracking-[0.22em] ${warnings > 0 ? "text-warn" : "text-cbm-gray-400"}`}>
        {warnings > 0 ? plural(warnings, "aviso", "avisos") : plural(issues.length, "sugestão", "sugestões")}
      </p>
      <ul className="space-y-1">
        {sorted.slice(0, compact ? 3 : 12).map((issue, i) => {
          const Icon = issue.severity === "warning" ? AlertTriangle : Info;
          return (
            <li key={`${issue.code}-${issue.layerId}-${i}`} className="flex gap-2 text-[12px] leading-snug text-cbm-gray-200">
              <Icon size={14} className={`mt-px shrink-0 ${issue.severity === "warning" ? "text-warn" : "text-cbm-gray-400"}`} aria-hidden />
              {onSelect && issue.layerId ? (
                <button type="button" onClick={() => onSelect(issue.layerId!)} className="text-left hover:text-cbm-white underline decoration-dotted underline-offset-2">
                  {issue.message}
                </button>
              ) : (
                <span>{issue.message}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

"use client";
import { useState, useTransition } from "react";
import { removeSessionAction } from "@/app/actions/projects";
import { FormError, Panel } from "@/components/ui/primitives";

export interface SessionView {
  savedAt: string;
  cookieCount: number;
  domains: string[];
}

/**
 * Captura autenticada: mostra só o resumo da sessão salva (nunca valores) e
 * como criar/remover. O login é manual, num navegador visível (`npm run atlas:login`).
 */
export function SessionPanel({ projectId, slug, session, error }: { projectId: string; slug: string; session: SessionView | null; error?: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(error ?? null);
  const command = `npm run atlas:login -- ${slug}`;

  return (
    <div data-session={session ? "active" : "none"}>
    <Panel className="p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-medium uppercase tracking-[0.22em] text-cbm-gray-400">Sessão autenticada</p>
        <span className={`text-[10px] font-medium uppercase tracking-[0.22em] ${session ? "text-ok" : "text-cbm-gray-400"}`}>{session ? "ativa" : "anônima"}</span>
      </div>
      {session ? (
        <>
          <p className="text-[12px] text-cbm-gray-200">
            As capturas deste projeto entram logadas · {session.cookieCount} cookies · salva em{" "}
            {new Date(session.savedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </p>
          {session.domains.length > 0 && <p className="text-[11px] font-mono text-cbm-gray-400 break-all">{session.domains.join(" · ")}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const result = await removeSessionAction(projectId);
                  setFailure(result?.error ?? null);
                  setMessage(result?.message ?? null);
                })
              }
              className="text-[11px] font-medium uppercase tracking-[0.22em] text-bad hover:opacity-80 disabled:opacity-50"
            >
              {pending ? "Removendo…" : "Remover sessão"}
            </button>
            <span className="text-[11px] text-cbm-gray-400">
              Para renovar, rode de novo <code className="font-mono text-cbm-gray-200">{command}</code>
            </span>
          </div>
        </>
      ) : (
        <p className="text-[12px] text-cbm-gray-400 leading-relaxed">
          Para fotografar páginas internas (app com login), rode no terminal <code className="font-mono text-cbm-gray-200 break-all">{command}</code>, entre no navegador que
          abrir e aperte Enter. A sessão fica só nesta máquina e nunca vai para pacotes ou portfólio.
        </p>
      )}
      {message && <p className="text-[12px] text-ok">{message}</p>}
      <FormError message={failure} />
    </Panel>
    </div>
  );
}

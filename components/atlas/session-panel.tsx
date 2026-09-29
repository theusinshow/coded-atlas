"use client";
import { useState, useTransition } from "react";
import { removeSessionAction } from "@/app/actions/projects";
import { Button, Collapsible, FormError } from "@/components/ui/primitives";

export interface SessionView {
  savedAt: string;
  cookieCount: number;
  domains: string[];
}

/**
 * Captura autenticada, recolhida (é exceção, não o caminho comum): resumo da sessão
 * salva (nunca valores) e como criar/remover. O login é manual, num navegador
 * visível (`npm run atlas:login`).
 */
export function SessionPanel({ projectId, slug, session, error }: { projectId: string; slug: string; session: SessionView | null; error?: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(error ?? null);
  const command = `npm run atlas:login -- ${slug}`;

  return (
    <div data-session={session ? "active" : "none"}>
      <Collapsible title="Capturar páginas com login" meta={session ? "Sessão salva" : undefined} defaultOpen={Boolean(error)}>
        <div className="space-y-3 text-[13px]">
          {session ? (
            <>
              <p className="text-cbm-gray-200">
                As capturas deste projeto entram logadas · {session.cookieCount} cookies · salva em{" "}
                {new Date(session.savedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
              </p>
              {session.domains.length > 0 && <p className="break-words text-[12px] text-cbm-gray-400">{session.domains.join(" · ")}</p>}
              <p className="text-[12px] text-cbm-gray-400">Para renovar, rode de novo no terminal:</p>
              <code className="block overflow-x-auto border border-line bg-base px-3 py-2 font-mono text-[12px] text-cbm-gray-200">{command}</code>
              <Button
                type="button"
                size="sm"
                variant="danger"
                className="h-10 sm:h-8"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const result = await removeSessionAction(projectId);
                    setFailure(result?.error ?? null);
                    setMessage(result?.message ?? null);
                  })
                }
              >
                {pending ? "Removendo…" : "Remover sessão"}
              </Button>
            </>
          ) : (
            <>
              <p className="text-cbm-gray-400">Para fotografar páginas internas, rode no terminal:</p>
              <code className="block overflow-x-auto border border-line bg-base px-3 py-2 font-mono text-[12px] text-cbm-gray-200">{command}</code>
              <p className="text-cbm-gray-400">Entre no navegador que abrir e aperte Enter. A sessão fica só neste computador.</p>
            </>
          )}
          {message && (
            <p role="status" className="text-ok">
              {message}
            </p>
          )}
          <FormError message={failure} />
        </div>
      </Collapsible>
    </div>
  );
}

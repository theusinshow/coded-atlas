"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  GEN_STATUS_EVENT,
  GEN_STATUS_KEY,
  emitGenStatus,
  type GenStatus,
} from "@/lib/gen-status";

function useElapsed(startedAt: number | undefined): string {
  const [sec, setSec] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    setSec(Math.floor((Date.now() - startedAt) / 1000));
    const id = setInterval(
      () => setSec(Math.floor((Date.now() - startedAt) / 1000)),
      5000
    );
    return () => clearInterval(id);
  }, [startedAt]);

  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}min`;
}

export function GenerationToast() {
  const [status, setStatus] = useState<GenStatus | null>(null);
  const [dismissed, setDismissed] = useState<string>(""); // slug+state key

  useEffect(() => {
    const raw = localStorage.getItem(GEN_STATUS_KEY);
    if (raw) {
      try { setStatus(JSON.parse(raw) as GenStatus); } catch {}
    }

    function handler(e: Event) {
      const evt = e as CustomEvent<GenStatus | null>;
      setStatus(evt.detail);
      setDismissed("");
    }

    window.addEventListener(GEN_STATUS_EVENT, handler);
    return () => window.removeEventListener(GEN_STATUS_EVENT, handler);
  }, []);

  // Auto-dismiss success after 10s
  useEffect(() => {
    if (status?.state === "done") {
      const id = setTimeout(() => dismiss(), 10_000);
      return () => clearTimeout(id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.slug, status?.state]);

  const dismiss = useCallback(() => {
    if (!status) return;
    setDismissed(`${status.slug}:${status.state}`);
    if (status.state !== "generating") emitGenStatus(null);
  }, [status]);

  const elapsed = useElapsed(status?.startedAt);

  const key = status ? `${status.slug}:${status.state}` : "";
  if (!status || dismissed === key) return null;

  const isStale =
    status.state === "generating" &&
    Date.now() - status.startedAt > 8 * 60 * 1000;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-50 w-72 border border-zinc-800 bg-zinc-950 shadow-2xl"
    >
      {/* status bar top */}
      <div
        className={`h-0.5 w-full ${
          status.state === "generating"
            ? isStale
              ? "bg-zinc-700"
              : "bg-emerald-500 animate-pulse"
            : status.state === "done"
            ? "bg-emerald-500"
            : "bg-red-700"
        }`}
      />

      <div className="px-4 py-3 space-y-2">
        {/* header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {status.state === "generating" && !isStale && (
              <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mt-px" />
            )}
            {status.state === "generating" && isStale && (
              <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-zinc-600 mt-px" />
            )}
            {status.state === "done" && (
              <span className="shrink-0 text-emerald-400 text-xs leading-none">✓</span>
            )}
            {status.state === "error" && (
              <span className="shrink-0 text-red-400 text-xs leading-none">✗</span>
            )}

            <p className="text-[11px] font-mono text-zinc-300 truncate">
              {status.state === "generating" && !isStale && "Gerando..."}
              {status.state === "generating" && isStale && "Interrompido?"}
              {status.state === "done" && "Catálogo gerado"}
              {status.state === "error" && "Falhou"}
            </p>
          </div>

          {status.state !== "generating" && (
            <button
              onClick={dismiss}
              aria-label="Fechar"
              className="shrink-0 text-zinc-600 hover:text-zinc-400 transition-colors text-xs leading-none cursor-pointer"
            >
              ×
            </button>
          )}
        </div>

        {/* project name */}
        <p className="text-[10px] font-mono text-zinc-500 truncate pl-3.5">
          {status.name}{" "}
          <span className="text-zinc-700">/ {status.slug}</span>
        </p>

        {/* footer row */}
        <div className="pl-3.5 flex items-center justify-between gap-2">
          {status.state === "generating" && (
            <>
              <span className="text-[9px] font-mono text-zinc-600">
                {isStale
                  ? "Pode ter sido interrompido — verifique"
                  : `há ${elapsed}`}
              </span>
              <Link
                href="/projects"
                className="text-[9px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors uppercase tracking-wider"
              >
                projetos →
              </Link>
            </>
          )}

          {status.state === "done" && status.projectUrl && (
            <>
              <span className="text-[9px] font-mono text-zinc-600">
                gerado em {elapsed}
              </span>
              <Link
                href={status.projectUrl}
                className="text-[9px] font-mono text-emerald-500 hover:text-emerald-400 transition-colors uppercase tracking-wider"
              >
                ver catálogo →
              </Link>
            </>
          )}

          {status.state === "error" && (
            <span className="text-[9px] font-mono text-zinc-500 leading-relaxed">
              {status.errorMessage ?? "Erro desconhecido"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

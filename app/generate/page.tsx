"use client";
import { useState, useRef } from "react";
import Link from "next/link";
import type {
  ProjectInput,
  ProgressEvent,
  ResultEvent,
  AtlasErrorPayload,
} from "@/lib/types";
import { emitGenStatus } from "@/lib/gen-status";
import { UrlInput } from "@/components/url-input";
import { GenerationStatus } from "@/components/generation-status";

type GenState = "idle" | "generating" | "done" | "error";

export default function GeneratePage() {
  const [genState, setGenState]   = useState<GenState>("idle");
  const [events,   setEvents]     = useState<ProgressEvent[]>([]);
  const [result,   setResult]     = useState<ResultEvent | null>(null);
  const [error,    setError]      = useState<AtlasErrorPayload | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function generate(input: ProjectInput) {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const startedAt = Date.now();

    setGenState("generating");
    setEvents([]);
    setResult(null);
    setError(null);

    emitGenStatus({ state: "generating", slug: input.slug, name: input.name, startedAt });

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: ctrl.signal,
      });

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const ev = JSON.parse(part.slice(6)) as
            | ProgressEvent
            | ResultEvent
            | AtlasErrorPayload;

          if (ev.step === "done") {
            const r = ev as ResultEvent;
            setResult(r);
            setGenState("done");
            emitGenStatus({
              state: "done",
              slug: input.slug,
              name: input.name,
              projectUrl: r.projectUrl,
              startedAt,
            });
          } else if (ev.step === "error") {
            const e = ev as AtlasErrorPayload;
            setError(e);
            setGenState("error");
            emitGenStatus({
              state: "error",
              slug: input.slug,
              name: input.name,
              errorMessage: e.message,
              startedAt,
            });
          } else {
            setEvents(prev => [...prev, ev as ProgressEvent]);
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      const isServerDown = err instanceof TypeError;
      const msg = isServerDown
        ? "Servidor de desenvolvimento não respondeu. Reinicie o start.bat e tente novamente."
        : "Falha de conexão inesperada. Verifique o terminal do servidor.";
      setError({ step: "error", code: isServerDown ? "SERVER_DOWN" : "UNKNOWN", message: msg });
      setGenState("error");
      emitGenStatus({ state: "error", slug: input.slug, name: input.name, errorMessage: msg, startedAt });
    }
  }

  function reset() {
    abortRef.current?.abort();
    setGenState("idle");
    setEvents([]);
    setResult(null);
    setError(null);
  }

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="max-w-xl mx-auto">
        {/* ── Header ── */}
        <header className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <Link
              href="/"
              className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest hover:text-zinc-400 transition-colors"
            >
              Coded by M
            </Link>
            <span className="text-zinc-700">·</span>
            <Link
              href="/projects"
              className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest hover:text-zinc-400 transition-colors"
            >
              Atlas
            </Link>
          </div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">
            Gerar Catálogo
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Transforme uma URL em um catálogo visual de projeto.
          </p>
        </header>

        {/* ── Idle: formulário ── */}
        {genState === "idle" && <UrlInput onSubmit={generate} />}

        {/* ── Generating: progresso ── */}
        {genState === "generating" && <GenerationStatus events={events} />}

        {/* ── Done: progresso + sucesso ── */}
        {genState === "done" && result && (
          <div className="space-y-8">
            <GenerationStatus events={events} done />

            <div className="border border-zinc-800 bg-zinc-900/40 p-5 space-y-5">
              <div className="flex items-start gap-3">
                <span className="text-emerald-400 shrink-0 mt-0.5 text-lg leading-none">✓</span>
                <div>
                  <p className="text-zinc-100 text-sm font-medium">
                    Catálogo gerado com sucesso.
                  </p>
                  <p className="text-zinc-500 text-xs font-mono mt-1">
                    {result.catalog.project.name}
                    {" "}
                    <span className="text-zinc-700">/ {result.catalog.project.slug}</span>
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <a
                  href={result.projectUrl}
                  className="px-5 py-2.5 bg-zinc-100 text-zinc-900 text-sm font-medium hover:bg-white transition-colors cursor-pointer"
                >
                  Ver catálogo →
                </a>
                <button
                  onClick={reset}
                  className="px-5 py-2.5 border border-zinc-700 text-zinc-400 text-sm hover:border-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  Gerar outro
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {genState === "error" && error && (
          <div className="space-y-6">
            <div className="border border-zinc-800 bg-zinc-900/40 p-5">
              <div className="flex items-start gap-3">
                <span className="text-red-400 shrink-0 mt-0.5 text-lg leading-none">✗</span>
                <div>
                  <p className="text-zinc-100 text-sm font-medium">
                    Não foi possível gerar o catálogo.
                  </p>
                  <p className="text-zinc-400 text-sm mt-1">{error.message}</p>
                  {error.code && (
                    <p className="text-zinc-700 text-[11px] font-mono mt-2">
                      código: {error.code}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={reset}
              className="px-5 py-2.5 border border-zinc-700 text-zinc-400 text-sm hover:border-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              Tentar novamente
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

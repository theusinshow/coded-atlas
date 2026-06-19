"use client";
import { useState } from "react";

interface Props {
  slug: string;
  existingPath?: string;
}

export function CaseDraftSection({ slug, existingPath }: Props) {
  const [state, setState] = useState<"idle" | "generating" | "done" | "error">(
    existingPath ? "done" : "idle"
  );
  const [casePath, setCasePath] = useState<string | null>(existingPath ?? null);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleGenerate() {
    setState("generating");
    setErrorMsg("");
    try {
      const res = await fetch("/api/case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });

      const data = (await res.json()) as { path?: string; error?: string };

      if (!res.ok) {
        throw new Error(data.error ?? "Erro desconhecido");
      }

      setCasePath(data.path!);
      setState("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro desconhecido");
      setState("error");
    }
  }

  return (
    <section aria-label="Rascunho de case">
      <h2 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-4">
        Rascunho de Case
      </h2>

      {state === "idle" && (
        <div className="border border-zinc-800 p-5 space-y-4">
          <p className="text-sm text-zinc-400 leading-relaxed">
            Gera um{" "}
            <code className="text-zinc-300 font-mono text-xs bg-zinc-900 px-1 py-0.5">
              case-draft.mdx
            </code>{" "}
            com todas as capturas, inspeção e metadados organizados em estrutura de case.
          </p>
          <button
            onClick={handleGenerate}
            className="px-5 py-2.5 border border-zinc-700 text-zinc-300 text-sm hover:border-zinc-500 hover:text-zinc-100 transition-colors cursor-pointer"
          >
            Gerar rascunho →
          </button>
        </div>
      )}

      {state === "generating" && (
        <div className="border border-zinc-800 p-5">
          <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest animate-pulse">
            Gerando case-draft.mdx...
          </p>
        </div>
      )}

      {state === "done" && casePath && (
        <div className="border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
          <div className="flex items-start gap-3">
            <span className="text-emerald-400 text-lg leading-none shrink-0">✓</span>
            <div>
              <p className="text-zinc-100 text-sm font-medium">Rascunho gerado.</p>
              <p className="text-[11px] font-mono text-zinc-600 mt-0.5 break-all">{casePath}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <a
              href={casePath}
              download
              className="px-5 py-2.5 bg-zinc-100 text-zinc-900 text-sm font-medium hover:bg-white transition-colors cursor-pointer"
            >
              Baixar .mdx →
            </a>
            <button
              onClick={handleGenerate}
              className="px-5 py-2.5 border border-zinc-700 text-zinc-500 text-sm hover:border-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            >
              Regenerar
            </button>
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
          <div className="flex items-start gap-3">
            <span className="text-red-400 text-lg leading-none shrink-0">✗</span>
            <p className="text-zinc-300 text-sm">
              {errorMsg || "Não foi possível gerar o rascunho."}
            </p>
          </div>
          <button
            onClick={handleGenerate}
            className="px-5 py-2.5 border border-zinc-700 text-zinc-500 text-sm hover:border-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
          >
            Tentar novamente
          </button>
        </div>
      )}
    </section>
  );
}

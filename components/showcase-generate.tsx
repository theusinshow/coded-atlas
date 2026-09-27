"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  slug: string;
}

/**
 * Gera sob demanda as peças de vitrine (capa, composições, mockups) de um
 * projeto capturado no perfil Rápido. Usa os screenshots já salvos — não
 * recaptura o site.
 */
export function ShowcaseGenerate({ slug }: Props) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "generating" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleGenerate() {
    setState("generating");
    setErrorMsg("");
    try {
      const res = await fetch(`/api/showcase/${slug}`, { method: "POST" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro desconhecido");
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro desconhecido");
      setState("error");
    }
  }

  return (
    <section aria-label="Peças de vitrine">
      <h2 className="text-[11px] font-mono text-zinc-300 uppercase tracking-widest mb-4">
        Peças de vitrine
      </h2>
      <div className="border border-line p-5 space-y-4">
        {state === "generating" ? (
          <p className="text-[11px] font-mono text-accent uppercase tracking-widest animate-atlas-pulse">
            Gerando capa, composições e mockups...
          </p>
        ) : (
          <>
            <p className="text-sm text-zinc-300 leading-relaxed">
              Capa, composições para redes (1:1, 9:16, 16:9) e mockups com moldura e 3D,
              feitos a partir das capturas atuais — sem recapturar o site.
            </p>
            {state === "error" && (
              <p className="text-bad text-sm">{errorMsg || "Não foi possível gerar as peças."}</p>
            )}
            <button
              onClick={handleGenerate}
              className="px-5 py-2.5 border border-line text-zinc-200 text-sm hover:border-line-soft hover:text-zinc-50 transition-colors cursor-pointer"
            >
              {state === "error" ? "Tentar novamente" : "Gerar peças de vitrine →"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}

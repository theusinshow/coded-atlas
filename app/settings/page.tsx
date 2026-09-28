export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Metadata } from "next";
import { SyncLegacyButton } from "@/components/atlas/job-controls";
import { PageHeader, Panel, SectionTitle } from "@/components/ui/primitives";
import { monthStart } from "@/src/core/brain/usage";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { brainStatus } from "@/src/modules/brain/plan-service";

export const metadata: Metadata = { title: "Ajustes — Coded Atlas" };

export default async function SettingsPage() {
  const runtime = await getAtlasRuntime();
  const ledger = await runtime.repos.legacyImports.list();
  const counts = {
    imported: ledger.filter((e) => e.status === "imported").length,
    dismissed: ledger.filter((e) => e.status === "dismissed").length,
    failed: ledger.filter((e) => e.status === "failed"),
  };
  const [brain, month, recentAi] = await Promise.all([
    brainStatus(runtime.brainDeps),
    runtime.repos.aiUsage.summarizeSince(monthStart()),
    runtime.repos.aiUsage.listRecent(8),
  ]);
  const pricing = runtime.brainDeps.brain.pricing;
  const usd = (n: number) => `US$ ${n.toFixed(n < 1 ? 4 : 2)}`;
  const rows: [string, string][] = [
    ["Dados (ATLAS_HOME)", runtime.home.root],
    ["Banco", runtime.home.databaseFile],
    ["Arquivos", runtime.home.storageRoot],
    ["Política de URL", runtime.urlPolicy.mode === "local" ? "local — pode capturar localhost e rede interna" : "hosted-safe — bloqueia destinos internos"],
    ["Worker de jobs", process.env.ATLAS_WORKER === "off" ? "desligado neste processo (ATLAS_WORKER=off)" : "embutido no servidor"],
  ];

  return (
    <main className="max-w-4xl mx-auto px-6 py-12 space-y-10">
      <PageHeader eyebrow="Ajustes" title="Ajustes do Atlas" description="Configuração desta instalação local. Tudo roda nesta máquina." />

      <section aria-labelledby="instalacao">
        <SectionTitle id="instalacao">Instalação</SectionTitle>
        <Panel>
          <dl className="divide-y divide-line">
            {rows.map(([k, v]) => (
              <div key={k} className="grid gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr]">
                <dt className="text-[12px] text-zinc-500">{k}</dt>
                <dd className="text-[13px] text-zinc-200 font-mono break-all">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </section>

      <section aria-labelledby="brain">
        <SectionTitle id="brain">Atlas Brain (IA)</SectionTitle>
        <Panel className="p-4 space-y-4">
          <p className="text-[13px] text-zinc-300">
            {brain.enabled ? (
              <>
                Ligado · <span className="font-mono text-accent">{brain.provider}/{brain.model}</span>. Planos criativos usam o modelo; a resposta é sempre validada e,
                se falhar, o Atlas usa as próprias regras.
              </>
            ) : (
              <>Desligado — defina <span className="font-mono">OPENAI_API_KEY</span> no ambiente para ligar. Sem IA, os planos saem das regras determinísticas do Atlas e tudo continua funcionando.</>
            )}
          </p>
          <dl className="grid gap-3 sm:grid-cols-4 text-[12px]">
            <div>
              <dt className="text-zinc-500">Chamadas no mês</dt>
              <dd className="text-zinc-100 font-mono tabular-nums">{month.calls}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Tokens (entrada / cache / saída)</dt>
              <dd className="text-zinc-100 font-mono tabular-nums">
                {month.inputTokens.toLocaleString("pt-BR")} / {month.cachedTokens.toLocaleString("pt-BR")} / {month.outputTokens.toLocaleString("pt-BR")}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Custo estimado</dt>
              <dd className="text-zinc-100 font-mono tabular-nums">{pricing ? usd(month.estimatedCostUsd) : "preços não configurados"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Orçamento mensal</dt>
              <dd className={`font-mono ${brain.budgetState === "exceeded" ? "text-bad" : brain.budgetState === "warning" ? "text-warn" : "text-zinc-100"}`}>
                {brain.budget.monthlyLimitUsd === null ? "sem limite" : `${usd(brain.budget.monthlyLimitUsd)} (${brain.budget.mode === "block" ? "bloqueia" : "avisa"})`}
              </dd>
            </div>
          </dl>
          {recentAi.length > 0 && (
            <table className="w-full text-[11px] font-mono">
              <thead className="text-zinc-500 text-left">
                <tr>
                  <th className="font-normal py-1">Quando</th>
                  <th className="font-normal">Tarefa</th>
                  <th className="font-normal">Esforço</th>
                  <th className="font-normal text-right">Tokens</th>
                  <th className="font-normal text-right">Latência</th>
                  <th className="font-normal text-right">Status</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {recentAi.map((u) => (
                  <tr key={u.id} className="border-t border-line">
                    <td className="py-1">{new Date(u.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td>{u.task}</td>
                    <td>{u.effort || "—"}</td>
                    <td className="text-right tabular-nums">{(u.inputTokens + u.outputTokens).toLocaleString("pt-BR")}</td>
                    <td className="text-right tabular-nums">{(u.latencyMs / 1000).toFixed(1)}s</td>
                    <td className={`text-right ${u.status === "ok" ? "text-ok" : u.status === "invalid" ? "text-warn" : "text-bad"}`}>{u.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-[11px] text-zinc-500">
            Variáveis: OPENAI_API_KEY, ATLAS_AI_MODEL, ATLAS_AI_PRICE_INPUT / _CACHED_INPUT / _OUTPUT (USD por 1M tokens), ATLAS_AI_BUDGET_USD, ATLAS_AI_BUDGET_MODE (warn|block), ATLAS_AI_IMAGES, ATLAS_AI=off.
          </p>
        </Panel>
      </section>

      <section aria-labelledby="v1">
        <SectionTitle id="v1">Biblioteca v1</SectionTitle>
        <Panel className="p-4 space-y-4">
          <p className="text-[13px] text-zinc-300">
            Os catálogos do Atlas v1 são importados para o banco novo automaticamente, sem alterar os arquivos originais.
            {" "}{counts.imported} importado(s){counts.dismissed ? ` · ${counts.dismissed} dispensado(s)` : ""}
            {counts.failed.length ? ` · ${counts.failed.length} com falha` : ""}.
          </p>
          {counts.failed.length > 0 && (
            <ul className="text-[12px] text-bad space-y-1">
              {counts.failed.map((e) => (
                <li key={e.slug}>
                  <span className="font-mono">{e.slug}</span>: {e.error}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <SyncLegacyButton />
            <div className="text-[12px] text-zinc-500 space-y-1 text-right">
              <p>
                <Link href="/legacy" className="text-zinc-300 hover:text-accent">Catálogos v1</Link>
                {" · "}
                <Link href="/generate" className="text-zinc-300 hover:text-accent">Geração v1</Link>
              </p>
              <p>Continuam disponíveis durante a migração.</p>
            </div>
          </div>
        </Panel>
      </section>
    </main>
  );
}

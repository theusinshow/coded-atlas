export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SyncLegacyButton } from "@/components/atlas/job-controls";
import { MemoryPanel } from "@/components/creative/memory-panel";
import { Collapsible, PageHeader, Panel, SectionTitle } from "@/components/ui/primitives";
import { plural } from "@/components/ui/format";
import { monthStart } from "@/src/core/brain/usage";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { brainStatus } from "@/src/modules/brain/plan-service";
import { ffmpegPath, ffmpegVersion } from "@/src/infrastructure/ffmpeg/ffmpeg";
import { destinationStatus } from "@/src/modules/publish/export-service";

export const metadata: Metadata = { title: "Ajustes — Coded Atlas" };

const AI_STATUS: Record<string, { label: string; className: string }> = {
  ok: { label: "OK", className: "text-ok" },
  invalid: { label: "Resposta inválida", className: "text-warn" },
};

/** Lista de variáveis de ambiente: só aparece dentro de "Como configurar". */
function EnvList({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid gap-x-4 gap-y-2 text-[12px] sm:grid-cols-[minmax(0,15rem)_1fr]">
      {items.map(([name, what]) => (
        <div key={name} className="contents">
          <dt>
            <code className="font-mono text-cbm-gray-200 break-all">{name}</code>
          </dt>
          <dd className="text-cbm-gray-400 max-sm:mb-2">{what}</dd>
        </div>
      ))}
    </dl>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:items-baseline">
      <dt className="text-[12px] text-cbm-gray-400">{label}</dt>
      <dd className="min-w-0 text-[13px] text-cbm-gray-200">{children}</dd>
    </div>
  );
}

export default async function SettingsPage() {
  const runtime = await getAtlasRuntime();
  const ledger = await runtime.repos.legacyImports.list();
  const counts = {
    imported: ledger.filter((e) => e.status === "imported").length,
    dismissed: ledger.filter((e) => e.status === "dismissed").length,
    failed: ledger.filter((e) => e.status === "failed"),
  };
  const [brain, month, recentAi, workspaceMemory, ffmpeg] = await Promise.all([
    brainStatus(runtime.brainDeps),
    runtime.repos.aiUsage.summarizeSince(monthStart()),
    runtime.repos.aiUsage.listRecent(8),
    runtime.repos.memory.listWorkspace(),
    ffmpegVersion(),
  ]);
  const pricing = runtime.brainDeps.brain.pricing;
  const usd = (n: number) => `US$ ${n.toFixed(n < 1 ? 4 : 2)}`;
  const destinations = destinationStatus(runtime.exportDeps);
  const budget = brain.budget.monthlyLimitUsd === null ? "Sem limite" : `${usd(brain.budget.monthlyLimitUsd)} · ${brain.budget.mode === "block" ? "bloqueia ao passar" : "só avisa"}`;
  const paths = `font-mono text-[12px] break-all`;

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-10">
      <PageHeader title="Ajustes" description="Tudo roda nesta máquina." />

      <section aria-labelledby="memoria">
        <SectionTitle id="memoria">Memória criativa da Coded by M</SectionTitle>
        <p className="text-[13px] text-cbm-gray-400 mb-3 max-w-2xl">Preferências para todos os projetos. A memória de cada projeto vence estas, e o pedido do momento vence as duas.</p>
        <MemoryPanel memories={workspaceMemory} projectId={null} />
      </section>

      <section aria-labelledby="brain" className="space-y-3">
        <SectionTitle id="brain">Atlas Brain</SectionTitle>
        <Panel className="p-4 space-y-4">
          <div className="flex items-start gap-3">
            <span className={`mt-1.5 h-2 w-2 shrink-0 ${brain.enabled ? "bg-ok" : "border border-cbm-gray-400"}`} aria-hidden />
            <div className="space-y-1">
              <p className="text-[14px] font-medium text-cbm-white">
                {brain.enabled ? "Ligado" : "Desligado"}
                {brain.enabled && brain.model && <span className="ml-2 font-mono text-[12px] font-normal text-cbm-gray-400">{brain.model}</span>}
              </p>
              <p className="text-[13px] text-cbm-gray-400">
                {brain.enabled
                  ? "Planos e textos usam o modelo; a resposta é sempre conferida e, se falhar, o Atlas usa as próprias regras."
                  : "Sem IA, os planos saem das regras do Atlas e tudo continua funcionando."}
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
            <div>
              <dt className="text-cbm-gray-400">Chamadas no mês</dt>
              <dd className="text-cbm-gray-100 tabular-nums">{month.calls.toLocaleString("pt-BR")}</dd>
            </div>
            <div>
              <dt className="text-cbm-gray-400">Tokens no mês</dt>
              <dd className="text-cbm-gray-100 tabular-nums" title={`Entrada ${month.inputTokens.toLocaleString("pt-BR")} · cache ${month.cachedTokens.toLocaleString("pt-BR")} · saída ${month.outputTokens.toLocaleString("pt-BR")}`}>
                {(month.inputTokens + month.outputTokens).toLocaleString("pt-BR")}
              </dd>
            </div>
            <div>
              <dt className="text-cbm-gray-400">Custo estimado</dt>
              <dd className="text-cbm-gray-100 tabular-nums">{pricing ? usd(month.estimatedCostUsd) : "Preços não definidos"}</dd>
            </div>
            <div>
              <dt className="text-cbm-gray-400">Orçamento</dt>
              <dd className={`tabular-nums ${brain.budgetState === "exceeded" ? "text-bad" : brain.budgetState === "warning" ? "text-warn" : "text-cbm-gray-100"}`}>{budget}</dd>
            </div>
          </dl>
        </Panel>
        {recentAi.length > 0 && (
          <Collapsible title="Chamadas recentes" meta={plural(recentAi.length, "chamada", "chamadas")}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-[12px]">
                <thead className="text-left text-cbm-gray-400">
                  <tr>
                    <th className="py-1 font-normal">Quando</th>
                    <th className="font-normal">Tarefa</th>
                    <th className="font-normal">Esforço</th>
                    <th className="font-normal text-right">Tokens</th>
                    <th className="font-normal text-right">Tempo</th>
                    <th className="font-normal text-right">Resultado</th>
                  </tr>
                </thead>
                <tbody className="text-cbm-gray-200">
                  {recentAi.map((u) => {
                    const status = AI_STATUS[u.status] ?? { label: "Falhou", className: "text-bad" };
                    return (
                      <tr key={u.id} className="border-t border-line">
                        <td className="py-1.5 tabular-nums">{new Date(u.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
                        <td>{u.task}</td>
                        <td>{u.effort || "—"}</td>
                        <td className="text-right tabular-nums">{(u.inputTokens + u.outputTokens).toLocaleString("pt-BR")}</td>
                        <td className="text-right tabular-nums">{(u.latencyMs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s</td>
                        <td className={`text-right ${status.className}`}>{status.label}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Collapsible>
        )}
        <Collapsible title="Como configurar">
          <div className="space-y-3">
            <p className="text-[13px] text-cbm-gray-400">Defina no ambiente do servidor e reinicie o Atlas.</p>
            <EnvList
              items={[
                ["OPENAI_API_KEY", "Liga o Atlas Brain."],
                ["ATLAS_AI_MODEL", "Modelo usado nos planos."],
                ["ATLAS_AI_PRICE_INPUT · _CACHED_INPUT · _OUTPUT", "Preço em US$ por 1 milhão de tokens, para estimar o custo."],
                ["ATLAS_AI_BUDGET_USD", "Orçamento mensal."],
                ["ATLAS_AI_BUDGET_MODE", "warn (só avisa) ou block (bloqueia ao passar)."],
                ["ATLAS_AI_IMAGES", "Envia imagens das capturas para o modelo."],
                ["ATLAS_AI=off", "Desliga a IA mesmo com a chave definida."],
              ]}
            />
          </div>
        </Collapsible>
      </section>

      <section aria-labelledby="entregas" className="space-y-3">
        <SectionTitle id="entregas">Entregas</SectionTitle>
        <Panel>
          <dl className="divide-y divide-line">
            <Row label="Pasta local">{destinations.folder.available ? "Pronta" : "Não configurada"}</Row>
            <Row label="GitHub">{destinations.github.available ? <>Conectado · <span className="font-mono text-[12px]">{destinations.github.label}</span></> : "Não configurado"}</Row>
          </dl>
        </Panel>
        {!destinations.github.available && (
          <Collapsible title="Como conectar o GitHub">
            <div className="space-y-3">
              <p className="text-[13px] text-cbm-gray-400">Para publicar o portfólio direto no repositório. Defina no ambiente do servidor e reinicie o Atlas.</p>
              <EnvList
                items={[
                  ["ATLAS_GITHUB_TOKEN", "Token com permissão de escrita no repositório."],
                  ["ATLAS_GITHUB_REPO", "Repositório, no formato dono/nome."],
                  ["ATLAS_GITHUB_BRANCH", "Opcional — branch de destino."],
                  ["ATLAS_GITHUB_PATH", "Opcional — pasta dentro do repositório."],
                ]}
              />
            </div>
          </Collapsible>
        )}
      </section>

      <section aria-labelledby="diagnostico">
        <SectionTitle id="diagnostico">Diagnóstico</SectionTitle>
        <div className="space-y-3">
          <Collapsible title="Instalação" meta={ffmpeg ? undefined : "FFmpeg não encontrado"}>
            <dl className="-m-4 divide-y divide-line">
              <Row label="Dados">
                <span className={paths}>{runtime.home.root}</span>
              </Row>
              <Row label="Banco">
                <span className={paths}>{runtime.home.databaseFile}</span>
              </Row>
              <Row label="Arquivos">
                <span className={paths}>{runtime.home.storageRoot}</span>
              </Row>
              <Row label="Pasta de entregas">
                <span className={paths}>{destinations.folder.label}</span>
              </Row>
              <Row label="Endereços permitidos">{runtime.urlPolicy.mode === "local" ? "Locais e públicos — pode capturar localhost e rede interna" : "Só públicos — bloqueia destinos internos"}</Row>
              <Row label="Trabalhos em segundo plano">{process.env.ATLAS_WORKER === "off" ? "Desligados neste processo" : "Rodando junto com o servidor"}</Row>
              <Row label="FFmpeg (vídeo)">
                {ffmpeg ? (
                  <span className={paths}>
                    {ffmpeg} · {ffmpegPath()}
                  </span>
                ) : (
                  <span className="text-bad">Não encontrado — instale o FFmpeg (ou aponte ATLAS_FFMPEG para ele) para renderizar vídeos.</span>
                )}
              </Row>
            </dl>
          </Collapsible>
          <Collapsible
            title="Biblioteca antiga"
            meta={`${plural(counts.imported, "projeto importado", "projetos importados")}${counts.failed.length ? ` · ${plural(counts.failed.length, "falha", "falhas")}` : ""}`}
            defaultOpen={counts.failed.length > 0}
          >
            <div className="space-y-4">
              <p className="text-[13px] text-cbm-gray-200">
                Os projetos da versão anterior entram aqui sozinhos, sem mudar os arquivos originais.{" "}
                {plural(counts.imported, "importado", "importados")}
                {counts.dismissed ? ` · ${plural(counts.dismissed, "dispensado", "dispensados")}` : ""}.
              </p>
              {counts.failed.length > 0 && (
                <ul className="space-y-1 text-[12px] text-bad">
                  {counts.failed.map((e) => (
                    <li key={e.slug}>
                      <span className="font-mono">{e.slug}</span>: {e.error}
                    </li>
                  ))}
                </ul>
              )}
              <SyncLegacyButton />
            </div>
          </Collapsible>
        </div>
      </section>
    </main>
  );
}

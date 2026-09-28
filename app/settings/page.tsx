export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Metadata } from "next";
import { SyncLegacyButton } from "@/components/atlas/job-controls";
import { PageHeader, Panel, SectionTitle } from "@/components/ui/primitives";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";

export const metadata: Metadata = { title: "Ajustes — Coded Atlas" };

export default async function SettingsPage() {
  const runtime = await getAtlasRuntime();
  const ledger = await runtime.repos.legacyImports.list();
  const counts = {
    imported: ledger.filter((e) => e.status === "imported").length,
    dismissed: ledger.filter((e) => e.status === "dismissed").length,
    failed: ledger.filter((e) => e.status === "failed"),
  };
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

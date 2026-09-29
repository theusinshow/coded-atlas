export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Metadata } from "next";
import { OutputCard } from "@/components/create/output-card";
import { ExportForm } from "@/components/publish/export-forms";
import { ExportHistory, PickOutput } from "@/components/publish/export-history";
import { EmptyState, PageHeader, Panel, SectionTitle } from "@/components/ui/primitives";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { destinationStatus } from "@/src/modules/publish/export-service";
import { JobIdSchema } from "@/src/shared/id";

export const metadata: Metadata = { title: "Portfólio — Coded Atlas" };

const FORM_ID = "portfolio-form";

/**
 * Portfólio (2.14): escolher peças de vários projetos e exportar tudo de uma vez —
 * uma pasta por projeto + `portfolio.json` com os mesmos campos do manifesto do v1
 * (consumido pelo site), agora com as peças escolhidas e o case web.
 */
export default async function PortfolioPage() {
  const { repos, exportDeps } = await getAtlasRuntime();
  const projects = await repos.projects.list();
  const groups = [];
  for (const project of projects) {
    const outputs = [...(await repos.outputs.listByProject(project.id))].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (outputs.length > 0) groups.push({ project, outputs });
  }
  const history = await repos.exports.listByProject(null);
  const jobStatus: Record<string, string> = {};
  for (const e of history) if (e.jobId && (e.status === "queued" || e.status === "running")) jobStatus[e.jobId] = (await repos.jobs.getById(JobIdSchema.parse(e.jobId)))?.status ?? "failed";

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 space-y-10">
      <PageHeader
        eyebrow="Portfólio"
        title="Exportar portfólio"
        description="Escolha as peças de cada projeto. A exportação monta uma pasta por projeto e um portfolio.json pronto para o site — nada sai sem o seu clique."
      />

      {groups.length === 0 ? (
        <EmptyState
          title="Nenhuma peça final ainda"
          action={
            <Link href="/projects" className="text-[13px] text-accent">
              Ir para os projetos →
            </Link>
          }
        >
          Renderize peças, kits ou cases nos projetos — elas aparecem aqui para compor o portfólio.
        </EmptyState>
      ) : (
        <>
          <Panel className="p-4">
            <ExportForm formId={FORM_ID} mode="portfolio" destinations={destinationStatus(exportDeps)} defaultName="Portfólio Coded by M" />
          </Panel>
          {groups.map(({ project, outputs }) => (
            <section key={project.id} aria-labelledby={`p-${project.id}`} className="space-y-3" data-portfolio-project={project.slug}>
              <SectionTitle
                id={`p-${project.id}`}
                aside={
                  <Link href={`/projects/${project.slug}/publish`} className="text-[11px] text-cbm-gray-400 hover:text-cbm-gray-200">
                    Abrir em Publicar →
                  </Link>
                }
              >
                {project.name} ({outputs.length})
              </SectionTitle>
              <ul className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-4 items-start">
                {outputs.map((o) => (
                  <li key={o.id} className="space-y-1">
                    <OutputCard output={o} compact />
                    <PickOutput formId={FORM_ID} outputId={o.id} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      {history.length > 0 && (
        <section aria-labelledby="historico">
          <SectionTitle id="historico">Exportações ({history.length})</SectionTitle>
          <ExportHistory records={history} jobStatus={jobStatus} />
        </section>
      )}
    </main>
  );
}

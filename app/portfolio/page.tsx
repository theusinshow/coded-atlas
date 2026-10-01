export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Metadata } from "next";
import { OutputCard } from "@/components/create/output-card";
import { cleanOutputLabel, commonLabelPrefix, withoutPrefix, withoutSegment } from "@/components/media/labels";
import type { Output } from "@/src/core/assets/output";
import { ExportForm, SelectAllButton } from "@/components/publish/export-forms";
import { ExportHistory } from "@/components/publish/export-history";
import { EmptyState, LinkButton, PageHeader, SectionTitle } from "@/components/ui/primitives";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { destinationStatus } from "@/src/modules/publish/export-service";
import { JobIdSchema } from "@/src/shared/id";

export const metadata: Metadata = { title: "Portfólio — Coded Atlas" };

const FORM_ID = "portfolio-form";

/**
 * Título de cada peça na seção do projeto: sem o nome do projeto (já está no
 * cabeçalho) nem o prefixo repetido de um mesmo render ("Kit de portfólio · …").
 */
function titles(outputs: Output[], projectName: string): Map<string, string> {
  const byJob = new Map<string, Output[]>();
  for (const o of outputs) if (o.jobId) byJob.set(o.jobId, [...(byJob.get(o.jobId) ?? []), o]);
  const result = new Map<string, string>();
  for (const o of outputs) {
    const label = withoutSegment(cleanOutputLabel(o.label), projectName);
    const siblings = o.jobId ? (byJob.get(o.jobId) ?? []) : [];
    const prefix = commonLabelPrefix(siblings.map((s) => withoutSegment(cleanOutputLabel(s.label), projectName)));
    const rest = withoutPrefix(label, prefix);
    result.set(o.id, rest.charAt(0).toUpperCase() + rest.slice(1));
  }
  return result;
}

/**
 * Portfólio (2.14): marcar peças de vários projetos e exportar tudo de uma vez —
 * uma pasta por projeto + `portfolio.json` com os campos do manifesto que o site
 * consome. A seleção é por cartão; a barra de exportar aparece com a primeira marca.
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
  for (const e of history)
    if (e.jobId && (e.status === "queued" || e.status === "running")) jobStatus[e.jobId] = (await repos.jobs.getById(JobIdSchema.parse(e.jobId)))?.status ?? "failed";

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-4 py-10 sm:px-6 sm:py-12">
      <PageHeader
        title="Portfólio"
        description="Marque as peças de cada projeto e exporte tudo de uma vez."
        actions={groups.length > 0 ? <SelectAllButton formId={FORM_ID} /> : undefined}
      />

      {groups.length === 0 ? (
        <EmptyState
          title="Nenhuma peça final ainda"
          action={
            <LinkButton href="/projects" size="sm">
              Ir para os projetos
            </LinkButton>
          }
        />
      ) : (
        groups.map(({ project, outputs }) => {
          const names = titles(outputs, project.name);
          return (
            <section key={project.id} aria-labelledby={`p-${project.id}`} data-portfolio-project={project.slug}>
              <SectionTitle
                id={`p-${project.id}`}
                aside={
                  <Link
                    href={`/projects/${project.slug}/publish`}
                    className="inline-flex h-10 items-center text-[12px] text-cbm-gray-400 transition-colors hover:text-cbm-white sm:h-8"
                  >
                    Abrir em Entregar
                  </Link>
                }
              >
                {project.name} ({outputs.length})
              </SectionTitle>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-4 lg:grid-cols-6">
                {outputs.map((o) => (
                  <li key={o.id}>
                    <OutputCard output={o} compact selectFor={FORM_ID} title={names.get(o.id)} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}

      {history.length > 0 && (
        <section aria-labelledby="historico">
          <SectionTitle id="historico">Exportações ({history.length})</SectionTitle>
          <ExportHistory records={history} jobStatus={jobStatus} folderRoot={exportDeps.folder.label} canReveal={exportDeps.folder.canReveal} />
        </section>
      )}

      {groups.length > 0 && <ExportForm formId={FORM_ID} mode="portfolio" destinations={destinationStatus(exportDeps)} defaultName="Portfólio Coded by M" />}
    </main>
  );
}

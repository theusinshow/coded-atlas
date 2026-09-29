export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { OutputCard } from "@/components/create/output-card";
import { ExportForm } from "@/components/publish/export-forms";
import { ExportHistory, PickOutput } from "@/components/publish/export-history";
import { EmptyState, Panel, SectionTitle } from "@/components/ui/primitives";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { requireProjectBySlug } from "@/src/modules/projects/project-service";
import { JobIdSchema } from "@/src/shared/id";
import { destinationStatus } from "@/src/modules/publish/export-service";

const FORM_ID = "package-form";

interface Props {
  params: Promise<{ slug: string }>;
}

/** Peças finais do projeto (Outputs imutáveis): renders do Atlas e peças importadas do v1. */
export default async function ProjectPublishPage({ params }: Props) {
  const { slug } = await params;
  const { repos, exportDeps } = await getAtlasRuntime();
  const project = await requireProjectBySlug(repos.projects, slug);
  const outputs = [...(await repos.outputs.listByProject(project.id))].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // Só o que saiu do render do Atlas 2 é "render"; o resto veio da biblioteca v1.
  const rendered = outputs.filter((o) => o.metadata.origin === "render");
  const legacy = outputs.filter((o) => o.metadata.origin !== "render");
  // Um grupo por render (job): carrossel e múltiplos formatos saem juntos, na ordem.
  const groups: { jobId: string | null; items: typeof rendered }[] = [];
  for (const o of rendered) {
    const group = groups.find((g) => g.jobId !== null && g.jobId === o.jobId);
    if (group) group.items.push(o);
    else groups.push({ jobId: o.jobId, items: [o] });
  }
  for (const g of groups) g.items.sort((a, b) => (a.metadata.page ?? 0) - (b.metadata.page ?? 0) || a.format.localeCompare(b.format));

  const exports = await repos.exports.listByProject(project.id);
  const jobStatus: Record<string, string> = {};
  for (const e of exports) if (e.jobId && (e.status === "queued" || e.status === "running")) jobStatus[e.jobId] = (await repos.jobs.getById(JobIdSchema.parse(e.jobId)))?.status ?? "failed";

  if (outputs.length === 0) {
    return (
      <EmptyState
        title="Nenhuma peça final ainda"
        action={
          <Link href={`/projects/${project.slug}/create`} className="text-[13px] text-accent">
            Criar uma composição →
          </Link>
        }
      >
        Renderize uma composição em Criar — os arquivos aparecem aqui prontos para baixar.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-10">
      <section aria-labelledby="pacote">
        <SectionTitle id="pacote">Criar pacote</SectionTitle>
        <Panel className="p-4 space-y-3">
          <p className="text-[12px] text-cbm-gray-400">
            Marque as peças abaixo (<span className="text-cbm-gray-200">Incluir</span>) — o pacote sai organizado por tipo (imagens, vídeos, documentos, web) com um{" "}
            <span className="font-mono">manifest.json</span>.
          </p>
          <ExportForm formId={FORM_ID} mode="package" projectId={project.id} destinations={destinationStatus(exportDeps)} defaultName={`${project.name} · pacote`} />
        </Panel>
      </section>
      {rendered.length > 0 && (
        <section aria-labelledby="renders" className="space-y-8">
          <SectionTitle id="renders">Renders ({rendered.length})</SectionTitle>
          {groups.map((group) => (
            <div key={group.jobId ?? group.items[0].id} className="space-y-3" data-render-group={group.jobId ?? ""}>
              {group.items.length > 1 && group.jobId && (
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
                  <p className="text-[12px] text-cbm-gray-200">
                    {group.items.some((o) => o.metadata.page !== undefined) ? `Carrossel · ${new Set(group.items.map((o) => o.metadata.page)).size} páginas` : "Render"} · {group.items.length} arquivos ·{" "}
                    <span className="text-cbm-gray-400">{new Date(group.items[0].createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                  </p>
                  <a href={`/api/atlas/jobs/${group.jobId}/outputs`} className="text-[11px] font-medium uppercase tracking-[0.22em] text-accent hover:text-accent-bright">
                    Baixar tudo (.zip)
                  </a>
                </div>
              )}
              <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 items-start">
                {group.items.map((o) => (
                  <li key={o.id}>
                    <OutputCard output={o} />
                    <PickOutput formId={FORM_ID} outputId={o.id} />
                    {o.metadata.documentId && (
                      <Link href={`/studio/${o.metadata.documentId}`} className="text-[11px] text-cbm-gray-400 hover:text-cbm-gray-200">
                        Abrir no canvas (rev {o.metadata.documentRevision}) →
                      </Link>
                    )}
                    {o.metadata.instanceId && (
                      <Link href={`/projects/${project.slug}/create/${o.metadata.instanceId}`} className="text-[11px] text-cbm-gray-400 hover:text-cbm-gray-200">
                        Abrir composição →
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
      {legacy.length > 0 && (
        <section aria-labelledby="legado">
          <SectionTitle id="legado">Peças do Atlas v1 ({legacy.length})</SectionTitle>
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 items-start">
            {legacy.map((o) => (
              <li key={o.id}>
                <OutputCard output={o} />
                <PickOutput formId={FORM_ID} outputId={o.id} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {exports.length > 0 && (
        <section aria-labelledby="entregas">
          <SectionTitle id="entregas">Entregas ({exports.length})</SectionTitle>
          <ExportHistory records={exports} jobStatus={jobStatus} />
        </section>
      )}
    </div>
  );
}

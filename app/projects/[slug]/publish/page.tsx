export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { OutputCard } from "@/components/create/output-card";
import { EmptyState, SectionTitle } from "@/components/ui/primitives";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { requireProjectBySlug } from "@/src/modules/projects/project-service";

interface Props {
  params: Promise<{ slug: string }>;
}

/** Peças finais do projeto (Outputs imutáveis): renders do Atlas e peças importadas do v1. */
export default async function ProjectPublishPage({ params }: Props) {
  const { slug } = await params;
  const { repos } = await getAtlasRuntime();
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
      {rendered.length > 0 && (
        <section aria-labelledby="renders" className="space-y-8">
          <SectionTitle id="renders">Renders ({rendered.length})</SectionTitle>
          {groups.map((group) => (
            <div key={group.jobId ?? group.items[0].id} className="space-y-3" data-render-group={group.jobId ?? ""}>
              {group.items.length > 1 && group.jobId && (
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
                  <p className="text-[12px] text-zinc-300">
                    {group.items.some((o) => o.metadata.page !== undefined) ? `Carrossel · ${new Set(group.items.map((o) => o.metadata.page)).size} páginas` : "Render"} · {group.items.length} arquivos ·{" "}
                    <span className="text-zinc-500">{new Date(group.items[0].createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                  </p>
                  <a href={`/api/atlas/jobs/${group.jobId}/outputs`} className="text-[11px] font-mono uppercase tracking-wider text-accent hover:text-accent-bright">
                    Baixar tudo (.zip)
                  </a>
                </div>
              )}
              <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 items-start">
                {group.items.map((o) => (
                  <li key={o.id}>
                    <OutputCard output={o} />
                    {o.metadata.documentId && (
                      <Link href={`/studio/${o.metadata.documentId}`} className="text-[11px] text-zinc-500 hover:text-zinc-200">
                        Abrir no canvas (rev {o.metadata.documentRevision}) →
                      </Link>
                    )}
                    {o.metadata.instanceId && (
                      <Link href={`/projects/${project.slug}/create/${o.metadata.instanceId}`} className="text-[11px] text-zinc-500 hover:text-zinc-200">
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
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

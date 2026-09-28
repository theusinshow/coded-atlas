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
        <section aria-labelledby="renders">
          <SectionTitle id="renders">Renders ({rendered.length})</SectionTitle>
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 items-start">
            {rendered.map((o) => (
              <li key={o.id}>
                <OutputCard output={o} />
                {o.metadata.instanceId && (
                  <Link href={`/projects/${project.slug}/create/${o.metadata.instanceId}`} className="text-[11px] text-zinc-500 hover:text-zinc-200">
                    Abrir composição →
                  </Link>
                )}
              </li>
            ))}
          </ul>
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

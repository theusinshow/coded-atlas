export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { createCaseAction } from "@/app/actions/cases";
import { Button, EmptyState, Panel, SectionTitle } from "@/components/ui/primitives";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { requireProjectBySlug } from "@/src/modules/projects/project-service";

interface Props {
  params: Promise<{ slug: string }>;
}

/** Case Builder: estudos de caso do projeto (página web, PDF, módulos Behance). */
export default async function ProjectCasesPage({ params }: Props) {
  const { slug } = await params;
  const { repos } = await getAtlasRuntime();
  const project = await requireProjectBySlug(repos.projects, slug);
  const [documents, directions] = await Promise.all([repos.documents.listByProject(project.id), repos.directions.listByProject(project.id)]);
  const cases = documents.filter((d) => d.kind === "case");
  return (
    <div className="grid gap-10 lg:grid-cols-[24rem_1fr]">
      <section aria-labelledby="novo-case">
        <SectionTitle id="novo-case">Novo case</SectionTitle>
        <p className="text-[13px] text-cbm-gray-400 mb-4">
          O Atlas monta o esqueleto com o material capturado — contexto, desktop, mobile, seções, identidade e ficha técnica. Você escreve (ou pede ao Atlas Brain) e exporta.
        </p>
        <form action={createCaseAction} className="space-y-3">
          <input type="hidden" name="projectId" value={project.id} />
          {directions.length > 0 && (
            <select name="directionId" aria-label="Direção criativa do case" defaultValue="" className="w-full h-10 bg-surface border border-line text-sm text-cbm-gray-200 px-3">
              <option value="">Estilo automático</option>
              {directions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          <Button variant="primary" type="submit">
            Montar case
          </Button>
        </form>
      </section>
      <section aria-labelledby="cases">
        <SectionTitle id="cases">Cases ({cases.length})</SectionTitle>
        {cases.length === 0 ? (
          <EmptyState title="Nenhum case ainda">Monte o primeiro ao lado. Ele substitui o rascunho de case do Atlas v1.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {cases.map((doc) => (
              <li key={doc.id}>
                <Link href={`/cases/${doc.id}`} className="block group" data-case-doc={doc.id}>
                  <Panel className="p-4 group-hover:border-cbm-gray-400 transition-colors">
                    <p className="text-[13px] text-cbm-gray-100">{doc.name}</p>
                    <p className="text-[11px] font-mono text-cbm-gray-400">
                      rev {doc.headRevision} · {new Date(doc.updatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                  </Panel>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

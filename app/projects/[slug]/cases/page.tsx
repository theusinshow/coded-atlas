export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { createCaseAction } from "@/app/actions/cases";
import { SubmitButton } from "@/components/create/submit-button";
import { buttonClass, EmptyState, Panel } from "@/components/ui/primitives";
import { relativeTime } from "@/components/ui/format";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { requireProjectBySlug } from "@/src/modules/projects/project-service";

interface Props {
  params: Promise<{ slug: string }>;
}

/** "Editado há 2 h", "Editado ontem", "Editado em 12/09". */
const edited = (when: string) => (/^\d/.test(when) ? `Editado em ${when}` : `Editado ${when}`);

/** Cases do projeto (página web, PDF, módulos para Behance): a lista primeiro, "Montar case" no cabeçalho. */
export default async function ProjectCasesPage({ params }: Props) {
  const { slug } = await params;
  const { repos } = await getAtlasRuntime();
  const project = await requireProjectBySlug(repos.projects, slug);
  const [documents, directions] = await Promise.all([repos.documents.listByProject(project.id), repos.directions.listByProject(project.id)]);
  const cases = documents.filter((d) => d.kind === "case");
  const now = new Date();

  return (
    <section aria-labelledby="cases" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="cases" className="text-[11px] font-medium text-cbm-gray-400 uppercase tracking-[0.22em]">
          Cases ({cases.length})
        </h2>
        <form action={createCaseAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="projectId" value={project.id} />
          {directions.length > 0 && (
            <select
              name="directionId"
              aria-label="Direção criativa do case"
              defaultValue=""
              className="h-10 min-w-0 max-w-full bg-surface border border-line text-[13px] text-cbm-gray-200 px-3 focus:outline-none focus:border-accent"
            >
              <option value="">Estilo automático</option>
              {directions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          <SubmitButton className={buttonClass("primary", "md")}>Montar case</SubmitButton>
        </form>
      </div>

      {cases.length === 0 ? (
        <EmptyState title="Nenhum case ainda">O Atlas monta o esqueleto com o material capturado; você escreve e exporta.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {cases.map((doc) => (
            <li key={doc.id}>
              <Link href={`/cases/${doc.id}`} className="block group" data-case-doc={doc.id}>
                <Panel className="px-4 py-3.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 group-hover:border-cbm-gray-400 transition-colors">
                  <p className="text-[14px] text-cbm-white">{doc.name}</p>
                  <p className="text-[12px] text-cbm-gray-400">{edited(relativeTime(doc.updatedAt, now))}</p>
                </Panel>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

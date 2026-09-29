export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { AssetThumb } from "@/components/atlas/asset-image";
import { JobFollower } from "@/components/atlas/job-follower";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui/primitives";
import { ProjectStatusBadge } from "@/components/ui/status";
import { plural } from "@/components/ui/format";
import type { ProjectQuery } from "@/src/core/projects/repositories";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { ProjectFilters } from "./project-filters";

export const metadata: Metadata = { title: "Projetos — Coded Atlas" };

interface Props {
  searchParams: Promise<{ q?: string; status?: string; category?: string; sort?: string }>;
}

const SORTS = [
  { value: "recent", label: "Mais recentes" },
  { value: "updated", label: "Atualizados" },
  { value: "name", label: "Nome" },
] as const;

function hostOf(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default async function ProjectsPage({ searchParams }: Props) {
  const params = await searchParams;
  const query: ProjectQuery = {
    text: params.q?.slice(0, 200),
    status: params.status === "archived" ? "archived" : params.status === "all" ? "all" : "active",
    category: params.category || undefined,
    sort: SORTS.some((s) => s.value === params.sort) ? (params.sort as ProjectQuery["sort"]) : "recent",
  };
  const { repos } = await getAtlasRuntime();
  const [projects, categories, importJob] = await Promise.all([
    repos.projects.search(query),
    repos.projects.categories(),
    repos.jobs.listRecent({ types: ["import"], statuses: ["queued", "preparing", "running"], limit: 1 }),
  ]);
  const withSources = await Promise.all(
    projects.map(async (p) => ({ project: p, url: (await repos.sources.listByProject(p.id)).find((s) => s.type === "url")?.locator }))
  );
  const filtered = Boolean(query.text || query.category || query.status !== "active");

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
      <PageHeader
        title="Biblioteca de projetos"
        description={filtered ? plural(projects.length, "projeto encontrado", "projetos encontrados") : plural(projects.length, "projeto", "projetos")}
        actions={
          <>
            <LinkButton href="/library">Biblioteca de assets</LinkButton>
            <LinkButton href="/projects/new" variant="primary">
              <Plus size={14} aria-hidden />
              Novo projeto
            </LinkButton>
          </>
        }
      />

      {importJob[0] && (
        <section aria-label="Importação da biblioteca antiga" className="space-y-2">
          <p className="text-[13px] text-cbm-gray-400">Trazendo os projetos da biblioteca antiga. Os arquivos originais não mudam.</p>
          <JobFollower jobId={importJob[0].id} />
        </section>
      )}

      <ProjectFilters categories={categories} sorts={SORTS} />

      {projects.length === 0 ? (
        filtered ? (
          <EmptyState title="Nada encontrado" action={<LinkButton href="/projects">Limpar filtros</LinkButton>} />
        ) : (
          <EmptyState title="Nenhum projeto ainda" action={<LinkButton href="/projects/new" variant="primary">Criar o primeiro projeto</LinkButton>}>
            Comece pela URL do site ou envie imagens.
          </EmptyState>
        )
      ) : (
        <ul className="grid gap-4 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {withSources.map(({ project, url }) => (
            <li key={project.id} className="min-w-0">
              <Link
                href={`/projects/${project.slug}`}
                className="group flex h-full flex-col border border-line bg-base transition-colors hover:border-cbm-gray-400 focus-visible:border-cbm-white"
              >
                <div className="relative aspect-video border-b border-line overflow-hidden">
                  <AssetThumb id={project.coverAssetId} alt={`Capa de ${project.name}`} width={640} className="w-full h-full" />
                  <span className="absolute top-2 left-2 max-w-[calc(100%-1rem)] truncate text-[10px] font-medium uppercase tracking-[0.22em] text-cbm-gray-200 bg-base/85 px-1.5 py-0.5 border border-line">
                    {project.category}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-1 p-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-[15px] font-semibold text-cbm-gray-100 truncate group-hover:text-cbm-white">{project.name}</p>
                    <ProjectStatusBadge status={project.status} />
                  </div>
                  <p className="text-[13px] text-cbm-gray-400 truncate">{project.client ?? "—"}</p>
                  <p className="mt-auto pt-2 text-[12px] text-cbm-gray-400 truncate">{hostOf(url) || "Sem site"}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Metadata } from "next";
import { AssetThumb } from "@/components/atlas/asset-image";
import { JobFollower } from "@/components/atlas/job-follower";
import { EmptyState, INPUT_CLASS, LinkButton, PageHeader } from "@/components/ui/primitives";
import { ProjectStatusBadge } from "@/components/ui/status";
import type { ProjectQuery } from "@/src/core/projects/repositories";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";

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
    <main className="max-w-6xl mx-auto px-6 py-12 space-y-8">
      <PageHeader
        eyebrow="Projetos"
        title="Biblioteca de projetos"
        description={`${projects.length} projeto${projects.length === 1 ? "" : "s"}${filtered ? " encontrado(s)" : ""}.`}
        actions={<LinkButton href="/projects/new" variant="primary">Novo projeto</LinkButton>}
      />

      {importJob[0] && (
        <section aria-label="Importação da biblioteca v1" className="space-y-2">
          <p className="text-[12px] text-cbm-gray-400">Importando a biblioteca v1 para o banco novo (os arquivos originais não são alterados).</p>
          <JobFollower jobId={importJob[0].id} />
        </section>
      )}

      <form className="grid gap-3 sm:grid-cols-[1fr_12rem_10rem_10rem_auto] items-end" role="search">
        <input name="q" defaultValue={params.q} placeholder="Buscar por nome, cliente, categoria…" aria-label="Buscar projetos" className={INPUT_CLASS} />
        <select name="category" defaultValue={params.category ?? ""} aria-label="Categoria" className={INPUT_CLASS}>
          <option value="">Todas as categorias</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={query.status} aria-label="Situação" className={INPUT_CLASS}>
          <option value="active">Ativos</option>
          <option value="archived">Arquivados</option>
          <option value="all">Todos</option>
        </select>
        <select name="sort" defaultValue={query.sort} aria-label="Ordenar" className={INPUT_CLASS}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button type="submit" className="h-[42px] px-4 border border-line text-sm text-cbm-gray-200 hover:bg-surface">
          Filtrar
        </button>
      </form>

      {projects.length === 0 ? (
        filtered ? (
          <EmptyState title="Nada encontrado" action={<Link className="text-accent text-sm" href="/projects">Limpar filtros</Link>}>
            Nenhum projeto corresponde aos filtros.
          </EmptyState>
        ) : (
          <EmptyState title="Nenhum projeto ainda" action={<LinkButton href="/projects/new" variant="primary">Criar o primeiro projeto</LinkButton>}>
            Crie um projeto a partir da URL do site ou envie imagens manualmente.
          </EmptyState>
        )
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {withSources.map(({ project, url }) => (
            <li key={project.id}>
              <Link href={`/projects/${project.slug}`} className="group block border border-line bg-base hover:border-cbm-gray-600 transition-colors">
                <div className="relative aspect-video border-b border-line overflow-hidden">
                  <AssetThumb id={project.coverAssetId} alt={`Capa de ${project.name}`} className="w-full h-full group-hover:scale-[1.02] transition-transform duration-500" />
                  <span className="absolute top-2 left-2 text-[10px] font-medium uppercase tracking-[0.22em] text-cbm-gray-200 bg-base/85 px-1.5 py-0.5 border border-line">
                    {project.category}
                  </span>
                </div>
                <div className="p-4 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[15px] font-semibold text-cbm-gray-100 truncate">{project.name}</p>
                    <ProjectStatusBadge status={project.status} />
                  </div>
                  <p className="text-[13px] text-cbm-gray-400 truncate">{project.client ?? " "}</p>
                  <div className="flex items-center justify-between pt-2 text-[11px] font-mono text-cbm-gray-400">
                    <span className="truncate">{hostOf(url) || project.slug}</span>
                    <span>{project.origin === "legacy" ? "v1" : ""}</span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

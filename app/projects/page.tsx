import Link from "next/link";
import type { Metadata } from "next";
import { listProjects } from "@/lib/storage/list-projects";
import { ProjectCatalogCard } from "@/components/project-catalog-card";

export const metadata: Metadata = {
  title: "Projetos — Coded Atlas",
};

export default async function ProjectsPage() {
  const projects = await listProjects();

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="max-w-5xl mx-auto">

        {/* ── Header ── */}
        <header className="mb-12">
          <nav
            aria-label="Navegação"
            className="flex items-center gap-2 text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-6"
          >
            <Link href="/" className="hover:text-zinc-400 transition-colors">Coded by M</Link>
            <span aria-hidden>·</span>
            <span className="text-zinc-500">Atlas</span>
          </nav>

          <div className="flex items-end justify-between gap-6">
            <div>
              <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">
                Projetos Gerados
              </h1>
              <p className="text-zinc-500 text-sm mt-1">
                {projects.length === 0
                  ? "Nenhum projeto gerado ainda."
                  : `${projects.length} projeto${projects.length !== 1 ? "s" : ""} no catálogo.`}
              </p>
            </div>

            <Link
              href="/generate"
              className="shrink-0 px-5 py-2.5 bg-zinc-100 text-zinc-900 text-sm font-medium hover:bg-white transition-colors cursor-pointer"
            >
              Gerar novo →
            </Link>
          </div>
        </header>

        {/* ── Empty state ── */}
        {projects.length === 0 && (
          <div className="border border-zinc-800 p-12 text-center space-y-4">
            <p className="text-zinc-600 text-sm font-mono">
              Nenhum catálogo encontrado em{" "}
              <code className="text-zinc-500">public/generated/</code>
            </p>
            <Link
              href="/generate"
              className="inline-block text-[10px] font-mono text-zinc-500 uppercase tracking-widest hover:text-zinc-300 transition-colors"
            >
              Gerar primeiro catálogo →
            </Link>
          </div>
        )}

        {/* ── Grid de projetos ── */}
        {projects.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <ProjectCatalogCard key={project.slug} project={project} />
            ))}
          </div>
        )}

        {/* ── Footer ── */}
        {projects.length > 0 && (
          <footer className="mt-16 border-t border-zinc-800 pt-6 flex items-center justify-between">
            <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
              Coded Atlas · Coded by M
            </span>
            <span className="text-[10px] font-mono text-zinc-600">
              {projects.length} projeto{projects.length !== 1 ? "s" : ""}
            </span>
          </footer>
        )}

      </div>
    </main>
  );
}

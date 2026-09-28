export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { FoundationCapture } from "@/components/foundation-capture";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";

export const metadata: Metadata = {
  title: "Fundação 2.x — Coded Atlas",
  description: "Verificação da fatia migrada: projeto → job → captura → AssetStorage → SQLite.",
};

const triangle = {
  width: 0,
  height: 0,
  borderTop: "4px solid transparent",
  borderBottom: "4px solid transparent",
  borderLeft: "6px solid currentColor",
  display: "inline-block",
} as const;

/**
 * Página de verificação do Atlas 2.1 (laboratório): tudo aqui vem do SQLite e do
 * AssetStorage — nada de public/generated. A biblioteca v1 segue em /projects.
 */
export default async function FoundationLabPage() {
  const { repos, home, urlPolicy } = await getAtlasRuntime();
  const projects = await repos.projects.list();
  const rows = await Promise.all(
    projects.map(async (project) => {
      const [assets, jobs] = await Promise.all([repos.assets.listByProject(project.id), repos.jobs.listByProject(project.id)]);
      return { project, assets, lastJob: jobs.at(-1) };
    })
  );

  return (
    <main className="min-h-screen px-6 py-16">
      <div className="bg-grid fixed inset-0 pointer-events-none" aria-hidden />
      <div className="relative w-full max-w-4xl mx-auto space-y-12 pt-8">
        <header className="space-y-3">
          <p className="text-[11px] font-mono text-accent uppercase tracking-[0.2em] flex items-center gap-2">
            <span aria-hidden style={triangle} />
            Laboratório · Atlas 2.1 Foundation
          </p>
          <h1 className="text-3xl font-mono font-bold tracking-tight text-zinc-100">Fatia migrada</h1>
          <p className="text-sm text-zinc-400 max-w-2xl">
            Projeto → source URL → job → worker → Playwright → AssetStorage → SQLite. A captura roda no worker,
            fora desta página: pode fechar a aba que o job continua.
          </p>
          <p className="text-[11px] font-mono text-zinc-500">
            ATLAS_HOME {home.root} · política de URL: {urlPolicy.mode}
          </p>
        </header>

        <section aria-labelledby="nova-captura" className="space-y-4">
          <h2 id="nova-captura" className="text-[11px] font-mono text-zinc-400 uppercase tracking-widest">
            Nova captura
          </h2>
          <FoundationCapture />
        </section>

        <section aria-labelledby="projetos" className="space-y-4">
          <h2 id="projetos" className="text-[11px] font-mono text-zinc-400 uppercase tracking-widest">
            Projetos no banco ({rows.length})
          </h2>
          {rows.length === 0 ? (
            <p className="text-sm text-zinc-500 border border-dashed border-line p-6">
              Nenhum projeto ainda. Enfileire uma captura acima.
            </p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {rows.map(({ project, assets, lastJob }) => {
                const cover = assets.find((a) => a.id === project.coverAssetId);
                return (
                  <li key={project.id} className="border border-line bg-surface">
                    <div className="aspect-[16/10] bg-surface-2 overflow-hidden">
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element -- bytes servidos pelo AssetStorage, sem otimização do Next
                        <img src={`/api/atlas/assets/${cover.id}/file`} alt={`Captura de ${project.name}`}
                          className="w-full h-full object-cover object-top" />
                      ) : (
                        <div className="h-full grid place-items-center text-[11px] font-mono text-zinc-600">sem captura</div>
                      )}
                    </div>
                    <div className="p-4 space-y-1">
                      <p className="text-sm font-medium text-zinc-100">{project.name}</p>
                      <p className="text-[11px] font-mono text-zinc-500">
                        {project.slug} · {assets.length} asset{assets.length === 1 ? "" : "s"}
                        {lastJob ? ` · último job: ${lastJob.status}` : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

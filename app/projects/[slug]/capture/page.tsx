export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { AssetThumb } from "@/components/atlas/asset-image";
import { SourcesPanel } from "@/components/atlas/sources-panel";
import { EmptyState, Panel, SectionTitle } from "@/components/ui/primitives";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { requireProjectBySlug } from "@/src/modules/projects/project-service";

interface Props {
  params: Promise<{ slug: string }>;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "pendente",
  running: "em andamento",
  completed: "concluída",
  failed: "falhou",
  cancelled: "cancelada",
};

export default async function ProjectCapturePage({ params }: Props) {
  const { slug } = await params;
  const { repos } = await getAtlasRuntime();
  const project = await requireProjectBySlug(repos.projects, slug);
  const [sources, captures] = await Promise.all([repos.sources.listByProject(project.id), repos.captures.listByProject(project.id)]);
  const history = await Promise.all(
    [...captures].reverse().map(async (c) => ({ capture: c, assets: await repos.assets.listByCapture(c.id), source: sources.find((s) => s.id === c.sourceId) }))
  );

  return (
    <div className="grid gap-10 lg:grid-cols-[22rem_1fr]">
      <section aria-labelledby="capturar">
        <SectionTitle id="capturar">Capturar</SectionTitle>
        <p className="text-[13px] text-zinc-400 mb-4">
          A captura roda no worker, em segundo plano: pode sair desta página. Cancelar interrompe o navegador de verdade.
        </p>
        <SourcesPanel projectId={project.id} sources={sources} />
      </section>

      <section aria-labelledby="historico">
        <SectionTitle id="historico">Histórico de capturas ({captures.length})</SectionTitle>
        {history.length === 0 ? (
          <EmptyState title="Nenhuma captura ainda">Adicione a URL do site e clique em Capturar.</EmptyState>
        ) : (
          <ul className="space-y-4">
            {history.map(({ capture, assets, source }) => (
              <li key={capture.id}>
                <Panel className="p-4 space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[13px] text-zinc-200">
                      {new Date(capture.createdAt).toLocaleString("pt-BR")}
                      <span className="text-zinc-500"> · {source?.locator ?? capture.params.url ?? "origem removida"}</span>
                    </p>
                    <span className={`text-[11px] font-mono uppercase tracking-wider ${capture.status === "failed" ? "text-bad" : capture.status === "completed" ? "text-ok" : "text-zinc-400"}`}>
                      {STATUS_LABEL[capture.status]}
                    </span>
                  </div>
                  {capture.error && <p className="text-[12px] text-bad">{capture.error.message}</p>}
                  {assets.length > 0 && (
                    <ul className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {assets.slice(0, 10).map((a) => (
                        <li key={a.id} className="aspect-[16/10] border border-line overflow-hidden" title={a.label ?? a.kind}>
                          <AssetThumb id={a.mimeType.startsWith("image/") ? a.id : null} alt={a.label ?? a.kind} width={320} className="w-full h-full" />
                        </li>
                      ))}
                    </ul>
                  )}
                  {assets.length > 10 && <p className="text-[11px] text-zinc-500">+{assets.length - 10} assets</p>}
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

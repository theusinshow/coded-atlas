export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { AssetThumb } from "@/components/atlas/asset-image";
import { CaptureForm } from "@/components/atlas/capture-form";
import { EmptyState, Panel, SectionTitle } from "@/components/ui/primitives";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { requireProjectBySlug } from "@/src/modules/projects/project-service";

interface Props {
  params: Promise<{ slug: string }>;
}

const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "pendente", className: "text-zinc-400" },
  running: { label: "em andamento", className: "text-accent" },
  completed: { label: "concluída", className: "text-ok" },
  failed: { label: "falhou", className: "text-bad" },
  cancelled: { label: "cancelada", className: "text-zinc-500" },
};

function summarizePlan(params: {
  plan?: { devices: string[]; fullPage: boolean; sections: boolean; video: boolean; pages: string[]; states: unknown[] };
  viewport?: unknown;
}): string {
  const plan = params.plan;
  if (!plan) return params.viewport ? "viewport desktop" : "importado do v1";
  return [
    plan.devices.join(" + "),
    plan.fullPage && "página inteira",
    plan.sections && "seções",
    plan.video && "vídeo",
    plan.pages.length && `${plan.pages.length} página(s) extra(s)`,
    plan.states.length && `${plan.states.length} estado(s)`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default async function ProjectCapturePage({ params }: Props) {
  const { slug } = await params;
  const { repos } = await getAtlasRuntime();
  const project = await requireProjectBySlug(repos.projects, slug);
  const [sources, captures] = await Promise.all([repos.sources.listByProject(project.id), repos.captures.listByProject(project.id)]);
  const capturable = sources.filter((s) => s.type === "url" || s.type === "local");
  const history = await Promise.all(
    [...captures].reverse().map(async (c) => {
      const job = c.jobId ? await repos.jobs.getById(c.jobId) : null;
      const warnings = Array.isArray(job?.result?.warnings) ? (job.result.warnings as { code: string; message: string }[]) : [];
      return { capture: c, assets: await repos.assets.listByCapture(c.id), source: sources.find((s) => s.id === c.sourceId), warnings };
    })
  );

  return (
    <div className="grid gap-10 lg:grid-cols-[24rem_1fr]">
      <section aria-labelledby="capturar">
        <SectionTitle id="capturar">Nova captura</SectionTitle>
        <p className="text-[13px] text-zinc-400 mb-4">
          Roda no worker, em segundo plano — pode sair desta página. Cancelar interrompe o navegador de verdade.
        </p>
        <CaptureForm projectId={project.id} sources={capturable.map((s) => ({ id: s.id, locator: s.locator, type: s.type }))} />
        {capturable.length === 0 && (
          <Link href={`/projects/${project.slug}`} className="inline-block mt-3 text-[13px] text-accent">
            Adicionar origem na visão geral →
          </Link>
        )}
      </section>

      <section aria-labelledby="historico">
        <SectionTitle id="historico">Histórico de capturas ({captures.length})</SectionTitle>
        {history.length === 0 ? (
          <EmptyState title="Nenhuma captura ainda">Escolha a origem e o perfil ao lado e clique em Capturar.</EmptyState>
        ) : (
          <ul className="space-y-4">
            {history.map(({ capture, assets, source, warnings }) => (
              <li key={capture.id}>
                <Panel className="p-4 space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="text-[13px] text-zinc-200">
                        {new Date(capture.createdAt).toLocaleString("pt-BR")}
                        <span className="text-zinc-500"> · {source?.locator ?? capture.params.url ?? "origem removida"}</span>
                      </p>
                      <p className="text-[11px] text-zinc-500">{summarizePlan(capture.params)} · {assets.length} asset(s)</p>
                    </div>
                    <span className={`text-[11px] font-mono uppercase tracking-wider ${STATUS[capture.status].className}`}>{STATUS[capture.status].label}</span>
                  </div>
                  {capture.error && <p className="text-[12px] text-bad">{capture.error.message}</p>}
                  {warnings.length > 0 && (
                    <ul className="border border-warn/40 bg-warn/5 px-3 py-2 space-y-1">
                      {warnings.map((w, i) => (
                        <li key={`${w.code}-${i}`} className="text-[12px] text-zinc-300">
                          <span className="text-warn">⚠</span> {w.message}
                        </li>
                      ))}
                    </ul>
                  )}
                  {assets.length > 0 && (
                    <ul className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {assets.filter((a) => a.mimeType.startsWith("image/")).slice(0, 12).map((a) => (
                        <li key={a.id} className="aspect-[16/10] border border-line overflow-hidden" title={a.label ?? a.kind}>
                          <Link href={`/projects/${project.slug}/assets/${a.id}`}>
                            <AssetThumb id={a.id} alt={a.label ?? a.kind} width={320} className="w-full h-full" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

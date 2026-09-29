export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { AssetThumb } from "@/components/atlas/asset-image";
import { CaptureForm } from "@/components/atlas/capture-form";
import { SessionPanel, type SessionView } from "@/components/atlas/session-panel";
import { VisualDiffForm, type DiffCandidate } from "@/components/atlas/visual-diff-panel";
import { mediaTitle } from "@/components/media/labels";
import { ASSET_ROLE_LABEL, DEVICE_LABEL, plural } from "@/components/ui/format";
import { isDiffable } from "@/src/modules/capture/visual-diff";
import { EmptyState, Panel, SectionTitle } from "@/components/ui/primitives";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { requireProjectBySlug } from "@/src/modules/projects/project-service";

interface Props {
  params: Promise<{ slug: string }>;
}

const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "pendente", className: "text-cbm-gray-400" },
  running: { label: "em andamento", className: "text-cbm-white" },
  completed: { label: "concluída", className: "text-ok" },
  failed: { label: "falhou", className: "text-bad" },
  cancelled: { label: "cancelada", className: "text-cbm-gray-400" },
};

const ROLE: Record<string, string> = { ...ASSET_ROLE_LABEL, "page-viewport": "Página extra", "page-fullpage": "Página extra inteira" };
const THUMBS = 12;

/** O que a captura pediu, em português ("Desktop + Celular · página inteira · seções"). Importações antigas não têm plano. */
function summarizePlan(params: {
  plan?: { devices: string[]; fullPage: boolean; sections: boolean; video: boolean; pages: string[]; states: unknown[] };
  viewport?: unknown;
}): string | null {
  const plan = params.plan;
  if (!plan) return params.viewport ? "Tela desktop" : null;
  return [
    plan.devices.map((d) => DEVICE_LABEL[d] ?? d).join(" + "),
    plan.fullPage && "página inteira",
    plan.sections && "seções",
    plan.video && "vídeo",
    plan.pages.length > 0 && plural(plan.pages.length, "página extra", "páginas extras"),
    plan.states.length > 0 && plural(plan.states.length, "estado", "estados"),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "40 imagens", "38 imagens · 2 vídeos". */
function countLine(assets: { mimeType: string }[]): string {
  const videos = assets.filter((a) => a.mimeType.startsWith("video/")).length;
  const images = assets.length - videos;
  return [images > 0 && plural(images, "imagem", "imagens"), videos > 0 && plural(videos, "vídeo", "vídeos")].filter(Boolean).join(" · ") || "Nenhum arquivo";
}

const shortDate = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default async function ProjectCapturePage({ params }: Props) {
  const { slug } = await params;
  const { repos, sessions } = await getAtlasRuntime();
  const project = await requireProjectBySlug(repos.projects, slug);
  let session: SessionView | null = null;
  let sessionError: string | undefined;
  try {
    session = await sessions.info(project.id);
  } catch (err) {
    sessionError = err instanceof Error ? err.message : "Não foi possível ler a sessão salva.";
  }
  const [sources, captures] = await Promise.all([repos.sources.listByProject(project.id), repos.captures.listByProject(project.id)]);
  const capturable = sources.filter((s) => s.type === "url" || s.type === "local");
  const allAssets = [...(await repos.assets.listByProject(project.id))].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const candidates: DiffCandidate[] = allAssets.filter(isDiffable).map((a) => {
    const detail = a.metadata.sectionName ?? a.metadata.pagePath ?? a.metadata.stateName;
    return {
      id: a.id,
      group: [a.metadata.device ? DEVICE_LABEL[a.metadata.device] : "Sem dispositivo", ROLE[a.metadata.role ?? ""] ?? a.metadata.role, detail].filter(Boolean).join(" · "),
      label: `${shortDate(a.createdAt)} · ${a.width ?? "?"}×${a.height ?? "?"}`,
    };
  });
  const byId = new Map(allAssets.map((a) => [a.id as string, a]));
  const diffs = allAssets.filter((a) => a.metadata.role === "diff").slice(0, 6);
  const history = await Promise.all(
    [...captures].reverse().map(async (c) => {
      const job = c.jobId ? await repos.jobs.getById(c.jobId) : null;
      const warnings = Array.isArray(job?.result?.warnings) ? (job.result.warnings as { code: string; message: string }[]) : [];
      return { capture: c, assets: await repos.assets.listByCapture(c.id), source: sources.find((s) => s.id === c.sourceId), warnings };
    })
  );
  const materialHref = `/projects/${project.slug}/assets`;

  return (
    <div className="grid gap-10 lg:grid-cols-[22rem_minmax(0,1fr)] xl:grid-cols-[24rem_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <section aria-labelledby="capturar">
          <SectionTitle id="capturar">Nova captura</SectionTitle>
          <CaptureForm
            projectId={project.id}
            addSourceHref={`/projects/${project.slug}`}
            sources={capturable.map((s) => ({ id: s.id, locator: s.locator, type: s.type }))}
          />
        </section>
        <SessionPanel projectId={project.id} slug={project.slug} session={session} error={sessionError} />
      </div>

      <div className="min-w-0 space-y-10">
        {captures.length >= 2 && (
          <section aria-labelledby="diff">
            <SectionTitle id="diff">Comparar capturas</SectionTitle>
            <Panel className="space-y-5 p-4">
              <p className="text-[13px] text-cbm-gray-400">Compare duas capturas do mesmo dispositivo para ver o que mudou no site.</p>
              <VisualDiffForm candidates={candidates} />
              {diffs.length > 0 && (
                <ul className="space-y-6 border-t border-line pt-5" data-diff-results>
                  {diffs.map((d) => {
                    const before = d.metadata.comparedTo ? byId.get(d.metadata.comparedTo) : undefined;
                    const after = d.parentAssetId ? byId.get(d.parentAssetId) : undefined;
                    const percent = d.metadata.changedPercent ?? 0;
                    const where = (d.label ?? "").replace(/^Diferença [\d.,]+%( · )?/, "");
                    return (
                      <li key={d.id} className="space-y-2" data-diff={d.id}>
                        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span className={`text-xl font-semibold tabular-nums ${percent < 0.1 ? "text-ok" : "text-warn"}`}>{percent.toLocaleString("pt-BR")}%</span>
                          <span className="text-[13px] text-cbm-gray-400">
                            {percent < 0.1 ? "praticamente sem mudanças" : "da página mudou"}
                            {where ? ` · ${where}` : ""}
                          </span>
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: "Antes", asset: before },
                            { label: "Depois", asset: after },
                            { label: "Diferença", asset: d },
                          ].map((col) => (
                            <div key={col.label} className="min-w-0 space-y-1">
                              <p className="truncate text-[11px] text-cbm-gray-400">
                                <span className="font-medium uppercase tracking-[0.22em]">{col.label}</span>
                                {col.asset && col.label !== "Diferença" ? <span className="hidden sm:inline"> · {shortDate(col.asset.createdAt)}</span> : null}
                              </p>
                              {col.asset ? (
                                <Link href={`/projects/${project.slug}/assets/${col.asset.id}`} className="block aspect-[16/10] overflow-hidden border border-line transition-colors hover:border-cbm-gray-400">
                                  <AssetThumb id={col.asset.id} alt={col.label} width={640} className="h-full w-full" />
                                </Link>
                              ) : (
                                <div className="grid aspect-[16/10] place-items-center border border-line text-[12px] text-cbm-gray-400">Removida</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </section>
        )}

        <section aria-labelledby="historico">
          <SectionTitle id="historico">Histórico de capturas ({captures.length})</SectionTitle>
          {history.length === 0 ? (
            <EmptyState title="Nenhuma captura ainda" />
          ) : (
            <ul className="space-y-4">
              {history.map(({ capture, assets, source, warnings }) => {
                const summary = summarizePlan(capture.params);
                const images = assets.filter((a) => a.mimeType.startsWith("image/") && a.metadata.role !== "diff");
                const shown = images.slice(0, images.length > THUMBS ? THUMBS - 1 : THUMBS);
                const rest = images.length - shown.length;
                return (
                  <li key={capture.id}>
                    <Panel className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[13px] text-cbm-gray-200">{new Date(capture.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p>
                          <p className="truncate text-[12px] text-cbm-gray-400" title={source?.locator ?? capture.params.url ?? undefined}>
                            {source?.locator ?? capture.params.url ?? "Origem removida"}
                          </p>
                          <p className="text-[12px] text-cbm-gray-400">{[summary, countLine(assets)].filter(Boolean).join(" · ")}</p>
                        </div>
                        <span className={`shrink-0 text-[11px] font-medium uppercase tracking-[0.22em] ${STATUS[capture.status].className}`}>{STATUS[capture.status].label}</span>
                      </div>
                      {capture.error && <p className="text-[13px] text-bad">{capture.error.message}</p>}
                      {warnings.length > 0 && (
                        <ul className="space-y-1 border border-warn/40 px-3 py-2">
                          {warnings.map((w, i) => (
                            <li key={`${w.code}-${i}`} className="flex gap-2 text-[13px] text-cbm-gray-200">
                              <TriangleAlert size={14} aria-hidden className="mt-0.5 shrink-0 text-warn" />
                              <span className="min-w-0">{w.message}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {shown.length > 0 && (
                        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
                          {shown.map((a) => (
                            <li key={a.id} className="aspect-[16/10] overflow-hidden border border-line transition-colors hover:border-cbm-gray-400" title={mediaTitle(a)}>
                              <Link href={`/projects/${project.slug}/assets/${a.id}`} className="block h-full w-full">
                                <AssetThumb id={a.id} alt={mediaTitle(a)} width={320} className="h-full w-full" />
                              </Link>
                            </li>
                          ))}
                          {rest > 0 && (
                            <li className="aspect-[16/10] border border-line transition-colors hover:border-cbm-gray-400">
                              <Link href={materialHref} className="grid h-full w-full place-items-center text-[13px] text-cbm-gray-200 hover:text-cbm-white">
                                +{rest}
                                <span className="sr-only"> imagens no Material</span>
                              </Link>
                            </li>
                          )}
                        </ul>
                      )}
                    </Panel>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

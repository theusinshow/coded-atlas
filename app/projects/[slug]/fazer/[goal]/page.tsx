export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { Check } from "lucide-react";
import { FramedArtboard } from "@/components/create/artboard-preview";
import { outputFileUrl, outputThumbUrl } from "@/components/create/output-card";
import { RenderFonts } from "@/components/create/render-fonts";
import { BuildKitButton, CopyPath, DownloadLink, GenerateButton, PieceActions, RecaptureButton, RevealFolderButton, SaveToFolderButton } from "@/components/goals/goal-actions";
import { buildItemViews, frameRatio } from "@/components/kits/item-views";
import { KitVideo } from "@/components/kits/kit-forms";
import { Breadcrumb, LinkButton } from "@/components/ui/primitives";
import { plural, relativeTime } from "@/components/ui/format";
import { isTerminal } from "@/src/core/jobs/job";
import { currentKitFor, getGoal, kitFiles } from "@/src/core/kits/goals";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { requireProjectBySlug } from "@/src/modules/projects/project-service";
import { JobIdSchema } from "@/src/shared/id";

interface Props {
  params: Promise<{ slug: string; goal: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { goal } = await params;
  return { title: `${getGoal(goal)?.title ?? "Objetivo"} — Coded Atlas` };
}

type StepState = "done" | "current" | "locked";

/** Um passo do caminho: número, título, estado e conteúdo. Passos travados ficam apagados. */
function Step({ n, title, state, summary, children }: { n: number; title: string; state: StepState; summary?: ReactNode; children?: ReactNode }) {
  return (
    <section aria-labelledby={`passo-${n}`} data-goal-step={n} data-step-state={state} className={`border-t border-line pt-6 ${state === "locked" ? "opacity-50" : ""}`}>
      <div className="grid gap-x-6 gap-y-4 md:grid-cols-[200px_minmax(0,1fr)]">
        <div className="flex items-start gap-3">
          <span className={`grid h-7 w-7 shrink-0 place-items-center border font-display text-[12px] font-semibold ${state === "done" ? "border-ok/50 text-ok" : state === "current" ? "border-cbm-white text-cbm-white" : "border-line text-cbm-gray-400"}`} aria-hidden>
            {state === "done" ? <Check size={14} /> : n}
          </span>
          <div className="min-w-0">
            <h2 id={`passo-${n}`} className="text-[15px] font-semibold leading-tight text-cbm-white">
              {title}
              {state === "done" && <span className="sr-only"> (feito)</span>}
            </h2>
            {summary && <p className="mt-1 text-[12px] leading-snug text-cbm-gray-400">{summary}</p>}
          </div>
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

export default async function GoalPage({ params }: Props) {
  const { slug, goal: goalId } = await params;
  const goal = getGoal(goalId);
  if (!goal) notFound();
  if (!goal.presetId) redirect(`/projects/${slug}/cases`);

  const { repos, exportDeps } = await getAtlasRuntime();
  const project = await requireProjectBySlug(repos.projects, slug);
  const [kits, assets, captures, profiles, outputs, exports, sources] = await Promise.all([
    repos.kits.listByProject(project.id),
    repos.assets.listByProject(project.id),
    repos.captures.listByProject(project.id),
    repos.visualProfiles.listByProject(project.id),
    repos.outputs.listByProject(project.id),
    repos.exports.listByProject(project.id),
    repos.sources.listByProject(project.id),
  ]);
  const base = `/projects/${project.slug}`;
  const kit = currentKitFor(kits, goal.presetId);

  // 1 · Material
  const images = assets.filter((a) => a.mimeType.startsWith("image/")).length;
  const lastCapture = captures.filter((c) => c.status === "completed").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))[0];
  const runningCapture = captures.find((c) => c.status === "running" || c.status === "pending");
  const hasSite = sources.some((s) => s.type === "url" || s.type === "local");
  const materialReady = images > 0;

  // 2 · Peças
  const views = kit ? await buildItemViews(repos, project.slug, kit, assets, profiles) : [];
  const ratio = kit ? frameRatio(kit.items) : 16 / 9;

  // 3 · Gerar
  const lastJob = kit?.lastRenderJobId ? await repos.jobs.getById(JobIdSchema.parse(kit.lastRenderJobId)) : null;
  const busyJobId = lastJob && !isTerminal(lastJob.status) ? lastJob.id : null;
  const files = kit ? kitFiles(outputs, kit) : [];
  const generated = kit?.status === "rendered" && files.length > 0;
  const renderFailed = !!lastJob && lastJob.status === "failed" && !busyJobId;
  const hasVideo = !!kit?.items.some((i) => i.kind === "video" && i.documentId);

  // 4 · Pronto: entregas em pasta destes mesmos arquivos.
  const fileIds = new Set(files.map((f) => f.id as string));
  const delivery = exports
    .filter((e) => e.destination === "folder" && e.status === "delivered" && e.result.folder && e.outputIds.some((id) => fileIds.has(id)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  const stateOf = (done: boolean, unlocked: boolean): StepState => (done ? "done" : unlocked ? "current" : "locked");
  const s1 = stateOf(materialReady && !runningCapture, true);
  const s2 = stateOf(!!kit, materialReady);
  const s3 = stateOf(generated, !!kit);
  const s4: StepState = generated ? "current" : "locked";

  const byItem = new Map(kit?.items.map((i) => [i.id, files.filter((f) => f.metadata.kitItemId === i.id)]) ?? []);

  return (
    <div className="space-y-8">
      <RenderFonts />
      <Breadcrumb items={[{ label: project.name, href: base }, { label: goal.title }]} />
      <header className="space-y-1.5">
        <h2 className="font-display text-[20px] font-bold leading-tight text-cbm-white tracking-[-0.01em]">{goal.title}</h2>
        <p className="text-[13px] text-cbm-gray-400">{goal.description}</p>
      </header>

      <Step
        n={1}
        title="Material"
        state={s1}
        summary={materialReady ? (lastCapture ? `Captura de ${new Date(lastCapture.completedAt ?? lastCapture.createdAt).toLocaleDateString("pt-BR")} · ${plural(images, "imagem", "imagens")}` : plural(images, "imagem", "imagens")) : "Nenhuma imagem do site ainda."}
      >
        {hasSite ? (
          <div className="space-y-3">
            {materialReady && <p className="text-[13px] text-cbm-gray-200">O site mudou desde a última captura? Capture de novo antes de montar as peças.</p>}
            <RecaptureButton projectId={project.id} variant={materialReady ? "secondary" : "primary"} label={materialReady ? "Capturar de novo" : "Capturar o site"} busyJobId={runningCapture?.jobId ?? null} />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[13px] text-cbm-gray-200">Este projeto não tem o endereço do site.</p>
            <LinkButton href={`${base}/settings`} size="sm">
              Adicionar endereço
            </LinkButton>
          </div>
        )}
      </Step>

      <Step n={2} title="Peças" state={s2} summary={kit ? `${plural(kit.items.length, "peça", "peças")} · troque o visual ou tire o que não quiser` : "O Atlas monta as peças com o material do passo 1."}>
        {!kit ? (
          <BuildKitButton projectId={project.id} goalId={goal.id} variant={materialReady ? "primary" : "secondary"} label="Montar as peças" disabled={!materialReady} />
        ) : (
          <div className="space-y-5">
            <ul className={`grid gap-x-5 gap-y-8 ${ratio > 1.2 ? "sm:grid-cols-2" : "grid-cols-2 lg:grid-cols-3"}`}>
              {views.map(({ item, preview, href, detail }) => (
                <li key={item.id} className="flex min-w-0 flex-col" data-goal-piece={item.presetItemId}>
                  {preview ? (
                    <FramedArtboard artboard={preview.artboard} tokens={preview.tokens} ratio={ratio} className="border border-line" />
                  ) : (
                    <div className="grid place-items-center border border-dashed border-line p-4 text-center text-[12px] text-cbm-gray-400" style={{ aspectRatio: ratio }}>
                      {item.note ?? "Não foi possível montar esta peça com o material atual."}
                    </div>
                  )}
                  <div className="mt-3 min-w-0">
                    <p className="truncate text-[13px] text-cbm-white" title={item.label}>
                      {item.label}
                    </p>
                    <p className="truncate text-[12px] text-cbm-gray-400" title={detail}>
                      {detail}
                    </p>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4">
                    <PieceActions kitId={kit.id} itemId={item.id} label={item.label} canSwap={item.kind === "composition" && !!item.instanceId} canRemove={kit.items.length > 1} locked={!!busyJobId} />
                    {href && (
                      <Link href={href} className="inline-flex h-10 sm:h-8 items-center text-[12px] text-cbm-gray-400 hover:text-cbm-white">
                        Ajustar no editor
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <details className="text-[12px] text-cbm-gray-400">
              <summary className="inline-flex h-10 sm:h-8 cursor-pointer items-center hover:text-cbm-white">Começar um conjunto novo</summary>
              <div className="mt-2 space-y-2">
                <p>Monta outro conjunto do zero com o material atual. Este continua salvo em Avançado → Criar.</p>
                <BuildKitButton projectId={project.id} goalId={goal.id} variant="secondary" label="Montar de novo" />
              </div>
            </details>
          </div>
        )}
      </Step>

      <Step
        n={3}
        title="Gerar"
        state={s3}
        summary={generated && kit ? `${plural(files.length, "arquivo gerado", "arquivos gerados")} ${relativeTime(kit.updatedAt)}` : "Transforma as peças em arquivos (PNG e vídeo MP4)."}
      >
        {kit && (
          <div className="space-y-3">
            {renderFailed && (
              <p role="alert" className="text-[13px] text-bad">
                A última geração falhou{lastJob?.error?.message ? `: ${lastJob.error.message}` : "."} Tente de novo.
              </p>
            )}
            {generated && !busyJobId ? (
              <GenerateButton kitId={kit.id} hasVideo={hasVideo} busyJobId={null} variant="secondary" label="Gerar de novo" />
            ) : (
              <GenerateButton kitId={kit.id} hasVideo={hasVideo} busyJobId={busyJobId} variant="primary" label={renderFailed ? "Tentar de novo" : "Gerar arquivos"} />
            )}
          </div>
        )}
      </Step>

      <Step n={4} title="Pronto" state={s4} summary={generated ? "Baixe ou salve os arquivos." : "Os arquivos aparecem aqui depois de gerar."}>
        {kit && generated && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start gap-3">
              <DownloadLink href={`/api/atlas/kits/${kit.id}/zip`} primary>
                Baixar tudo (.zip)
              </DownloadLink>
              {!delivery && <SaveToFolderButton kitId={kit.id} label="Salvar na pasta" />}
              {goal.id === "instagram" && (
                <LinkButton href="/social" variant="secondary">
                  Abrir o planejador Social
                </LinkButton>
              )}
            </div>

            {delivery?.result.folder && (
              <div className="space-y-2 border border-line bg-surface p-4" data-goal-folder>
                <p className="text-[12px] text-cbm-gray-400">Salvo na pasta {relativeTime(delivery.createdAt)}:</p>
                <CopyPath path={exportDeps.folder.locate(delivery.result.folder)} />
                <div className="flex flex-wrap items-center gap-4">
                  {exportDeps.folder.canReveal && <RevealFolderButton exportId={delivery.id} primary />}
                  <SaveToFolderButton kitId={kit.id} label="Salvar de novo" />
                </div>
              </div>
            )}

            <ul className="grid gap-x-5 gap-y-6 sm:grid-cols-2 lg:grid-cols-3" aria-label="Arquivos gerados">
              {kit.items.map((item) => {
                const mine = (byItem.get(item.id) ?? []).sort((a, b) => (a.metadata.page ?? 0) - (b.metadata.page ?? 0) || a.format.localeCompare(b.format));
                if (mine.length === 0) return null;
                const video = mine.find((o) => o.mimeType.startsWith("video/"));
                const still = mine.find((o) => o.mimeType.startsWith("image/"));
                return (
                  <li key={item.id} className="min-w-0" data-goal-file={item.presetItemId}>
                    {video ? (
                      <div className="border border-line">
                        <KitVideo src={outputFileUrl(video.id)} poster={outputThumbUrl(video.id, 640)} durationMs={video.durationMs} label={item.label} ratio={ratio} />
                      </div>
                    ) : still ? (
                      // eslint-disable-next-line @next/next/no-img-element -- miniatura servida pelo AssetStorage
                      <img src={outputThumbUrl(still.id, 640)} alt={item.label} loading="lazy" className="block w-full border border-line bg-surface-2 object-contain" style={{ aspectRatio: ratio }} />
                    ) : null}
                    <p className="mt-2 truncate text-[13px] text-cbm-white">{item.label}</p>
                    <div className="flex flex-wrap gap-x-4">
                      {video ? (
                        <DownloadLink href={outputFileUrl(video.id, true)}>MP4</DownloadLink>
                      ) : mine.length === 1 ? (
                        <DownloadLink href={outputFileUrl(mine[0].id, true)}>{mine[0].format.toUpperCase()}</DownloadLink>
                      ) : (
                        <span className="inline-flex h-10 sm:h-8 items-center text-[12px] text-cbm-gray-400">{plural(mine.length, "arquivo", "arquivos")} no ZIP</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Step>
    </div>
  );
}

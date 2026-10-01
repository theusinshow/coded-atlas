export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { AssetThumb } from "@/components/atlas/asset-image";
import { SourcesPanel } from "@/components/atlas/sources-panel";
import { VisualIdentity } from "@/components/atlas/visual-identity";
import { IdentityEditor } from "@/components/creative/identity-editor";
import { DownloadLink, RevealFolderButton } from "@/components/goals/goal-actions";
import { Collapsible, SectionTitle } from "@/components/ui/primitives";
import { plural, relativeTime } from "@/components/ui/format";
import { currentKitFor, goalAction, goalOfPreset, GOALS, kitFiles } from "@/src/core/kits/goals";
import { getKitPreset } from "@/src/core/kits/media-kit";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { getProjectOverview } from "@/src/modules/projects/overview";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { repos } = await getAtlasRuntime();
  const project = await repos.projects.getBySlug(slug).catch(() => null);
  return { title: `${project?.name ?? "Projeto"} — Coded Atlas` };
}

const ACTION_LABEL = { start: "Começar", resume: "Continuar de onde parou", done: "Ver arquivos" } as const;

/**
 * Início do projeto (Atlas 3.3 — começar pelo objetivo): a primeira pergunta é o
 * que o Matheus quer fazer; logo abaixo, onde estão os arquivos já gerados. O resto
 * (identidade, endereços) fica recolhido; as telas completas vivem em "Avançado".
 */
export default async function ProjectHomePage({ params }: Props) {
  const { slug } = await params;
  const runtime = await getAtlasRuntime();
  const o = await getProjectOverview(runtime.repos, slug);
  const [profile, kits, outputs, exports] = await Promise.all([
    runtime.repos.visualProfiles.latest(o.project.id),
    runtime.repos.kits.listByProject(o.project.id),
    runtime.repos.outputs.listByProject(o.project.id),
    runtime.repos.exports.listByProject(o.project.id),
  ]);
  const base = `/projects/${o.project.slug}`;
  const url = o.sources.find((s) => s.type === "url" || s.type === "local");
  const caseCount = (await runtime.repos.documents.listByProject(o.project.id)).filter((d) => d.kind === "case").length;

  const delivered = kits
    .filter((k) => k.status === "rendered")
    .map((kit) => {
      const files = kitFiles(outputs, kit);
      const ids = new Set(files.map((f) => f.id as string));
      const folder = exports
        .filter((e) => e.destination === "folder" && e.status === "delivered" && e.result.folder && e.outputIds.some((id) => ids.has(id)))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      return { kit, files, folder, goal: goalOfPreset(kit.presetId) };
    })
    .filter((d) => d.files.length > 0)
    .sort((a, b) => b.kit.updatedAt.localeCompare(a.kit.updatedAt))
    .slice(0, 6);

  return (
    <div className="space-y-12">
      <section aria-labelledby="objetivo">
        <h2 id="objetivo" className="mb-4 font-display text-[18px] font-bold leading-tight tracking-[-0.01em] text-cbm-white">
          O que você quer fazer?
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {GOALS.map((goal) => {
            const kit = goal.presetId ? currentKitFor(kits, goal.presetId) : null;
            const action = goal.presetId ? goalAction(kit) : caseCount > 0 ? "resume" : "start";
            const pieces = goal.presetId ? (getKitPreset(goal.presetId)?.items.map((i) => i.label) ?? []) : ["Página web", "PDF", "Apresentação"];
            return (
              <li key={goal.id} className="min-w-0">
                <Link
                  href={`${base}/fazer/${goal.id}`}
                  className="group flex h-full flex-col border border-line bg-surface p-5 transition-colors hover:border-cbm-gray-400 focus-visible:border-cbm-white"
                  data-goal={goal.id}
                >
                  <span className="text-[15px] font-semibold leading-snug text-cbm-white">{goal.title}</span>
                  <span className="mt-1.5 text-[12px] leading-snug text-cbm-gray-400">{goal.description}</span>
                  <span className="mt-4 flex flex-wrap gap-1" aria-label="O que sai">
                    {pieces.map((p) => (
                      <span key={p} className="border border-line px-1.5 py-0.5 text-[11px] text-cbm-gray-400">
                        {p}
                      </span>
                    ))}
                  </span>
                  <span className="mt-auto flex items-center gap-1.5 pt-5 text-[12px] text-accent group-hover:text-accent-bright">
                    {ACTION_LABEL[action]}
                    <ArrowRight size={14} className="transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="arquivos">
        <SectionTitle
          id="arquivos"
          aside={
            <Link href={`${base}/publish`} className="-my-2 inline-flex h-10 items-center gap-1 text-[12px] text-cbm-gray-400 hover:text-cbm-white sm:my-0 sm:h-8">
              Todas as entregas
              <ArrowRight size={14} aria-hidden />
            </Link>
          }
        >
          Seus arquivos
        </SectionTitle>
        {delivered.length === 0 ? (
          <p className="border border-dashed border-line p-5 text-[13px] text-cbm-gray-400">Nada gerado ainda. Escolha um objetivo acima: no fim do caminho os arquivos aparecem aqui.</p>
        ) : (
          <ul className="divide-y divide-line border border-line" data-home-files>
            {delivered.map(({ kit, files, folder, goal }) => (
              <li key={kit.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-[13px] text-cbm-gray-100">{goal?.title ?? kit.name}</p>
                  <p className="text-[12px] text-cbm-gray-400">
                    {plural(files.length, "arquivo", "arquivos")} · {relativeTime(kit.updatedAt)}
                    {folder && " · salvo na pasta"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-x-4">
                  <DownloadLink href={`/api/atlas/kits/${kit.id}/zip`}>Baixar (.zip)</DownloadLink>
                  {folder && runtime.exportDeps.folder.canReveal && <RevealFolderButton exportId={folder.id} />}
                  {goal && (
                    <Link href={`${base}/fazer/${goal.id}`} className="inline-flex h-10 sm:h-8 items-center text-[12px] text-cbm-gray-400 hover:text-cbm-white">
                      Abrir
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="projeto" className="space-y-3">
        <SectionTitle id="projeto">Sobre o projeto</SectionTitle>
        <div className="grid gap-6 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className="aspect-video overflow-hidden border border-line">
            <AssetThumb id={o.cover?.id} alt={`Capa de ${o.project.name}`} width={640} className="h-full w-full" />
          </div>
          <div className="min-w-0 space-y-3">
            {o.project.description && <p className="text-sm leading-relaxed text-cbm-gray-200">{o.project.description}</p>}
            {url && (
              <a href={url.locator} target="_blank" rel="noreferrer" className="flex min-h-10 min-w-0 items-center gap-1.5 text-[13px] text-accent hover:text-accent-bright sm:min-h-0">
                <span className="truncate">{url.locator.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
                <ArrowUpRight size={14} className="shrink-0" aria-hidden />
                <span className="sr-only">(abre em nova aba)</span>
              </a>
            )}
            <p className="text-[12px] text-cbm-gray-400">
              {plural(o.totalAssets, "item de material", "itens de material")} · {plural(o.outputs, "arquivo gerado", "arquivos gerados")}
            </p>
          </div>
        </div>
        <Collapsible title="Identidade visual" meta={profile ? `${plural(profile.palette.length, "cor", "cores")}` : "não lida ainda"}>
          <div className="space-y-4">
            <VisualIdentity profile={profile} />
            <IdentityEditor projectId={o.project.id} profile={profile} />
          </div>
        </Collapsible>
        <Collapsible title="Endereços do site" meta={plural(o.sources.length, "endereço", "endereços")}>
          <SourcesPanel projectId={o.project.id} sources={o.sources} />
        </Collapsible>
      </section>
    </div>
  );
}

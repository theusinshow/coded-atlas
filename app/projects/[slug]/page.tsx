export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { AssetThumb } from "@/components/atlas/asset-image";
import { SourcesPanel } from "@/components/atlas/sources-panel";
import { VisualIdentity } from "@/components/atlas/visual-identity";
import { IdentityEditor } from "@/components/creative/identity-editor";
import { LABEL_CLASS, LinkButton, Panel, SectionTitle } from "@/components/ui/primitives";
import { JOB_TYPE_LABEL, JobStatusBadge, jobOutcome } from "@/components/ui/status";
import { relativeTime } from "@/components/ui/format";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { getProjectOverview } from "@/src/modules/projects/overview";
import { nextStep, stepStatuses } from "@/src/modules/projects/next-step";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { repos } = await getAtlasRuntime();
  const project = await repos.projects.getBySlug(slug).catch(() => null);
  return { title: `${project?.name ?? "Projeto"} — Coded Atlas` };
}

export default async function ProjectOverviewPage({ params }: Props) {
  const { slug } = await params;
  const runtime = await getAtlasRuntime();
  const o = await getProjectOverview(runtime.repos, slug);
  const profile = await runtime.repos.visualProfiles.latest(o.project.id);
  const url = o.sources.find((s) => s.type === "url" || s.type === "local");
  const [kits, documents, exports] = await Promise.all([
    runtime.repos.kits.listByProject(o.project.id),
    runtime.repos.documents.listByProject(o.project.id),
    runtime.repos.exports.listByProject(o.project.id),
  ]);
  const progress = {
    hasSiteSource: Boolean(url),
    assets: o.totalAssets,
    kits: kits.length,
    renderedKits: kits.filter((k) => k.status === "rendered").length,
    pendingKitId: kits.find((k) => k.status !== "rendered")?.id ?? null,
    cases: documents.filter((d) => d.kind === "case").length,
    documents: documents.filter((d) => d.kind !== "case").length,
    outputs: o.outputs,
    exports: exports.length,
  };
  const next = nextStep(progress);
  const steps = stepStatuses(progress);
  const base = `/projects/${o.project.slug}`;
  const hrefOf = (h: string) => (h.startsWith("#") ? h : h ? `${base}/${h}` : base);

  return (
    <div className="space-y-10">
      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="aspect-video border border-line overflow-hidden">
          <AssetThumb id={o.cover?.id} alt={`Capa de ${o.project.name}`} width={1280} className="w-full h-full" />
        </div>
        <div className="min-w-0 space-y-5">
          {o.project.description && <p className="text-sm text-cbm-gray-200 leading-relaxed">{o.project.description}</p>}
          {url && (
            <a href={url.locator} target="_blank" rel="noreferrer" className="flex min-h-10 min-w-0 items-center gap-1.5 text-[13px] text-accent hover:text-accent-bright sm:min-h-0">
              <span className="truncate">{url.locator.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
              <ArrowUpRight size={14} className="shrink-0" aria-hidden />
              <span className="sr-only">(abre em nova aba)</span>
            </a>
          )}
          <div className="border border-line bg-surface p-5 space-y-3" data-next-step={next.step}>
            <p className={`${LABEL_CLASS} !mb-0`}>Próximo passo</p>
            <h2 className="text-[18px] font-semibold leading-snug text-cbm-white">{next.title}</h2>
            <p className="text-[13px] text-cbm-gray-400 leading-relaxed">{next.detail}</p>
            <LinkButton href={hrefOf(next.href)} variant="primary" className="max-sm:w-full">
              {next.cta}
            </LinkButton>
          </div>
          <ol className="grid grid-cols-3 gap-2" aria-label="Passos do projeto">
            {steps.map((st) => (
              <li key={st.key} className="min-w-0">
                <Link
                  href={hrefOf(st.href)}
                  className={`block h-full border px-3 py-3 transition-colors hover:border-cbm-gray-400 ${next.step === st.key ? "border-cbm-gray-600" : "border-line"}`}
                  data-step={st.key}
                  data-step-done={st.done}
                >
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-medium uppercase tracking-[0.14em] text-cbm-gray-400 sm:tracking-[0.22em]">
                    <span className={`grid h-4 w-4 shrink-0 place-items-center text-[11px] font-semibold tabular-nums ${st.done ? "text-ok" : next.step === st.key ? "text-cbm-white" : "text-cbm-gray-400"}`} aria-hidden>
                      {st.done ? <Check size={14} /> : st.number}
                    </span>
                    <span>{st.label}</span>
                    {st.done && <span className="sr-only">(feito)</span>}
                  </p>
                  <p className="mt-1.5 text-[12px] text-cbm-gray-200 leading-snug">{st.summary}</p>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="identidade">
        <SectionTitle id="identidade">Identidade visual</SectionTitle>
        <div className="space-y-4">
          <VisualIdentity profile={profile} />
          <IdentityEditor projectId={o.project.id} profile={profile} />
        </div>
      </section>

      <div className="grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="origens" className="min-w-0">
          <SectionTitle id="origens">Origens</SectionTitle>
          <SourcesPanel projectId={o.project.id} sources={o.sources} />
        </section>

        <section aria-labelledby="atividade" className="min-w-0">
          <SectionTitle
            id="atividade"
            aside={
              <Link href="/jobs" className="-my-2 inline-flex h-10 items-center gap-1 text-[12px] text-cbm-gray-400 hover:text-cbm-white sm:my-0 sm:h-8">
                Ver atividade
                <ArrowRight size={14} aria-hidden />
              </Link>
            }
          >
            Atividade recente
          </SectionTitle>
          {o.recentJobs.length === 0 ? (
            <p className="text-[13px] text-cbm-gray-400">Nenhuma atividade ainda.</p>
          ) : (
            <Panel>
              <ul className="divide-y divide-line">
                {o.recentJobs.map((job) => (
                  <li key={job.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[13px] text-cbm-gray-200">{JOB_TYPE_LABEL[job.type] ?? job.type}</p>
                      <p className={`text-[12px] truncate ${job.status === "failed" ? "text-bad" : "text-cbm-gray-400"}`}>
                        {jobOutcome(job)} · {relativeTime(job.updatedAt)}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <JobStatusBadge status={job.status} />
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </section>
      </div>
    </div>
  );
}

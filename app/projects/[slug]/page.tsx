export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Metadata } from "next";
import { AssetThumb } from "@/components/atlas/asset-image";
import { SourcesPanel } from "@/components/atlas/sources-panel";
import { VisualIdentity } from "@/components/atlas/visual-identity";
import { IdentityEditor } from "@/components/creative/identity-editor";
import { Panel, SectionTitle } from "@/components/ui/primitives";
import { JOB_TYPE_LABEL, JobStatusBadge } from "@/components/ui/status";
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
        <div className="space-y-5">
          {o.project.description && <p className="text-sm text-cbm-gray-200 leading-relaxed">{o.project.description}</p>}
          {url && (
            <a href={url.locator} target="_blank" rel="noreferrer" className="block text-[13px] font-mono text-accent hover:text-accent-bright truncate">
              {url.locator} ↗
            </a>
          )}
          <div className="border border-line bg-surface p-5 space-y-3" data-next-step={next.step}>
            <p className="text-[10px] font-medium uppercase tracking-[0.35em] text-signal/70">Próximo passo</p>
            <p className="font-display text-lg font-bold text-cbm-white tracking-[-0.01em]">{next.title}</p>
            <p className="text-[13px] text-cbm-gray-400 leading-relaxed">{next.detail}</p>
            <Link
              href={hrefOf(next.href)}
              className="inline-flex h-10 items-center bg-signal px-5 text-[11px] font-display font-semibold uppercase tracking-[0.12em] text-cbm-black hover:bg-signal-dark"
            >
              {next.cta}
            </Link>
          </div>
          <ol className="grid grid-cols-3 gap-2" aria-label="Passos do projeto">
            {steps.map((st) => (
              <li key={st.key}>
                <Link href={hrefOf(st.href)} className="block h-full border border-line px-3 py-3 hover:border-cbm-gray-400 transition-colors" data-step={st.key} data-step-done={st.done}>
                  <p className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.22em] text-cbm-gray-400">
                    <span className={`font-display text-[11px] font-semibold ${st.done ? "text-ok" : next.step === st.key ? "text-signal" : "text-cbm-gray-600"}`} aria-hidden>
                      {st.done ? "✓" : st.number}
                    </span>
                    {st.label}
                  </p>
                  <p className="mt-1.5 text-[12px] text-cbm-gray-200 leading-snug">{st.summary}</p>
                </Link>
              </li>
            ))}
          </ol>
          {o.project.origin === "legacy" && (
            <p className="text-[12px] text-cbm-gray-400">Importado da biblioteca v1 (arquivos originais preservados em public/generated).</p>
          )}
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
        <section aria-labelledby="origens">
          <SectionTitle id="origens">Origens</SectionTitle>
          <SourcesPanel projectId={o.project.id} sources={o.sources} />
        </section>

        <section aria-labelledby="atividade">
          <SectionTitle id="atividade" aside={<Link href="/jobs" className="text-[12px] text-cbm-gray-400 hover:text-cbm-gray-200">Todos os jobs</Link>}>
            Atividade recente
          </SectionTitle>
          {o.recentJobs.length === 0 ? (
            <p className="text-[13px] text-cbm-gray-400">Nenhum job ainda.</p>
          ) : (
            <Panel>
              <ul className="divide-y divide-line">
                {o.recentJobs.map((job) => (
                  <li key={job.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[13px] text-cbm-gray-200">{JOB_TYPE_LABEL[job.type] ?? job.type}</p>
                      <p className="text-[11px] text-cbm-gray-400 truncate">{job.error?.message ?? job.message ?? new Date(job.createdAt).toLocaleString("pt-BR")}</p>
                    </div>
                    <JobStatusBadge status={job.status} />
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

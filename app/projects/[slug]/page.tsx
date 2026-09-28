export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Metadata } from "next";
import { AssetThumb } from "@/components/atlas/asset-image";
import { SourcesPanel } from "@/components/atlas/sources-panel";
import { VisualIdentity } from "@/components/atlas/visual-identity";
import { IdentityEditor } from "@/components/creative/identity-editor";
import { Panel, SectionTitle, Stat } from "@/components/ui/primitives";
import { JOB_TYPE_LABEL, JobStatusBadge } from "@/components/ui/status";
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

const KIND_LABEL: Record<string, string> = {
  screenshot: "screenshots",
  section: "seções",
  video: "vídeos",
  image: "imagens",
  logo: "logos",
  icon: "ícones",
  background: "fundos",
  illustration: "ilustrações",
};

export default async function ProjectOverviewPage({ params }: Props) {
  const { slug } = await params;
  const runtime = await getAtlasRuntime();
  const o = await getProjectOverview(runtime.repos, slug);
  const profile = await runtime.repos.visualProfiles.latest(o.project.id);
  const url = o.sources.find((s) => s.type === "url" || s.type === "local");

  return (
    <div className="space-y-10">
      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="aspect-video border border-line overflow-hidden">
          <AssetThumb id={o.cover?.id} alt={`Capa de ${o.project.name}`} width={1280} className="w-full h-full" />
        </div>
        <div className="space-y-5">
          {o.project.description && <p className="text-sm text-zinc-300 leading-relaxed">{o.project.description}</p>}
          {url && (
            <a href={url.locator} target="_blank" rel="noreferrer" className="block text-[13px] font-mono text-accent hover:text-accent-bright truncate">
              {url.locator} ↗
            </a>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Assets" value={o.totalAssets} hint={Object.entries(o.assetCounts).map(([k, n]) => `${n} ${KIND_LABEL[k] ?? k}`).join(" · ") || "nenhum ainda"} />
            <Stat label="Peças finais" value={o.outputs} />
            <Stat label="Prontidão" value={`${o.readiness.score}%`} hint={o.readiness.missing.length ? `falta: ${o.readiness.missing.join(", ")}` : "material completo"} />
            <Stat label="Origens" value={o.sources.length} />
          </div>
          {o.project.origin === "legacy" && (
            <p className="text-[12px] text-zinc-500">
              Importado da biblioteca v1 ·{" "}
              <Link href={`/legacy/${o.project.slug}`} className="text-zinc-300 hover:text-accent">
                ver catálogo v1
              </Link>
            </p>
          )}
        </div>
      </section>

      <section aria-labelledby="recomendacoes">
        <SectionTitle
          id="recomendacoes"
          aside={
            o.totalAssets > 0 ? (
              <Link href={`/projects/${o.project.slug}/plans`} className="text-[12px] text-accent hover:text-accent-bright">
                Pedir um plano criativo ao Atlas →
              </Link>
            ) : undefined
          }
        >
          O que fazer agora
        </SectionTitle>
        <ul className="space-y-2">
          {o.recommendations.map((r) => (
            <li key={r} className="flex gap-3 text-sm text-zinc-300">
              <span className="tri text-accent mt-1.5" aria-hidden />
              {r}
            </li>
          ))}
        </ul>
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
          <SectionTitle id="atividade" aside={<Link href="/jobs" className="text-[12px] text-zinc-500 hover:text-zinc-200">Todos os jobs</Link>}>
            Atividade recente
          </SectionTitle>
          {o.recentJobs.length === 0 ? (
            <p className="text-[13px] text-zinc-500">Nenhum job ainda.</p>
          ) : (
            <Panel>
              <ul className="divide-y divide-line">
                {o.recentJobs.map((job) => (
                  <li key={job.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[13px] text-zinc-200">{JOB_TYPE_LABEL[job.type] ?? job.type}</p>
                      <p className="text-[11px] text-zinc-500 truncate">{job.error?.message ?? job.message ?? new Date(job.createdAt).toLocaleString("pt-BR")}</p>
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

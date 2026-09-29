export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { CompositionGallery } from "@/components/create/composition-gallery";
import { EmptyState } from "@/components/ui/primitives";
import { COMPOSITIONS } from "@/src/core/creative/compositions";
import type { VisualProfile } from "@/src/core/creative/visual-profile";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { suggestBindings } from "@/src/modules/create/composition-service";
import { requireProjectBySlug } from "@/src/modules/projects/project-service";
import { studioAssets } from "./studio-data";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ProjectCreatePage({ params }: Props) {
  const { slug } = await params;
  const { repos, compositionDeps } = await getAtlasRuntime();
  const project = await requireProjectBySlug(repos.projects, slug);
  const [assets, profiles, instances, documentList] = await Promise.all([
    repos.assets.listByProject(project.id),
    repos.visualProfiles.listByProject(project.id),
    repos.compositionInstances.listByProject(project.id),
    repos.documents.listByProject(project.id),
  ]);
  const documents = (
    await Promise.all(
      documentList.map(async (d) => {
        const head = await repos.documents.getRevision(d.id, d.headRevision);
        return head ? { id: d.id, name: d.name, headRevision: d.headRevision, content: head.content } : null;
      })
    )
  ).filter((d) => d !== null);
  const images = studioAssets(assets);
  if (images.length === 0) {
    return (
      <EmptyState
        title="Sem material para compor"
        action={
          <Link href={`/projects/${project.slug}/capture`} className="text-[13px] text-accent">
            Capturar o site →
          </Link>
        }
      >
        As composições usam as capturas e imagens do projeto. Faça uma captura ou envie imagens em Assets.
      </EmptyState>
    );
  }

  const suggestions = Object.fromEntries(
    await Promise.all(COMPOSITIONS.map(async (c) => [c.id, await suggestBindings(compositionDeps, project.id, c.id)] as const))
  );
  const latest = profiles.reduce<VisualProfile | null>((best, p) => (!best || p.revision > best.revision ? p : best), null);
  const profilesByRevision = Object.fromEntries(profiles.map((p) => [p.revision, p]));

  const kits = await repos.kits.listByProject(project.id);
  const cases = documentList.filter((d) => d.kind === "case").length;
  const base = `/projects/${project.slug}`;
  const starts = [
    { href: `${base}/kits`, title: "Media Kit", detail: "Um conjunto completo de peças com a mesma direção — o jeito mais rápido.", meta: kits.length ? `${kits.length} ${kits.length === 1 ? "kit" : "kits"}` : "comece por aqui" },
    { href: `${base}/cases`, title: "Case", detail: "Página editorial do projeto: web, PDF e módulos para Behance.", meta: cases ? `${cases} ${cases === 1 ? "case" : "cases"}` : "nenhum ainda" },
    { href: `${base}/plans`, title: "Plano com IA", detail: "O Atlas sugere peças a partir de um objetivo (funciona sem IA também).", meta: "opcional" },
  ];

  return (
    <div className="space-y-10">
      <section aria-labelledby="comecar">
        <h2 id="comecar" className="text-[11px] font-medium text-cbm-gray-400 uppercase tracking-[0.22em] mb-4">Começar</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {starts.map((st, i) => (
            <li key={st.title}>
              <Link href={st.href} className={`block h-full border p-4 transition-colors hover:border-cbm-gray-400 ${i === 0 ? "border-cbm-gray-400 bg-surface" : "border-line"}`}>
                <p className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-[15px] font-bold text-cbm-white">{st.title}</span>
                  <span className="text-[10px] uppercase tracking-[0.22em] text-cbm-gray-400">{st.meta}</span>
                </p>
                <p className="mt-2 text-[12px] text-cbm-gray-400 leading-relaxed">{st.detail}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <CompositionGallery
      projectId={project.id}
      slug={project.slug}
      assets={images}
      profile={latest}
      profilesByRevision={profilesByRevision}
      suggestions={suggestions}
      instances={[...instances].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))}
      documents={documents}
    />
    </div>
  );
}

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

  return (
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
  );
}

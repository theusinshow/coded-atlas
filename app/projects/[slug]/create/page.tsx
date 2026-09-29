export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { CompositionGallery, type GalleryDocument } from "@/components/create/composition-gallery";
import { EmptyState, LinkButton } from "@/components/ui/primitives";
import { relativeTime } from "@/components/ui/format";
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
  const images = studioAssets(assets);
  if (images.length === 0) {
    return (
      <EmptyState title="Sem material para compor" action={<LinkButton href={`/projects/${project.slug}/capture`}>Capturar o site</LinkButton>}>
        As peças usam as capturas e imagens do projeto.
      </EmptyState>
    );
  }

  // Cases têm a própria aba (Criar → Case); aqui ficam as peças visuais.
  const documents = (
    await Promise.all(
      documentList
        .filter((d) => d.kind !== "case")
        .map(async (d): Promise<GalleryDocument | null> => {
          const head = await repos.documents.getRevision(d.id, d.headRevision);
          return head ? { id: d.id, name: d.name, updatedAt: d.updatedAt, content: head.content } : null;
        })
    )
  ).filter((d) => d !== null);

  const suggestions = Object.fromEntries(await Promise.all(COMPOSITIONS.map(async (c) => [c.id, await suggestBindings(compositionDeps, project.id, c.id)] as const)));
  const latest = profiles.reduce<VisualProfile | null>((best, p) => (!best || p.revision > best.revision ? p : best), null);
  const profilesByRevision = Object.fromEntries(profiles.map((p) => [p.revision, p]));
  const now = new Date();
  const ago = Object.fromEntries([...instances, ...documents].map((p) => [p.id, relativeTime(p.updatedAt, now)]));

  return (
    <CompositionGallery
      projectId={project.id}
      slug={project.slug}
      assets={images}
      profile={latest}
      profilesByRevision={profilesByRevision}
      suggestions={suggestions}
      instances={instances}
      documents={documents}
      ago={ago}
    />
  );
}

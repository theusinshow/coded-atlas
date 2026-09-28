export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RenderFonts } from "@/components/create/render-fonts";
import { Studio } from "@/components/studio/studio";
import { CreativeDocumentIdSchema } from "@/src/core/documents/creative-document";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { studioMedia } from "@/app/projects/[slug]/create/studio-data";

interface Props {
  params: Promise<{ documentId: string }>;
}

export const metadata: Metadata = { title: "Studio · Coded Atlas" };

/** Studio Canvas em tela cheia: edição livre de um CanvasDocument revisionado. */
export default async function StudioPage({ params }: Props) {
  const parsed = CreativeDocumentIdSchema.safeParse((await params).documentId);
  if (!parsed.success) notFound();
  const { repos } = await getAtlasRuntime();
  const document = await repos.documents.getById(parsed.data);
  if (!document) notFound();
  const [project, head, assets, profiles] = await Promise.all([
    repos.projects.getById(document.projectId),
    repos.documents.getRevision(document.id, document.headRevision),
    repos.assets.listByProject(document.projectId),
    repos.visualProfiles.listByProject(document.projectId),
  ]);
  if (!project || !head) notFound();
  const latest = profiles.reduce<number | null>((max, p) => (max === null || p.revision > max ? p.revision : max), null);
  const media = studioMedia([...assets].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));

  return (
    <>
      <RenderFonts />
      <Studio
        documentId={document.id}
        name={document.name}
        project={{ slug: project.slug, name: project.name }}
        initialContent={head.content}
        initialRevision={head.revision}
        assets={media.visual}
        audioAssets={media.audio}
        profiles={Object.fromEntries(profiles.map((p) => [p.revision, p]))}
        latestProfileRevision={latest}
      />
    </>
  );
}

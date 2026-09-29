export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CaseEditor } from "@/components/case/case-editor";
import { RenderFonts } from "@/components/create/render-fonts";
import { CreativeDocumentIdSchema, isCase } from "@/src/core/documents/creative-document";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { studioAssets } from "@/app/projects/[slug]/create/studio-data";

interface Props {
  params: Promise<{ documentId: string }>;
}

export const metadata: Metadata = { title: "Case — Coded Atlas" };

/** Editor do case em tela cheia (seções editoriais, página ao vivo). */
export default async function CasePage({ params }: Props) {
  const parsed = CreativeDocumentIdSchema.safeParse((await params).documentId);
  if (!parsed.success) notFound();
  const { repos, brainDeps } = await getAtlasRuntime();
  const document = await repos.documents.getById(parsed.data);
  if (!document) notFound();
  if (document.kind !== "case") redirect(`/studio/${document.id}`);
  const [project, head, assets, outputs, profiles] = await Promise.all([
    repos.projects.getById(document.projectId),
    repos.documents.getRevision(document.id, document.headRevision),
    repos.assets.listByProject(document.projectId),
    repos.outputs.listByProject(document.projectId),
    repos.visualProfiles.listByProject(document.projectId),
  ]);
  if (!project || !head || !isCase(head.content)) notFound();

  return (
    <>
      <RenderFonts />
      <CaseEditor
        documentId={document.id}
        name={document.name}
        project={{ slug: project.slug, name: project.name }}
        initialContent={head.content}
        initialRevision={head.revision}
        assets={studioAssets(assets).sort((a, b) => b.createdAt.localeCompare(a.createdAt))}
        outputs={outputs
          .filter((o) => o.mimeType.startsWith("image/"))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 200)
          .map((o) => ({ id: o.id, label: `${o.label ?? o.format} · ${o.width}×${o.height}`, width: o.width, height: o.height }))}
        profiles={Object.fromEntries(profiles.map((p) => [p.revision, p]))}
        brainEnabled={brainDeps.brain.gateway !== null}
      />
    </>
  );
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { SocialPlanner } from "@/components/social/social-planner";
import type { CandidateGroup, PieceView, PostView } from "@/components/social/types";
import { outputFileUrl, outputThumbUrl } from "@/components/create/output-card";
import type { Output } from "@/src/core/assets/output";
import { SocialPostKindSchema } from "@/src/core/social/social-post";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { fitsKind, listPlanner, type PlannedPost } from "@/src/modules/social/social-service";

export const metadata: Metadata = { title: "Social — Coded Atlas" };

const piece = (o: Output): PieceView => ({
  id: o.id,
  label: o.label ?? o.format.toUpperCase(),
  isVideo: o.mimeType.startsWith("video/"),
  width: o.width,
  height: o.height,
  durationMs: o.durationMs,
  thumbUrl: outputThumbUrl(o.id, 640), // vídeos também: o thumb route gera o pôster
  fileUrl: outputFileUrl(o.id),
});

const view = (p: PlannedPost): PostView => ({
  id: p.post.id,
  kind: p.post.kind,
  status: p.post.status,
  title: p.post.title,
  caption: p.post.caption,
  hashtags: p.post.hashtags,
  plannedFor: p.post.plannedFor,
  postedAt: p.post.postedAt,
  pieces: p.pieces.map(piece),
  missing: p.missing,
  errors: p.check.errors,
  warnings: p.check.warnings,
  captionIssues: p.captionIssues,
  projects: p.projects,
  finalCaption: p.finalCaption,
});

/**
 * Social (3.2.D): o Instagram da Coded by M planejado a partir das peças do Atlas.
 * Feed (grid do perfil), stories e o editor do post selecionado.
 */
export default async function SocialPage({ searchParams }: { searchParams: Promise<{ post?: string; view?: string }> }) {
  const { post, view: tab } = await searchParams;
  const { repos } = await getAtlasRuntime();
  const planner = await listPlanner(repos);
  const kinds = SocialPostKindSchema.options;
  const candidates: CandidateGroup[] = [];
  for (const project of await repos.projects.list()) {
    const outputs = (await repos.outputs.listByProject(project.id)).filter((o) => o.mimeType.startsWith("image/") || o.mimeType.startsWith("video/"));
    const pieces = outputs
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((o) => ({ ...piece(o), fits: kinds.filter((k) => fitsKind(k, o)) }))
      .filter((p) => p.fits.length > 0);
    if (pieces.length > 0) candidates.push({ project: project.name, pieces });
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <SocialPlanner
        feed={planner.feed.map(view)}
        stories={planner.stories.map(view)}
        candidates={candidates}
        initialPostId={post ?? null}
        initialView={tab === "stories" ? "stories" : "feed"}
      />
    </main>
  );
}

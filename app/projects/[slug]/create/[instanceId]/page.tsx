export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { CompositionEditor } from "@/components/create/composition-editor";
import { OutputCard } from "@/components/create/output-card";
import { CompositionInstanceIdSchema } from "@/src/core/creative/composition";
import { getComposition } from "@/src/core/creative/compositions";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { requireProjectBySlug } from "@/src/modules/projects/project-service";
import { studioAssets } from "../studio-data";

interface Props {
  params: Promise<{ slug: string; instanceId: string }>;
}

export default async function CompositionEditorPage({ params }: Props) {
  const { slug, instanceId } = await params;
  const parsed = CompositionInstanceIdSchema.safeParse(instanceId);
  if (!parsed.success) notFound();
  const { repos } = await getAtlasRuntime();
  const project = await requireProjectBySlug(repos.projects, slug);
  const instance = await repos.compositionInstances.getById(parsed.data);
  if (!instance || instance.projectId !== project.id) notFound();
  if (!getComposition(instance.compositionId)) notFound();

  const [assets, latest, outputs] = await Promise.all([
    repos.assets.listByProject(project.id),
    repos.visualProfiles.latest(project.id),
    repos.outputs.listByProject(project.id),
  ]);
  const snapshot = (instance.visualProfileRevision ? await repos.visualProfiles.getRevision(project.id, instance.visualProfileRevision) : null) ?? latest;
  const renders = outputs.filter((o) => o.metadata.instanceId === instance.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-8">
      <Link href={`/projects/${project.slug}/create`} className="text-[12px] text-zinc-500 hover:text-zinc-200">
        ← Composições
      </Link>
      <CompositionEditor
        instance={instance}
        assets={studioAssets(assets)}
        profile={snapshot}
        latestProfile={latest}
      />
      {renders.length > 0 && (
        <section aria-labelledby="renders" className="space-y-3">
          <h2 id="renders" className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
            Renders desta peça ({renders.length})
          </h2>
          <ul className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
            {renders.slice(0, 12).map((o) => (
              <li key={o.id}>
                <OutputCard output={o} compact />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

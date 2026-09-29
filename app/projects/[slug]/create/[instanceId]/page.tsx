export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { CompositionEditor } from "@/components/create/composition-editor";
import { FreshList } from "@/components/create/fresh";
import { OutputCard } from "@/components/create/output-card";
import { Breadcrumb, SectionTitle } from "@/components/ui/primitives";
import { CompositionInstanceIdSchema } from "@/src/core/creative/composition";
import { getComposition } from "@/src/core/creative/compositions";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { requireProjectBySlug } from "@/src/modules/projects/project-service";
import { studioAssets } from "../studio-data";

interface Props {
  params: Promise<{ slug: string; instanceId: string }>;
}

/** Quantos renders da peça aparecem (os mais novos); o resto fica em Entregar. */
const RENDERS_SHOWN = 12;

export default async function CompositionEditorPage({ params }: Props) {
  const { slug, instanceId } = await params;
  const parsed = CompositionInstanceIdSchema.safeParse(instanceId);
  if (!parsed.success) notFound();
  const { repos } = await getAtlasRuntime();
  const project = await requireProjectBySlug(repos.projects, slug);
  const instance = await repos.compositionInstances.getById(parsed.data);
  if (!instance || instance.projectId !== project.id) notFound();
  if (!getComposition(instance.compositionId)) notFound();

  const [assets, latest, outputs] = await Promise.all([repos.assets.listByProject(project.id), repos.visualProfiles.latest(project.id), repos.outputs.listByProject(project.id)]);
  const snapshot = (instance.visualProfileRevision ? await repos.visualProfiles.getRevision(project.id, instance.visualProfileRevision) : null) ?? latest;
  const renders = outputs.filter((o) => o.metadata.instanceId === instance.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const base = `/projects/${project.slug}`;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: project.name, href: base }, { label: "Criar", href: `${base}/create` }, { label: instance.name }]} />
      <CompositionEditor instance={instance} assets={studioAssets(assets)} profile={snapshot} latestProfile={latest} />
      {renders.length > 0 && (
        <section aria-labelledby="renders" className="pt-4">
          <SectionTitle id="renders">Renders desta peça ({renders.length})</SectionTitle>
          <FreshList className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4" items={renders.slice(0, RENDERS_SHOWN).map((o) => ({ id: o.id, node: <OutputCard output={o} compact /> }))} />
        </section>
      )}
    </div>
  );
}

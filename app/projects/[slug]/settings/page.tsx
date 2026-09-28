export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { ProjectSettingsForms } from "@/components/atlas/project-settings";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { requireProjectBySlug } from "@/src/modules/projects/project-service";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ProjectSettingsPage({ params }: Props) {
  const { slug } = await params;
  const { repos } = await getAtlasRuntime();
  const project = await requireProjectBySlug(repos.projects, slug);
  const categories = await repos.projects.categories();
  return (
    <ProjectSettingsForms
      project={{
        id: project.id,
        slug: project.slug,
        name: project.name,
        category: project.category,
        client: project.client,
        description: project.description,
        status: project.status,
        origin: project.origin,
      }}
      categories={categories}
    />
  );
}

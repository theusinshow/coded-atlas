export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ProjectNav } from "@/components/atlas/project-nav";
import { ProjectStatusBadge } from "@/components/ui/status";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { SlugSchema } from "@/src/core/projects/project";

export default async function ProjectLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsed = SlugSchema.safeParse(slug);
  if (!parsed.success) notFound();
  const { repos } = await getAtlasRuntime();
  const project = await repos.projects.getBySlug(parsed.data);
  if (!project) notFound();

  return (
    <main className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <Link href="/projects" className="text-[12px] text-cbm-gray-400 hover:text-cbm-gray-200">
            ← Projetos
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[26px] font-bold leading-tight text-cbm-white tracking-[-0.02em] truncate">{project.name}</h1>
            <ProjectStatusBadge status={project.status} />
          </div>
          <p className="text-[13px] text-cbm-gray-400">
            <span className="font-medium text-[10px] uppercase tracking-[0.35em] text-signal/70">{project.category}</span>
            {project.client && <span> · {project.client}</span>}
          </p>
        </div>
        <Link href={`/projects/${project.slug}/settings`} className="text-[12px] text-cbm-gray-400 hover:text-cbm-gray-100 border border-line px-3 py-1.5">
          Ajustes do projeto
        </Link>
      </div>
      <ProjectNav slug={project.slug} />
      {children}
    </main>
  );
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
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
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
      <div className="min-w-0 space-y-1.5">
        <Link href="/projects" className="inline-flex items-center gap-1 h-10 sm:h-8 text-[12px] text-cbm-gray-400 hover:text-cbm-white">
          <ChevronLeft size={14} aria-hidden />
          Projetos
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[22px] sm:text-[26px] font-bold leading-tight text-cbm-white tracking-[-0.02em] break-words">{project.name}</h1>
          <ProjectStatusBadge status={project.status} />
        </div>
        <p className="text-[13px] text-cbm-gray-400">
          {project.category}
          {project.client && <span> · {project.client}</span>}
        </p>
      </div>
      <ProjectNav slug={project.slug} />
      {children}
    </main>
  );
}

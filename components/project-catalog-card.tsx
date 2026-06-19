import Link from "next/link";
import type { ProjectSummary } from "@/lib/storage/list-projects";

interface Props {
  project: ProjectSummary;
}

export function ProjectCatalogCard({ project }: Props) {
  const date = new Date(project.createdAt).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <Link
      href={`/projects/${project.slug}`}
      className="group block border border-zinc-800 hover:border-zinc-600 transition-colors cursor-pointer"
    >
      {/* Thumbnail */}
      <div className="relative overflow-hidden bg-zinc-900 aspect-video">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={project.thumbnail}
          alt={`${project.name} — thumbnail`}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          loading="lazy"
        />
      </div>

      {/* Info */}
      <div className="p-4 space-y-3">
        <div>
          <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1">
            {project.category}
          </p>
          <p className="text-sm font-medium text-zinc-100 group-hover:text-white transition-colors">
            {project.name}
          </p>
          {project.client && (
            <p className="text-xs text-zinc-500 mt-0.5">{project.client}</p>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-zinc-900 pt-3">
          <span className="text-[10px] font-mono text-zinc-600 truncate max-w-[60%]">
            {project.slug}
          </span>
          <span className="text-[10px] font-mono text-zinc-700 shrink-0">{date}</span>
        </div>
      </div>
    </Link>
  );
}

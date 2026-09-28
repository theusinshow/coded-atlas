"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Navegação do projeto (docs/UX-ARCHITECTURE.md → Project navigation). */
export const PROJECT_TABS = [
  { segment: "", label: "Visão geral" },
  { segment: "capture", label: "Captura" },
  { segment: "assets", label: "Assets" },
  { segment: "plans", label: "Planos" },
  { segment: "create", label: "Criar" },
  { segment: "publish", label: "Publicar" },
] as const;

export function ProjectNav({ slug }: { slug: string }) {
  const pathname = usePathname() ?? "";
  const base = `/projects/${slug}`;
  return (
    <nav aria-label="Seções do projeto" className="flex gap-1 border-b border-line overflow-x-auto">
      {PROJECT_TABS.map((tab) => {
        const href = tab.segment ? `${base}/${tab.segment}` : base;
        const active = tab.segment ? pathname.startsWith(href) : pathname === base;
        return (
          <Link
            key={tab.segment}
            href={href}
            aria-current={active ? "page" : undefined}
            className={[
              "relative px-3 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors",
              active ? "text-accent-bright" : "text-zinc-400 hover:text-zinc-100",
            ].join(" ")}
          >
            {tab.label}
            {active && <span className="absolute left-3 right-3 -bottom-px h-0.5 bg-accent" />}
          </Link>
        );
      })}
    </nav>
  );
}

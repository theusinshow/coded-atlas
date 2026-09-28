"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Navegação global (docs/UX-ARCHITECTURE.md): só destinos que existem de fato. */
const LINKS = [
  { href: "/projects", label: "Projetos", match: (p: string) => p === "/" || p.startsWith("/projects") },
  { href: "/library", label: "Biblioteca", match: (p: string) => p.startsWith("/library") },
  { href: "/portfolio", label: "Portfólio", match: (p: string) => p.startsWith("/portfolio") },
  { href: "/jobs", label: "Jobs", match: (p: string) => p.startsWith("/jobs") },
  { href: "/settings", label: "Ajustes", match: (p: string) => p.startsWith("/settings") },
];

const LEGACY = (p: string) => p.startsWith("/legacy") || p.startsWith("/generate") || p.startsWith("/lab");

export function AppNav() {
  const pathname = usePathname() || "/";

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-base/85 backdrop-blur-md">
      <nav className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between gap-6">
        <Link href="/projects" className="flex items-center gap-2.5 group shrink-0">
          <span className="tri text-accent" aria-hidden />
          <span className="font-mono text-sm font-bold tracking-tight text-zinc-100 group-hover:text-white transition-colors">
            CODED ATLAS
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.dispatchEvent(new Event("atlas:open-command"))}
            aria-label="Buscar (Ctrl/Cmd + K)"
            className="hidden sm:flex items-center gap-2 pl-2.5 pr-1.5 py-1.5 border border-line text-zinc-400 hover:text-zinc-100 hover:border-line-soft transition-colors"
          >
            <span aria-hidden className="text-sm leading-none">⌕</span>
            <kbd className="text-[10px] font-mono border border-line px-1 py-0.5 leading-none">⌘K</kbd>
          </button>

          <ul className="flex items-center gap-1">
            {LINKS.map((link) => {
              const active = link.match(pathname);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "relative px-3 py-1.5 text-[13px] font-medium rounded-md transition-colors",
                      active ? "text-accent-bright" : "text-zinc-400 hover:text-zinc-100 hover:bg-surface",
                    ].join(" ")}
                  >
                    {link.label}
                    {active && <span className="absolute left-3 right-3 -bottom-[11px] h-0.5 bg-accent rounded-full" />}
                  </Link>
                </li>
              );
            })}
            <li>
              <Link
                href="/legacy"
                aria-current={LEGACY(pathname) ? "page" : undefined}
                title="Catálogos e geração do Atlas v1"
                className={`px-2 py-1.5 text-[11px] font-mono uppercase tracking-wider ${LEGACY(pathname) ? "text-accent-bright" : "text-zinc-600 hover:text-zinc-300"}`}
              >
                v1
              </Link>
            </li>
          </ul>
        </div>
      </nav>
    </header>
  );
}

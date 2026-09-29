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

export function AppNav() {
  const pathname = usePathname() || "/";

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-base/85 backdrop-blur-md">
      <nav className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between gap-6">
        <Link href="/projects" className="flex items-center gap-2.5 group shrink-0">
          <span className="tri text-signal" aria-hidden />
          <span className="font-display text-[13px] font-bold tracking-[0.04em] text-cbm-white">
            CODED ATLAS
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.dispatchEvent(new Event("atlas:open-command"))}
            aria-label="Buscar (Ctrl/Cmd + K)"
            className="hidden sm:flex items-center gap-2 pl-2.5 pr-1.5 py-1.5 border border-line text-cbm-gray-400 hover:text-cbm-gray-100 hover:border-line-soft transition-colors"
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
                      "relative px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] transition-colors",
                      active ? "text-cbm-white" : "text-cbm-gray-400 hover:text-cbm-white",
                    ].join(" ")}
                  >
                    {link.label}
                    {active && <span className="absolute left-3 right-3 -bottom-[11px] h-0.5 bg-signal" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
    </header>
  );
}

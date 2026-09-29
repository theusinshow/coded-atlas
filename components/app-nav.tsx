"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Navegação global (docs/UX-ARCHITECTURE.md): só os dois lugares onde o trabalho
 * acontece — Projetos e Portfólio. Busca (⌘K), atividade e ajustes ficam à direita,
 * como utilitários; a Biblioteca de assets é aberta a partir de Projetos ou do ⌘K.
 */
const LINKS = [
  { href: "/projects", label: "Projetos", match: (p: string) => p === "/" || p.startsWith("/projects") || p.startsWith("/library") },
  { href: "/portfolio", label: "Portfólio", match: (p: string) => p.startsWith("/portfolio") },
];

/** Jobs na fila/rodando (render, captura…): consulta leve a cada poucos segundos. */
function useActiveJobs(): number {
  const [active, setActive] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/atlas/jobs/active", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<{ active: number }>) : null))
        .then((d) => alive && d && setActive(d.active))
        .catch(() => undefined);
    void load();
    const timer = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  return active;
}

export function AppNav() {
  const pathname = usePathname() || "/";
  const active = useActiveJobs();
  const utility = (on: boolean) => `flex items-center gap-2 h-8 px-2.5 border transition-colors ${on ? "border-cbm-gray-400 text-cbm-white" : "border-line text-cbm-gray-400 hover:text-cbm-white hover:border-cbm-gray-400"}`;

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-base/85 backdrop-blur-md">
      <nav className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between gap-6">
        <div className="flex items-center gap-8 min-w-0">
          <Link href="/projects" className="flex items-center gap-2.5 shrink-0">
            <span className="tri text-signal" aria-hidden />
            <span className="font-display text-[13px] font-bold tracking-[0.04em] text-cbm-white">CODED ATLAS</span>
          </Link>
          <ul className="flex items-center gap-1">
            {LINKS.map((link) => {
              const on = link.match(pathname);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={on ? "page" : undefined}
                    className={["relative px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] transition-colors", on ? "text-cbm-white" : "text-cbm-gray-400 hover:text-cbm-white"].join(" ")}
                  >
                    {link.label}
                    {on && <span className="absolute left-3 right-3 -bottom-[11px] h-0.5 bg-signal" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => window.dispatchEvent(new Event("atlas:open-command"))} aria-label="Buscar (Ctrl/Cmd + K)" className={`hidden sm:flex ${utility(false)}`}>
            <span aria-hidden className="text-sm leading-none">⌕</span>
            <kbd className="text-[10px] font-mono border border-line px-1 py-0.5 leading-none">⌘K</kbd>
          </button>
          <Link href="/jobs" aria-label={active ? `Atividade: ${active} em andamento` : "Atividade"} title="Atividade (jobs)" className={utility(pathname.startsWith("/jobs"))} data-activity={active}>
            {active > 0 ? <span className="w-1.5 h-1.5 bg-signal animate-atlas-pulse" aria-hidden /> : <span className="w-1.5 h-1.5 border border-cbm-gray-400" aria-hidden />}
            <span className="text-[11px] uppercase tracking-[0.15em]">{active > 0 ? `${active} em andamento` : "Atividade"}</span>
          </Link>
          <Link href="/settings" aria-label="Ajustes" title="Ajustes" className={utility(pathname.startsWith("/settings"))}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
          </Link>
        </div>
      </nav>
    </header>
  );
}

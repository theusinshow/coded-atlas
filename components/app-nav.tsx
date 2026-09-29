"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Search, Settings } from "lucide-react";
import { DURATION, EASE_OUT } from "@/components/ui/motion";

/**
 * Navegação global (docs/UX-ARCHITECTURE.md): só os lugares onde o trabalho
 * acontece — Projetos, Social (Instagram) e Portfólio. Busca (⌘K), atividade e
 * ajustes ficam à direita, como utilitários; a Biblioteca de assets é aberta a
 * partir de Projetos ou do ⌘K. No celular, os links descem para uma segunda linha.
 */
const LINKS = [
  { href: "/projects", label: "Projetos", match: (p: string) => p === "/" || p.startsWith("/projects") || p.startsWith("/library") },
  { href: "/social", label: "Social", match: (p: string) => p.startsWith("/social") },
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
  const utility = (on: boolean) =>
    `flex items-center justify-center gap-2 h-10 sm:h-8 min-w-10 sm:min-w-8 px-2.5 border transition-colors ${on ? "border-cbm-gray-400 text-cbm-white" : "border-line text-cbm-gray-400 hover:text-cbm-white hover:border-cbm-gray-400"}`;

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-base/85 backdrop-blur-md">
      <nav aria-label="Principal" className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-x-6">
        <Link href="/projects" className="flex items-center gap-2.5 h-14 shrink-0">
          <span className="tri text-signal" aria-hidden />
          <span className="font-display text-[13px] font-bold tracking-[0.04em] text-cbm-white">CODED ATLAS</span>
        </Link>

        <ul className="order-last sm:order-none w-full sm:w-auto sm:flex-1 flex items-center gap-1 overflow-x-auto">
          {LINKS.map((link) => {
            const on = link.match(pathname);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={on ? "page" : undefined}
                  className={["relative flex items-center h-11 sm:h-14 px-3 text-[11px] uppercase tracking-[0.15em] whitespace-nowrap transition-colors", on ? "text-cbm-white" : "text-cbm-gray-400 hover:text-cbm-white"].join(" ")}
                >
                  {link.label}
                  {on && <motion.span layoutId="global-nav" className="absolute left-3 right-3 bottom-0 h-0.5 bg-signal" transition={{ duration: DURATION.quick, ease: EASE_OUT }} />}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-2 h-14">
          <button onClick={() => window.dispatchEvent(new Event("atlas:open-command"))} aria-label="Buscar (Ctrl/Cmd + K)" className={`hidden sm:flex ${utility(false)}`}>
            <Search size={14} aria-hidden />
            <kbd className="text-[10px] font-mono border border-line px-1 py-0.5 leading-none">⌘K</kbd>
          </button>
          <Link href="/jobs" aria-label={active ? `Atividade: ${active} em andamento` : "Atividade"} title="Atividade" className={utility(pathname.startsWith("/jobs"))} data-activity={active}>
            {active > 0 ? <span className="w-1.5 h-1.5 bg-signal animate-atlas-pulse" aria-hidden /> : <span className="w-1.5 h-1.5 border border-cbm-gray-400" aria-hidden />}
            <span className="hidden sm:inline text-[11px] uppercase tracking-[0.15em]">{active > 0 ? `${active} em andamento` : "Atividade"}</span>
            {active > 0 && <span className="sm:hidden text-[11px] tabular-nums">{active}</span>}
          </Link>
          <Link href="/settings" aria-label="Ajustes" title="Ajustes" className={utility(pathname.startsWith("/settings"))}>
            <Settings size={14} aria-hidden />
          </Link>
        </div>
      </nav>
    </header>
  );
}

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { Settings } from "lucide-react";
import { DURATION, EASE_OUT } from "@/components/ui/motion";

/**
 * Navegação do projeto em 3 passos (docs/UX-ARCHITECTURE.md → Project navigation):
 * Visão geral · 1 Material · 2 Criar · 3 Entregar, com Ajustes no fim. Cada passo
 * agrupa telas que já existiam (mesmas URLs); a sub-navegação só marca a tela raiz
 * — em páginas de detalhe (uma peça, um kit) nenhuma aba fica acesa por engano.
 */
interface Sub {
  segment: string;
  label: string;
}
interface Step {
  segment: string;
  label: string;
  number?: number;
  subs: Sub[];
}

export const PROJECT_STEPS: Step[] = [
  { segment: "", label: "Visão geral", subs: [] },
  {
    segment: "assets",
    label: "Material",
    number: 1,
    subs: [
      { segment: "assets", label: "Assets" },
      { segment: "capture", label: "Capturar" },
    ],
  },
  {
    segment: "create",
    label: "Criar",
    number: 2,
    subs: [
      { segment: "create", label: "Peças" },
      { segment: "kits", label: "Media Kits" },
      { segment: "cases", label: "Case" },
      { segment: "plans", label: "Plano com IA" },
    ],
  },
  { segment: "publish", label: "Entregar", number: 3, subs: [{ segment: "publish", label: "Entregar" }] },
];

function segmentsOf(pathname: string, base: string): string[] {
  return (pathname.startsWith(base) ? pathname.slice(base.length) : "").split("/").filter(Boolean);
}

export function ProjectNav({ slug }: { slug: string }) {
  const pathname = usePathname() ?? "";
  const base = `/projects/${slug}`;
  const parts = segmentsOf(pathname, base);
  const segment = parts[0] ?? "";
  const isRoot = parts.length <= 1;
  const activeStep = PROJECT_STEPS.find((s) => (s.segment === "" ? segment === "" : s.subs.some((sub) => sub.segment === segment)));
  const activeRef = useRef<HTMLAnchorElement>(null);

  // No celular a faixa rola: a aba atual entra na tela.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [segment]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <nav aria-label="Passos do projeto" className="flex items-stretch gap-1 border-b border-line overflow-x-auto pr-10 sm:pr-0">
          {PROJECT_STEPS.map((step) => {
            const active = step === activeStep;
            return (
              <Link
                key={step.label}
                ref={active ? activeRef : undefined}
                href={step.segment ? `${base}/${step.segment}` : base}
                aria-current={active && isRoot ? "page" : undefined}
                className={["relative flex items-center gap-2 px-3 h-11 text-[11px] uppercase tracking-[0.15em] whitespace-nowrap transition-colors", active ? "text-cbm-white" : "text-cbm-gray-400 hover:text-cbm-white"].join(" ")}
              >
                {step.number && (
                  <span className={`font-display text-[10px] font-semibold ${active ? "text-signal" : "text-cbm-gray-400"}`} aria-hidden>
                    {step.number}
                  </span>
                )}
                {step.label}
                {active && <motion.span layoutId={`project-step-${slug}`} className="absolute left-3 right-3 -bottom-px h-0.5 bg-cbm-white" transition={{ duration: DURATION.quick, ease: EASE_OUT }} />}
              </Link>
            );
          })}
          <Link
            href={`${base}/settings`}
            aria-label="Ajustes do projeto"
            title="Ajustes do projeto"
            aria-current={segment === "settings" ? "page" : undefined}
            className={`relative ml-auto flex items-center gap-2 px-3 h-11 text-[11px] uppercase tracking-[0.15em] whitespace-nowrap transition-colors ${segment === "settings" ? "text-cbm-white" : "text-cbm-gray-400 hover:text-cbm-white"}`}
          >
            <Settings size={14} aria-hidden />
            <span className="hidden sm:inline">Ajustes</span>
            {segment === "settings" && <motion.span layoutId={`project-step-${slug}`} className="absolute left-3 right-3 -bottom-px h-0.5 bg-cbm-white" transition={{ duration: DURATION.quick, ease: EASE_OUT }} />}
          </Link>
        </nav>
        <span aria-hidden className="pointer-events-none absolute right-0 top-0 bottom-px w-10 bg-gradient-to-l from-base to-transparent sm:hidden" />
      </div>
      {activeStep && activeStep.subs.length > 1 && (
        <nav aria-label={`Seções de ${activeStep.label}`} className="flex gap-1 overflow-x-auto" data-subnav={activeStep.label}>
          {activeStep.subs.map((sub) => {
            const current = sub.segment === segment;
            const exact = current && isRoot;
            return (
              <Link
                key={sub.segment}
                href={`${base}/${sub.segment}`}
                aria-current={exact ? "page" : undefined}
                className={`flex items-center h-10 sm:h-9 border px-3 text-[12px] whitespace-nowrap transition-colors ${exact ? "border-cbm-gray-400 text-cbm-white bg-surface" : current ? "border-line text-cbm-gray-200" : "border-transparent text-cbm-gray-400 hover:text-cbm-white"}`}
              >
                {sub.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

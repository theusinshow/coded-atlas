"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ChevronRight, Settings } from "lucide-react";
import { DURATION, EASE_OUT } from "@/components/ui/motion";

/**
 * Navegação do projeto (docs/UX-ARCHITECTURE.md → Project navigation, ADR-050):
 * Início (objetivos + arquivos; o caminho guiado /fazer também conta como Início)
 * e "Avançado", que abre Material · Criar · Entregar — as telas completas, nas
 * mesmas URLs. Em telas avançadas o grupo já vem aberto, para mostrar onde se está.
 * A sub-navegação só marca a tela raiz (em detalhes nenhuma aba acende por engano).
 */
interface Sub {
  segment: string;
  label: string;
}
interface Step {
  segment: string;
  label: string;
  subs: Sub[];
}

const HOME_SEGMENTS = new Set(["", "fazer"]);

export const PROJECT_STEPS: Step[] = [
  {
    segment: "assets",
    label: "Material",
    subs: [
      { segment: "assets", label: "Imagens e vídeos" },
      { segment: "capture", label: "Capturar" },
    ],
  },
  {
    segment: "create",
    label: "Criar",
    subs: [
      { segment: "create", label: "Visuais" },
      { segment: "kits", label: "Conjuntos de peças" },
      { segment: "cases", label: "Case" },
      { segment: "plans", label: "Plano com IA" },
    ],
  },
  { segment: "publish", label: "Entregar", subs: [{ segment: "publish", label: "Entregar" }] },
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
  const isHome = HOME_SEGMENTS.has(segment);
  const activeStep = PROJECT_STEPS.find((s) => s.subs.some((sub) => sub.segment === segment));
  const [open, setOpen] = useState(!!activeStep);
  const showAdvanced = open || !!activeStep;
  const activeRef = useRef<HTMLAnchorElement>(null);

  // No celular a faixa rola: a aba atual entra na tela.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [segment]);

  const tab = (active: boolean) => ["relative flex items-center gap-2 px-3 h-11 text-[11px] uppercase tracking-[0.15em] whitespace-nowrap transition-colors", active ? "text-cbm-white" : "text-cbm-gray-400 hover:text-cbm-white"].join(" ");
  const underline = <motion.span layoutId={`project-step-${slug}`} className="absolute left-3 right-3 -bottom-px h-0.5 bg-cbm-white" transition={{ duration: DURATION.quick, ease: EASE_OUT }} />;

  return (
    <div className="space-y-3">
      <div className="relative">
        <nav aria-label="Navegação do projeto" className="flex items-stretch gap-1 border-b border-line overflow-x-auto pr-10 sm:pr-0">
          <Link href={base} ref={isHome ? activeRef : undefined} aria-current={segment === "" ? "page" : undefined} className={tab(isHome)}>
            Início
            {isHome && underline}
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={showAdvanced}
            aria-controls={`avancado-${slug}`}
            disabled={!!activeStep}
            className="flex items-center gap-1 px-3 h-11 text-[11px] uppercase tracking-[0.15em] whitespace-nowrap text-cbm-gray-400 transition-colors hover:text-cbm-white disabled:cursor-default disabled:hover:text-cbm-gray-400"
          >
            Avançado
            <ChevronRight size={12} className={`transition-transform duration-200 ${showAdvanced ? "rotate-90" : ""}`} aria-hidden />
          </button>
          {showAdvanced && (
            <div id={`avancado-${slug}`} className="flex items-stretch gap-1 border-l border-line pl-1 my-2" role="group" aria-label="Telas avançadas">
              {PROJECT_STEPS.map((step) => {
                const active = step === activeStep;
                return (
                  <Link key={step.label} ref={active ? activeRef : undefined} href={`${base}/${step.segment}`} aria-current={active && isRoot ? "page" : undefined} className={`${tab(active)} -my-2`}>
                    {step.label}
                    {active && underline}
                  </Link>
                );
              })}
            </div>
          )}
          <Link
            href={`${base}/settings`}
            aria-label="Ajustes do projeto"
            title="Ajustes do projeto"
            aria-current={segment === "settings" ? "page" : undefined}
            className={`ml-auto ${tab(segment === "settings")}`}
          >
            <Settings size={14} aria-hidden />
            <span className="hidden sm:inline">Ajustes</span>
            {segment === "settings" && underline}
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

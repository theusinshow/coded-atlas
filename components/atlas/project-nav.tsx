"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Navegação do projeto em 3 passos (docs/UX-ARCHITECTURE.md → Project navigation):
 * Visão geral · 1 Material · 2 Criar · 3 Entregar. Cada passo agrupa as telas que
 * já existiam (mesmas URLs); dentro de um passo, uma sub-navegação discreta.
 */
interface Sub {
  segment: string;
  label: string;
}
interface Step {
  segment: string;
  label: string;
  number?: number;
  /** Segmentos que pertencem a este passo (o primeiro é o destino do link). */
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
      { segment: "create", label: "Início" },
      { segment: "kits", label: "Media Kits" },
      { segment: "cases", label: "Case" },
      { segment: "plans", label: "Plano com IA" },
    ],
  },
  { segment: "publish", label: "Entregar", number: 3, subs: [{ segment: "publish", label: "Entregar" }] },
];

function currentSegment(pathname: string, base: string): string {
  const rest = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\//, "") : "";
  return rest.split("/")[0] ?? "";
}

export function ProjectNav({ slug }: { slug: string }) {
  const pathname = usePathname() ?? "";
  const base = `/projects/${slug}`;
  const segment = currentSegment(pathname, base);
  const activeStep = PROJECT_STEPS.find((s) => (s.segment === "" ? segment === "" : s.subs.some((sub) => sub.segment === segment)));

  return (
    <div className="space-y-3">
      <nav aria-label="Passos do projeto" className="flex gap-1 border-b border-line overflow-x-auto">
        {PROJECT_STEPS.map((step) => {
          const active = step === activeStep;
          return (
            <Link
              key={step.label}
              href={step.segment ? `${base}/${step.segment}` : base}
              aria-current={active ? "page" : undefined}
              className={[
                "relative flex items-center gap-2 px-3 py-3 text-[11px] uppercase tracking-[0.15em] whitespace-nowrap transition-colors",
                active ? "text-cbm-white" : "text-cbm-gray-400 hover:text-cbm-white",
              ].join(" ")}
            >
              {step.number && (
                <span className={`font-display text-[10px] font-semibold ${active ? "text-signal" : "text-cbm-gray-600"}`} aria-hidden>
                  {step.number}
                </span>
              )}
              {step.label}
              {active && <span className="absolute left-3 right-3 -bottom-px h-0.5 bg-cbm-white" />}
            </Link>
          );
        })}
      </nav>
      {activeStep && activeStep.subs.length > 1 && (
        <nav aria-label={`Seções de ${activeStep.label}`} className="flex flex-wrap gap-1" data-subnav={activeStep.label}>
          {activeStep.subs.map((sub) => {
            const active = sub.segment === segment;
            return (
              <Link
                key={sub.segment}
                href={`${base}/${sub.segment}`}
                aria-current={active ? "page" : undefined}
                className={`border px-3 py-1.5 text-[12px] transition-colors ${active ? "border-cbm-gray-400 text-cbm-white bg-surface" : "border-transparent text-cbm-gray-400 hover:text-cbm-white"}`}
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { PlanRequestForm } from "@/components/brain/plan-request-form";
import { DirectionList, NewDirectionForm } from "@/components/creative/directions";
import { MemoryPanel } from "@/components/creative/memory-panel";
import { Collapsible, EmptyState, Panel, SectionTitle } from "@/components/ui/primitives";
import { plural, relativeTime } from "@/components/ui/format";
import { CREATIVE_GOALS } from "@/src/core/brain/plan";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { brainStatus } from "@/src/modules/brain/plan-service";
import { requireProjectBySlug } from "@/src/modules/projects/project-service";

interface Props {
  params: Promise<{ slug: string }>;
}

const STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: "Rascunho", className: "text-cbm-gray-200" },
  applied: { label: "Aplicado", className: "text-ok" },
  discarded: { label: "Descartado", className: "text-cbm-gray-400" },
};

/** Plano com IA: os planos primeiro, o pedido ao lado; memória e direções recolhidas no fim. */
export default async function ProjectPlansPage({ params }: Props) {
  const { slug } = await params;
  const { repos, brainDeps } = await getAtlasRuntime();
  const project = await requireProjectBySlug(repos.projects, slug);
  const [plans, status, memories, directions] = await Promise.all([
    repos.plans.listByProject(project.id),
    brainStatus(brainDeps),
    repos.memory.listFor(project.id),
    repos.directions.listByProject(project.id),
  ]);
  const projectMemories = memories.filter((m) => m.projectId === project.id).length;
  const now = new Date();

  return (
    <div className="space-y-12">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] items-start">
        <section aria-labelledby="planos" className="min-w-0">
          <SectionTitle id="planos">Planos ({plans.length})</SectionTitle>
          {plans.length === 0 ? (
            <EmptyState title="Nenhum plano ainda">Escolha um objetivo em Novo plano. Sem IA ligada, o Atlas monta o plano com as próprias regras.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {plans.map((plan) => (
                <li key={plan.id}>
                  <Link href={`/projects/${project.slug}/plans/${plan.id}`} className="block group">
                    <Panel className="px-4 py-3.5 space-y-1 group-hover:border-cbm-gray-400 transition-colors">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <p className="text-[14px] text-cbm-white">
                          {CREATIVE_GOALS[plan.request.goal].label} · {plural(plan.items.length, "peça", "peças")}
                          {plan.parentId && <span className="text-cbm-gray-400"> · revisão</span>}
                        </p>
                        <span className={`text-[12px] ${STATUS[plan.status].className}`}>{STATUS[plan.status].label}</span>
                      </div>
                      <p className="text-[13px] text-cbm-gray-400 line-clamp-2">{plan.summary}</p>
                      <p className="text-[12px] text-cbm-gray-400">
                        {relativeTime(plan.createdAt, now)} · {plan.source === "brain" ? "Atlas Brain" : "Regras do Atlas"}
                      </p>
                    </Panel>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside aria-labelledby="pedir" className="lg:sticky lg:top-6">
          <Panel className="p-4">
            <h2 id="pedir" className="text-[14px] font-medium text-cbm-white">
              Novo plano
            </h2>
            <p className="text-[12px] text-cbm-gray-400 mt-1 mb-4">O Atlas escolhe composições, material e textos; você decide o que vira peça.</p>
            {status.budgetState !== "ok" && <p className="text-[12px] text-warn mb-4">Orçamento de IA do mês {status.budgetState === "exceeded" ? "atingido" : "quase no limite"}.</p>}
            <PlanRequestForm projectId={project.id} slug={project.slug} brain={{ enabled: status.enabled, model: status.model }} directions={directions.map((d) => ({ id: d.id, name: d.name }))} />
          </Panel>
        </aside>
      </div>

      <Collapsible title={`Memória e direções (${projectMemories + directions.length})`}>
        <div className="grid gap-8 lg:grid-cols-2">
          <section aria-labelledby="memoria" className="space-y-3 min-w-0">
            <div>
              <h3 id="memoria" className="text-[13px] text-cbm-white">
                Memória do projeto
              </h3>
              <p className="text-[12px] text-cbm-gray-400 mt-0.5">Vale só aqui e tem prioridade sobre a memória geral (Ajustes).</p>
            </div>
            <MemoryPanel memories={memories} projectId={project.id} />
          </section>
          <section aria-labelledby="direcoes" className="space-y-3 min-w-0">
            <div>
              <h3 id="direcoes" className="text-[13px] text-cbm-white">
                Direções criativas
              </h3>
              <p className="text-[12px] text-cbm-gray-400 mt-0.5">Tom, ênfase e estilo reutilizáveis em planos, kits e cases.</p>
            </div>
            <DirectionList directions={directions} />
            <NewDirectionForm projectId={project.id} />
          </section>
        </div>
      </Collapsible>
    </div>
  );
}

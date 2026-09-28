export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { PlanRequestForm } from "@/components/brain/plan-request-form";
import { DirectionList, NewDirectionForm } from "@/components/creative/directions";
import { MemoryPanel } from "@/components/creative/memory-panel";
import { EmptyState, Panel, SectionTitle } from "@/components/ui/primitives";
import { CREATIVE_GOALS } from "@/src/core/brain/plan";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { brainStatus } from "@/src/modules/brain/plan-service";
import { requireProjectBySlug } from "@/src/modules/projects/project-service";

interface Props {
  params: Promise<{ slug: string }>;
}

const STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: "rascunho", className: "text-zinc-300" },
  applied: { label: "aplicado", className: "text-ok" },
  discarded: { label: "descartado", className: "text-zinc-600" },
};

/** Direção criativa: pedir um plano ao Atlas (IA ou regras) e ver os anteriores. */
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

  return (
    <div className="grid gap-10 lg:grid-cols-[26rem_1fr]">
      <section aria-labelledby="pedir">
        <SectionTitle id="pedir">Pedir um plano</SectionTitle>
        <p className="text-[13px] text-zinc-400 mb-4">
          O Atlas escolhe as composições, o material e os textos para o objetivo — você revisa e decide o que vira peça.
          {status.budgetState !== "ok" && <span className="block mt-2 text-warn">Orçamento de IA do mês {status.budgetState === "exceeded" ? "atingido" : "quase no limite"}.</span>}
        </p>
        <PlanRequestForm projectId={project.id} slug={project.slug} brain={{ enabled: status.enabled, model: status.model }} directions={directions.map((d) => ({ id: d.id, name: d.name }))} />

        <div className="mt-10 space-y-3">
          <SectionTitle id="direcoes">Direções criativas</SectionTitle>
          <DirectionList directions={directions} />
          <NewDirectionForm projectId={project.id} />
        </div>

        <div className="mt-10 space-y-3">
          <SectionTitle id="memoria">Memória do projeto</SectionTitle>
          <p className="text-[12px] text-zinc-500">Vale só para este projeto e vence a memória da Coded by M (Ajustes).</p>
          <MemoryPanel memories={memories} projectId={project.id} />
        </div>
      </section>

      <section aria-labelledby="planos">
        <SectionTitle id="planos">Planos ({plans.length})</SectionTitle>
        {plans.length === 0 ? (
          <EmptyState title="Nenhum plano ainda">Escolha um objetivo ao lado. Sem IA configurada, o Atlas monta o plano com as próprias regras.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {plans.map((plan) => (
              <li key={plan.id}>
                <Link href={`/projects/${project.slug}/plans/${plan.id}`} className="block group">
                  <Panel className="p-4 space-y-1.5 group-hover:border-zinc-500 transition-colors">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-[13px] text-zinc-100">
                        {CREATIVE_GOALS[plan.request.goal].label} · {plan.items.length} peça(s)
                        {plan.parentId && <span className="text-zinc-500"> · revisão</span>}
                      </p>
                      <span className={`text-[10px] font-mono uppercase tracking-wider ${STATUS[plan.status].className}`}>{STATUS[plan.status].label}</span>
                    </div>
                    <p className="text-[12px] text-zinc-400 line-clamp-2">{plan.summary}</p>
                    <p className="text-[11px] font-mono text-zinc-600">
                      {new Date(plan.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {plan.source === "brain" ? `Atlas Brain (${plan.model})` : "regras do Atlas"}
                    </p>
                  </Panel>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

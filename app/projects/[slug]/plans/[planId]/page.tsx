export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { applyPlanAction, discardPlanAction } from "@/app/actions/brain";
import { AssetThumb } from "@/components/atlas/asset-image";
import { PlanItems } from "@/components/brain/plan-items";
import { PlanReviseForm } from "@/components/brain/plan-request-form";
import { SaveDirectionForm } from "@/components/creative/directions";
import { STYLE_MODES } from "@/components/create/types";
import { Button, Panel, SectionTitle } from "@/components/ui/primitives";
import { CREATIVE_GOALS, CreativePlanIdSchema } from "@/src/core/brain/plan";
import { FORMATS } from "@/src/core/creative/formats";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { requireProjectBySlug } from "@/src/modules/projects/project-service";
import { studioAssets } from "../../create/studio-data";

interface Props {
  params: Promise<{ slug: string; planId: string }>;
}

export default async function PlanPage({ params }: Props) {
  const { slug, planId } = await params;
  const parsed = CreativePlanIdSchema.safeParse(planId);
  if (!parsed.success) notFound();
  const { repos } = await getAtlasRuntime();
  const project = await requireProjectBySlug(repos.projects, slug);
  const plan = await repos.plans.getById(parsed.data);
  if (!plan || plan.projectId !== project.id) notFound();
  const [assets, profile] = await Promise.all([
    repos.assets.listByProject(project.id),
    plan.visualProfileRevision ? repos.visualProfiles.getRevision(project.id, plan.visualProfileRevision) : repos.visualProfiles.latest(project.id),
  ]);
  const byId = new Map(assets.map((a) => [a.id as string, a]));
  const goal = CREATIVE_GOALS[plan.request.goal];
  const canApply = plan.status !== "discarded";

  return (
    <div className="space-y-10">
      <Link href={`/projects/${project.slug}/plans`} className="text-[12px] text-zinc-500 hover:text-zinc-200">
        ← Planos
      </Link>

      <section className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-3">
          <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-accent">
            {goal.label} · {plan.source === "brain" ? `Atlas Brain · ${plan.model}` : "Regras do Atlas"}
            {plan.parentId && " · revisão"}
          </p>
          <h2 className="text-xl text-zinc-50 leading-snug">{plan.summary}</h2>
          <dl className="grid sm:grid-cols-3 gap-3 text-[12px]">
            <div>
              <dt className="text-zinc-500 font-mono text-[10px] uppercase tracking-wider">Tom</dt>
              <dd className="text-zinc-200">{plan.direction.tone}</dd>
            </div>
            <div>
              <dt className="text-zinc-500 font-mono text-[10px] uppercase tracking-wider">Ênfase</dt>
              <dd className="text-zinc-200">{plan.direction.emphasis}</dd>
            </div>
            <div>
              <dt className="text-zinc-500 font-mono text-[10px] uppercase tracking-wider">Estilo</dt>
              <dd className="text-zinc-200 flex items-center gap-2">
                {STYLE_MODES.find((m) => m.id === plan.direction.styleMode)?.label}
                {plan.direction.accent && <span className="inline-block w-3 h-3 border border-line" style={{ background: plan.direction.accent }} title={plan.direction.accent} />}
              </dd>
            </div>
          </dl>
          {(plan.request.notes || plan.request.feedback) && (
            <p className="text-[12px] text-zinc-500">
              {plan.request.notes && <>Observações: {plan.request.notes}. </>}
              {plan.request.feedback && <>Revisão pedida: {plan.request.feedback}</>}
            </p>
          )}
          {plan.request.formats.length > 0 && <p className="text-[11px] font-mono text-zinc-600">Formatos: {plan.request.formats.map((f) => FORMATS[f].label).join(", ")}</p>}
        </div>
        <Panel className="p-4 space-y-3 self-start">
          {plan.status === "applied" && <p className="text-[12px] text-ok">{plan.appliedInstanceIds.length} peça(s) criadas em Criar.</p>}
          {plan.status === "discarded" && <p className="text-[12px] text-zinc-500">Plano descartado.</p>}
          {canApply && (
            <form action={applyPlanAction}>
              <input type="hidden" name="planId" value={plan.id} />
              <Button variant="primary" type="submit" className="w-full">
                Criar todas as peças
              </Button>
            </form>
          )}
          <p className="text-[11px] text-zinc-500">As peças viram rascunhos editáveis em Criar. Nada é renderizado ou publicado sozinho.</p>
          <div className="border-t border-line pt-3">
            <SaveDirectionForm planId={plan.id} />
          </div>
          {plan.status === "draft" && (
            <form action={discardPlanAction}>
              <input type="hidden" name="planId" value={plan.id} />
              <Button variant="ghost" size="sm" type="submit">
                Descartar plano
              </Button>
            </form>
          )}
        </Panel>
      </section>

      {plan.warnings.length > 0 && (
        <ul className="border border-warn/40 bg-warn/5 px-3 py-2 space-y-1" aria-label="Avisos do plano">
          {plan.warnings.map((w, i) => (
            <li key={i} className="text-[12px] text-zinc-300">
              <span className="text-warn">⚠</span> {w}
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="pecas">
        <SectionTitle id="pecas">Peças propostas</SectionTitle>
        <PlanItems plan={plan} assets={studioAssets(assets)} profile={profile} canApply={canApply} />
      </section>

      {plan.assetRanking.length > 0 && (
        <section aria-labelledby="melhores">
          <SectionTitle id="melhores">Material mais forte</SectionTitle>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {plan.assetRanking.map((r) => {
              const asset = byId.get(r.assetId);
              return (
                <li key={r.assetId} className="flex gap-3 border border-line p-2">
                  <Link href={`/projects/${project.slug}/assets/${r.assetId}`} className="shrink-0">
                    <AssetThumb id={asset?.id} alt={asset?.label ?? "asset"} width={320} className="w-24 aspect-[16/10] border border-line" />
                  </Link>
                  <div className="min-w-0">
                    <p className="text-[11px] font-mono text-accent tabular-nums">{Math.round(r.score * 100)}</p>
                    <p className="text-[12px] text-zinc-300 leading-snug">{r.reason}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {plan.status !== "discarded" && (
        <section aria-labelledby="revisar" className="max-w-xl">
          <SectionTitle id="revisar">Não ficou bom?</SectionTitle>
          <PlanReviseForm planId={plan.id} slug={project.slug} />
        </section>
      )}
    </div>
  );
}

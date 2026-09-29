export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { applyPlanAction, discardPlanAction } from "@/app/actions/brain";
import { planToCarouselAction } from "@/app/actions/studio";
import { AssetThumb } from "@/components/atlas/asset-image";
import { PlanItems } from "@/components/brain/plan-items";
import { PlanReviseForm } from "@/components/brain/plan-request-form";
import { SaveDirectionForm } from "@/components/creative/directions";
import { STYLE_MODES } from "@/components/create/types";
import { SubmitButton } from "@/components/create/submit-button";
import { Breadcrumb, buttonClass, Panel, SectionTitle } from "@/components/ui/primitives";
import { assetTitle, plural } from "@/components/ui/format";
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
  const carouselFirst = plan.request.goal === "carousel" && plan.items.length > 1;
  const base = `/projects/${project.slug}`;

  return (
    <div className="space-y-10">
      <Breadcrumb items={[{ label: project.name, href: base }, { label: "Plano com IA", href: `${base}/plans` }, { label: goal.label }]} />

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] items-start">
        <div className="space-y-4 min-w-0">
          <div className="space-y-1.5">
            <h2 className="text-[20px] font-semibold text-cbm-white leading-snug">{plan.summary}</h2>
            <p className="text-[12px] text-cbm-gray-400">
              {plan.source === "brain" ? "Atlas Brain" : "Regras do Atlas"}
              {plan.parentId && " · revisão de um plano anterior"}
            </p>
          </div>
          <dl className="grid sm:grid-cols-3 gap-4 text-[13px]">
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-[0.22em] text-cbm-gray-400">Tom</dt>
              <dd className="text-cbm-gray-200 mt-0.5">{plan.direction.tone}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-[0.22em] text-cbm-gray-400">Ênfase</dt>
              <dd className="text-cbm-gray-200 mt-0.5">{plan.direction.emphasis}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-[0.22em] text-cbm-gray-400">Estilo</dt>
              <dd className="text-cbm-gray-200 mt-0.5 flex items-center gap-2">
                {STYLE_MODES.find((m) => m.id === plan.direction.styleMode)?.label}
                {plan.direction.accent && <span className="inline-block w-3 h-3 border border-line" style={{ background: plan.direction.accent }} title={plan.direction.accent} />}
              </dd>
            </div>
          </dl>
          {(plan.request.notes || plan.request.feedback) && (
            <p className="text-[13px] text-cbm-gray-400">
              {plan.request.notes && <>Observações: {plan.request.notes}. </>}
              {plan.request.feedback && <>Revisão pedida: {plan.request.feedback}</>}
            </p>
          )}
          {plan.request.formats.length > 0 && <p className="text-[12px] text-cbm-gray-400">Formatos: {plan.request.formats.map((f) => FORMATS[f].label).join(", ")}</p>}
        </div>
        <Panel className="p-4 space-y-3">
          {plan.status === "applied" && (
            <p className="text-[13px] text-ok">{plan.appliedInstanceIds.length === 1 ? "1 peça criada" : `${plural(plan.appliedInstanceIds.length, "peça", "peças")} criadas`} em Criar.</p>
          )}
          {plan.status === "discarded" && <p className="text-[13px] text-cbm-gray-400">Plano descartado.</p>}
          {/* Um primário só: no objetivo "carrossel", montar o carrossel é a ação principal (e vem primeiro). */}
          {canApply && (
            <div className={`flex gap-2 ${carouselFirst ? "flex-col-reverse" : "flex-col"}`}>
              <form action={applyPlanAction}>
                <input type="hidden" name="planId" value={plan.id} />
                <SubmitButton className={`${buttonClass(carouselFirst ? "secondary" : "primary", "md")} w-full`}>Criar todas as peças</SubmitButton>
              </form>
              {plan.items.length > 1 && (
                <form action={planToCarouselAction}>
                  <input type="hidden" name="planId" value={plan.id} />
                  <SubmitButton className={`${buttonClass(carouselFirst ? "primary" : "secondary", "md")} w-full`}>Montar como carrossel</SubmitButton>
                </form>
              )}
            </div>
          )}
          <p className="text-[12px] text-cbm-gray-400">Viram rascunhos editáveis. Nada é renderizado ou publicado sem você.</p>
          <div className="border-t border-line pt-3">
            <SaveDirectionForm planId={plan.id} />
          </div>
          {plan.status === "draft" && (
            <form action={discardPlanAction}>
              <input type="hidden" name="planId" value={plan.id} />
              <SubmitButton className={`${buttonClass("ghost", "sm")} max-sm:h-10`}>Descartar plano</SubmitButton>
            </form>
          )}
        </Panel>
      </section>

      {plan.warnings.length > 0 && (
        <ul className="border border-line bg-surface px-4 py-3 space-y-1.5" aria-label="Avisos do plano">
          {plan.warnings.map((w, i) => (
            <li key={i} className="flex gap-2 text-[13px] text-cbm-gray-200">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" aria-hidden />
              {w}
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
                    <AssetThumb id={asset?.id} alt={asset ? assetTitle(asset) : "Imagem"} width={320} className="w-24 aspect-[16/10] border border-line" />
                  </Link>
                  <div className="min-w-0">
                    <p className="text-[12px] text-cbm-gray-400">
                      {asset ? assetTitle(asset) : "Imagem"} · <span className="tabular-nums text-cbm-gray-200">{Math.round(r.score * 100)}</span>/100
                    </p>
                    <p className="text-[13px] text-cbm-gray-200 leading-snug">{r.reason}</p>
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

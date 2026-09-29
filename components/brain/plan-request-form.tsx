"use client";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { requestPlanAction, revisePlanAction, type BrainActionState } from "@/app/actions/brain";
import { CREATIVE_GOALS, type CreativeGoal } from "@/src/core/brain/plan";
import { FORMAT_IDS, FORMATS } from "@/src/core/creative/formats";
import { JobFollower } from "@/components/atlas/job-follower";
import { Button, FormError, INPUT_CLASS, LABEL_CLASS } from "@/components/ui/primitives";

export interface BrainBadgeInfo {
  enabled: boolean;
  model: string | null;
}

/** Quem vai pensar o plano — sempre explícito (IA ou regras determinísticas). */
export function BrainBadge({ info }: { info: BrainBadgeInfo }) {
  return info.enabled ? (
    <span className="inline-flex items-center gap-1.5 border border-accent/50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.22em] text-accent">
      Atlas Brain · {info.model}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 border border-line px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.22em] text-cbm-gray-400" title="Defina OPENAI_API_KEY para ligar a IA">
      Regras do Atlas · IA desligada
    </span>
  );
}

function useFollowPlan(slug: string) {
  const router = useRouter();
  return (status: string, result: Record<string, unknown> | null) => {
    if (status === "completed" && typeof result?.planId === "string") router.push(`/projects/${slug}/plans/${result.planId}`);
  };
}

export function PlanRequestForm({ projectId, slug, brain, directions = [] }: { projectId: string; slug: string; brain: BrainBadgeInfo; directions?: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<BrainActionState, FormData>(requestPlanAction, null);
  const [goal, setGoal] = useState<CreativeGoal>("launch-post");
  const onDone = useFollowPlan(slug);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="projectId" value={projectId} />
      <fieldset>
        <legend className={LABEL_CLASS}>Objetivo</legend>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(CREATIVE_GOALS) as CreativeGoal[]).map((id) => (
            <label key={id} className={`cursor-pointer border px-3 py-2.5 transition-colors ${goal === id ? "border-accent bg-accent/5" : "border-line hover:border-cbm-gray-400"}`}>
              <input type="radio" name="goal" value={id} checked={goal === id} onChange={() => setGoal(id)} className="sr-only" />
              <span className={`block text-[13px] ${goal === id ? "text-cbm-white" : "text-cbm-gray-100"}`}>{CREATIVE_GOALS[id].label}</span>
              <span className="block text-[11px] text-cbm-gray-400 leading-snug">{CREATIVE_GOALS[id].hint}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className={LABEL_CLASS}>Formatos (opcional — padrão do objetivo)</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {FORMAT_IDS.map((f) => (
            <label key={f} className="flex items-center gap-1.5 text-[12px] text-cbm-gray-200">
              <input type="checkbox" name="formats" value={f} />
              {FORMATS[f].label}
            </label>
          ))}
        </div>
      </fieldset>
      {directions.length > 0 && (
        <div>
          <label htmlFor="plan-direction" className={LABEL_CLASS}>
            Seguir uma direção salva
          </label>
          <select id="plan-direction" name="directionId" defaultValue="" className={INPUT_CLASS}>
            <option value="">Nenhuma — o Atlas decide</option>
            {directions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <div>
          <label htmlFor="plan-notes" className={LABEL_CLASS}>
            Observações
          </label>
          <textarea id="plan-notes" name="notes" rows={3} maxLength={600} className={INPUT_CLASS} placeholder="Ex.: destacar o formulário de orçamento; público: arquitetos." />
        </div>
        <div>
          <label htmlFor="plan-max" className={LABEL_CLASS}>
            Peças
          </label>
          <select id="plan-max" name="maxItems" defaultValue="" className={INPUT_CLASS}>
            <option value="">Padrão</option>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" type="submit" disabled={pending}>
          Pedir plano
        </Button>
        <BrainBadge info={brain} />
      </div>
      <FormError message={state?.error} />
      {state?.jobId && <JobFollower key={state.jobId} jobId={state.jobId} onDone={onDone} />}
    </form>
  );
}

export function PlanReviseForm({ planId, slug }: { planId: string; slug: string }) {
  const [state, action, pending] = useActionState<BrainActionState, FormData>(revisePlanAction, null);
  const onDone = useFollowPlan(slug);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="planId" value={planId} />
      <label htmlFor="feedback" className={LABEL_CLASS}>
        Revisar o plano
      </label>
      <textarea id="feedback" name="feedback" rows={2} maxLength={600} required className={INPUT_CLASS} placeholder="Ex.: menos texto, mais foco no mobile, trocar a segunda peça." />
      <Button type="submit" disabled={pending}>
        Pedir revisão
      </Button>
      <FormError message={state?.error} />
      {state?.jobId && <JobFollower key={state.jobId} jobId={state.jobId} onDone={onDone} />}
    </form>
  );
}

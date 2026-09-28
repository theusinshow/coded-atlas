"use client";
import { useMemo } from "react";
import { applyPlanAction } from "@/app/actions/brain";
import type { CreativePlan } from "@/src/core/brain/plan";
import { getComposition } from "@/src/core/creative/compositions";
import { FORMATS } from "@/src/core/creative/formats";
import type { VisualProfile } from "@/src/core/creative/visual-profile";
import { ArtboardPreview } from "@/components/create/artboard-preview";
import { renderModel, type StudioAsset } from "@/components/create/types";
import { buttonClass } from "@/components/ui/primitives";

/** Peças do plano com preview real (mesmo kernel do render) e o porquê de cada uma. */
export function PlanItems({ plan, assets, profile, canApply }: { plan: CreativePlan; assets: StudioAsset[]; profile: VisualProfile | null; canApply: boolean }) {
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 items-start">
      {plan.items.map((item, index) => {
        const definition = getComposition(item.compositionId);
        if (!definition) return null;
        const model = renderModel(
          definition,
          { formatId: item.formatId, variant: item.variant, styleMode: plan.direction.styleMode, bindings: item.bindings, primary: plan.direction.accent ?? undefined },
          assetMap,
          profile
        );
        return (
          <li key={`${item.compositionId}-${index}`} className="space-y-2.5" data-plan-item={index}>
            <ArtboardPreview {...model} className="border border-line" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] text-zinc-100">
                  {index + 1}. {definition.name}
                </p>
                <p className="text-[10px] font-mono uppercase tracking-wider text-accent">
                  {FORMATS[item.formatId].label} · {definition.variants.find((v) => v.id === item.variant)?.label ?? item.variant}
                </p>
              </div>
              {canApply && (
                <form action={applyPlanAction}>
                  <input type="hidden" name="planId" value={plan.id} />
                  <input type="hidden" name="item" value={index} />
                  <button type="submit" className={buttonClass("secondary", "sm")}>
                    Criar esta
                  </button>
                </form>
              )}
            </div>
            <p className="text-[12px] text-zinc-400 leading-snug">{item.rationale}</p>
          </li>
        );
      })}
    </ul>
  );
}

"use client";
import { useMemo } from "react";
import { applyPlanAction } from "@/app/actions/brain";
import type { CreativePlan } from "@/src/core/brain/plan";
import { getComposition } from "@/src/core/creative/compositions";
import { FORMATS } from "@/src/core/creative/formats";
import type { VisualProfile } from "@/src/core/creative/visual-profile";
import { lintArtboard } from "@/src/core/creative/guardrails";
import { ArtboardPreview } from "@/components/create/artboard-preview";
import { CreativeIssues } from "@/components/creative/creative-issues";
import { renderModel, type StudioAsset } from "@/components/create/types";
import { SubmitButton } from "@/components/create/submit-button";
import { buttonClass } from "@/components/ui/primitives";

/** Peças do plano com preview real (mesmo kernel do render) e o porquê de cada uma. */
export function PlanItems({ plan, assets, profile, canApply }: { plan: CreativePlan; assets: StudioAsset[]; profile: VisualProfile | null; canApply: boolean }) {
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  return (
    <ul className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 items-start">
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
                <p className="text-[14px] text-cbm-white">
                  {index + 1}. {definition.name}
                </p>
                <p className="text-[12px] text-cbm-gray-400">
                  {FORMATS[item.formatId].label} · {definition.variants.find((v) => v.id === item.variant)?.label ?? item.variant}
                </p>
              </div>
              {canApply && (
                <form action={applyPlanAction}>
                  <input type="hidden" name="planId" value={plan.id} />
                  <input type="hidden" name="item" value={index} />
                  <SubmitButton className={`${buttonClass("secondary", "sm")} max-sm:h-10 shrink-0`}>Criar esta</SubmitButton>
                </form>
              )}
            </div>
            <p className="text-[13px] text-cbm-gray-400 leading-snug">{item.rationale}</p>
            <CreativeIssues issues={lintArtboard(model.artboard, model.tokens)} compact />
          </li>
        );
      })}
    </ul>
  );
}

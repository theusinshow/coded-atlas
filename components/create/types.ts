import type { Asset } from "@/src/core/assets/asset";
import type { Binding, CompositionDefinition, CompositionInstance } from "@/src/core/creative/composition";
import { getComposition } from "@/src/core/creative/compositions";
import { buildArtboard } from "@/src/core/creative/instance-artboard";
import type { FormatId } from "@/src/core/creative/formats";
import { resolveTokens, type StyleMode } from "@/src/core/creative/tokens";
import type { VisualProfile } from "@/src/core/creative/visual-profile";

/** Material do projeto que o Criar usa (só imagens). */
export type StudioAsset = Pick<Asset, "id" | "kind" | "label" | "mimeType" | "width" | "height" | "metadata" | "createdAt">;

export interface DraftState {
  formatId: FormatId;
  variant: string;
  styleMode: StyleMode;
  bindings: Record<string, Binding>;
  primary?: string;
}

/** Artboard + tokens de um estado de composição — o mesmo cálculo do render job. */
export function renderModel(definition: CompositionDefinition, draft: DraftState, assets: ReadonlyMap<string, StudioAsset>, profile: VisualProfile | null) {
  return {
    artboard: buildArtboard(definition, draft, assets, profile),
    tokens: resolveTokens(profile, draft.styleMode, draft.primary ? { primary: draft.primary } : {}),
  };
}

export function instanceDefinition(instance: Pick<CompositionInstance, "compositionId">): CompositionDefinition | undefined {
  return getComposition(instance.compositionId);
}

export const STYLE_MODES: { id: StyleMode; label: string; hint: string }[] = [
  { id: "hybrid", label: "Híbrido", hint: "Sistema Coded by M com a cor e a tipografia do projeto" },
  { id: "project", label: "Projeto", hint: "Cores e fontes do próprio projeto" },
  { id: "atlas", label: "Coded by M", hint: "Linguagem visual da Coded by M pura" },
];

export const FAMILY_LABEL: Record<CompositionDefinition["family"], string> = {
  showcase: "Vitrine",
  mobile: "Mobile",
  editorial: "Editorial",
  feature: "Destaque",
  detail: "Detalhes",
  typography: "Identidade",
  intro: "Abertura",
  outro: "Fechamento",
};

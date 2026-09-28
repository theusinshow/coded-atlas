import type { Asset } from "../assets/asset";
import type { Project } from "../projects/project";
import type { Binding, CompositionDefinition, TextSlot } from "./composition";

export interface BindingContext {
  project: Pick<Project, "name" | "category" | "client" | "description">;
  /** Assets do projeto (qualquer ordem). */
  assets: readonly Asset[];
  /** URL principal do projeto (source de site), se houver. */
  url?: string | null;
}

export const ATLAS_CREDIT = "Desenvolvido por Coded by M";

function host(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function defaultText(slot: TextSlot, ctx: BindingContext): string {
  const value = (() => {
    switch (slot.source) {
      case "project.name":
        return ctx.project.name;
      case "project.category":
        return ctx.project.category;
      case "project.client":
        return ctx.project.client ?? ctx.project.category;
      case "project.description":
        return ctx.project.description ?? "";
      case "project.url":
        return host(ctx.url);
      case "atlas.credit":
        return ATLAS_CREDIT;
      case "none":
        return "";
    }
  })();
  return value.slice(0, slot.maxLength);
}

/**
 * Liga cada slot ao melhor material disponível — determinístico. Para cada slot
 * de asset, percorre as preferências em ordem e escolhe o asset mais recente que
 * ainda não foi usado nesta composição (evita repetir a mesma imagem). Textos vêm
 * dos dados do projeto.
 */
export function autoBind(definition: CompositionDefinition, ctx: BindingContext): Record<string, Binding> {
  // Captura mais recente primeiro; dentro dela, seções na ordem da página — com o
  // hero (seção 0, que repete o screenshot principal) por último.
  const sectionRank = (a: Asset) => (a.metadata.sectionIndex === undefined ? -1 : a.metadata.sectionIndex === 0 ? 10_000 : a.metadata.sectionIndex);
  const newestFirst = [...ctx.assets]
    .filter((a) => a.mimeType.startsWith("image/"))
    .sort((a, b) => {
      const capA = a.captureId ?? "";
      const capB = b.captureId ?? "";
      if (capA !== capB) return capA < capB ? 1 : -1;
      const rank = sectionRank(a) - sectionRank(b);
      if (rank !== 0) return rank;
      // mesma captura: ordem de criação = ordem da página
      return a.id < b.id ? -1 : 1;
    });
  const used = new Set<string>();
  const bindings: Record<string, Binding> = {};

  for (const slot of definition.slots) {
    if (slot.type === "text") {
      bindings[slot.id] = { text: defaultText(slot, ctx) };
      continue;
    }
    let chosen: Asset | undefined;
    for (const pref of slot.prefers) {
      const matches = newestFirst.filter(
        (a) => pref.kinds.includes(a.kind) && (!pref.role || a.metadata.role === pref.role) && (!pref.device || a.metadata.device === pref.device)
      );
      chosen = matches.find((a) => !used.has(a.id)) ?? (slot.required ? matches[0] : undefined);
      if (chosen) break;
    }
    if (chosen) used.add(chosen.id);
    bindings[slot.id] = { assetId: chosen?.id ?? null };
  }
  return bindings;
}

/** Slots obrigatórios sem material — a composição ainda renderiza, mas fica incompleta. */
export function missingSlots(definition: CompositionDefinition, bindings: Record<string, Binding>): string[] {
  return definition.slots
    .filter((slot) => slot.required)
    .filter((slot) => {
      const b = bindings[slot.id];
      return !b || ("assetId" in b ? b.assetId === null : !b.text.trim());
    })
    .map((slot) => slot.label);
}

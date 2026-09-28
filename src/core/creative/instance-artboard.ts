import type { Asset } from "../assets/asset";
import { ArtboardSchema, type Artboard } from "../documents/artboard";
import { parseOrThrow } from "../../shared/validation";
import type { Binding, CompositionDefinition, ResolvedAsset } from "./composition";
import { formatSize, type FormatId } from "./formats";
import type { VisualProfile } from "./visual-profile";

export interface InstanceSpec {
  formatId: FormatId;
  variant: string;
  bindings: Record<string, Binding>;
}

/**
 * Monta o Artboard de uma composição ligada a material real. Pura: roda no
 * servidor (render) e no navegador (preview ao vivo) com o mesmo resultado.
 * Assets ligados que não existem mais (ou não são imagem) viram slot vazio.
 */
export function buildArtboard(
  definition: CompositionDefinition,
  spec: InstanceSpec,
  assets: ReadonlyMap<string, Pick<Asset, "id" | "width" | "height" | "mimeType">>,
  profile: Pick<VisualProfile, "palette" | "fonts"> | null
): Artboard {
  const size = definition.formats.includes(spec.formatId) ? formatSize(spec.formatId) : formatSize(definition.formats[0]);
  const variant = definition.variants.some((v) => v.id === spec.variant) ? spec.variant : definition.variants[0].id;
  const resolved: Record<string, ResolvedAsset | null> = {};
  const texts: Record<string, string> = {};
  for (const slot of definition.slots) {
    const binding = spec.bindings[slot.id];
    if (slot.type === "text") {
      texts[slot.id] = binding && "text" in binding ? binding.text.slice(0, slot.maxLength) : "";
      continue;
    }
    const asset = binding && "assetId" in binding && binding.assetId ? assets.get(binding.assetId) : undefined;
    resolved[slot.id] =
      asset && asset.mimeType.startsWith("image/") ? { id: asset.id, width: asset.width ?? 1600, height: asset.height ?? 1000 } : null;
  }
  const artboard = definition.build({
    width: size.width,
    height: size.height,
    variant,
    assets: resolved,
    texts,
    palette: profile?.palette ?? [],
    fonts: profile?.fonts ?? [],
  });
  return parseOrThrow(ArtboardSchema, artboard, `Artboard de ${definition.id}`);
}

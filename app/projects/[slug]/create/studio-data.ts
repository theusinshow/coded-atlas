import type { Asset } from "@/src/core/assets/asset";
import type { StudioAsset } from "@/components/create/types";

/** Só imagens, só os campos que o cliente usa (sem storageKey/sha256). */
export function studioAssets(assets: readonly Asset[]): StudioAsset[] {
  return assets
    .filter((a) => a.mimeType.startsWith("image/"))
    .map(({ id, kind, label, mimeType, width, height, metadata, createdAt }) => ({ id, kind, label, mimeType, width, height, metadata, createdAt }));
}

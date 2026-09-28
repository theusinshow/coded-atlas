import type { Asset } from "@/src/core/assets/asset";
import type { StudioAsset } from "@/components/create/types";

const pick = ({ id, kind, label, mimeType, width, height, metadata, createdAt }: Asset): StudioAsset => ({ id, kind, label, mimeType, width, height, metadata, createdAt });

/** Só imagens, só os campos que o cliente usa (sem storageKey/sha256). */
export function studioAssets(assets: readonly Asset[]): StudioAsset[] {
  return assets.filter((a) => a.mimeType.startsWith("image/")).map(pick);
}

/** Studio: imagens e vídeos (movimento capturado, só em vídeos) + áudios para trilha. */
export function studioMedia(assets: readonly Asset[]): { visual: StudioAsset[]; audio: StudioAsset[] } {
  return {
    visual: assets.filter((a) => a.mimeType.startsWith("image/") || a.mimeType.startsWith("video/")).map(pick),
    audio: assets.filter((a) => a.mimeType.startsWith("audio/")).map(pick),
  };
}

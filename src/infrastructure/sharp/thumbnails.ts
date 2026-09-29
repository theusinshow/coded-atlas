import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { extractFrame } from "../ffmpeg/ffmpeg";
import type { Asset } from "../../core/assets/asset";
import type { AssetStorage } from "../../core/assets/asset-storage";
import { parseStorageKey, type StorageKey } from "../../core/assets/storage-key";
import { isDomainError } from "../../shared/errors";

/** Larguras servidas — um conjunto fechado evita encher o cache com tamanhos arbitrários. */
export const THUMB_WIDTHS = [320, 640, 1280] as const;
export type ThumbWidth = (typeof THUMB_WIDTHS)[number];

export function isThumbWidth(value: number): value is ThumbWidth {
  return (THUMB_WIDTHS as readonly number[]).includes(value);
}

/** Chave de cache da miniatura: derivada do hash do original (muda se os bytes mudarem). */
export function thumbKey(sha256: string, width: ThumbWidth, fit: ThumbFit = "grid"): StorageKey {
  return parseStorageKey(`cache/thumbs/${sha256.slice(0, 2)}/${sha256}-w${width}${fit === "whole" ? "-whole" : ""}.webp`);
}

export function thumbCacheKeys(_key: StorageKey, sha256: string): StorageKey[] {
  return THUMB_WIDTHS.flatMap((w) => [thumbKey(sha256, w), thumbKey(sha256, w, "whole")]);
}

/** "grid": imagens altas cortadas no topo (grade de assets); "whole": a imagem inteira (peças finais). */
export type ThumbFit = "grid" | "whole";

/**
 * Miniaturas WebP sob demanda, cacheadas no AssetStorage (namespace `cache/`).
 * Imagens altas (full page) são cortadas no topo numa proporção 16:10 — é o que
 * uma grade de assets precisa mostrar. Vídeos ganham um pôster (quadro em 1 s via
 * FFmpeg) — sem ele, as grades mostram caixas pretas/brancas no lugar do vídeo.
 */
/** Qualquer mídia no AssetStorage com hash e dimensões: Asset ou Output. */
export type Thumbnailable = Pick<Asset, "mimeType" | "sha256" | "storageKey" | "width" | "height">;

export class ThumbnailService {
  constructor(private readonly storage: AssetStorage) {}

  async get(asset: Thumbnailable, width: ThumbWidth, fit: ThumbFit = "grid"): Promise<Uint8Array | null> {
    const isVideo = asset.mimeType.startsWith("video/");
    if (!asset.mimeType.startsWith("image/") && !isVideo) return null;
    const key = thumbKey(asset.sha256, width, fit);
    try {
      return await this.storage.get(key);
    } catch (err) {
      if (!isDomainError(err, "NOT_FOUND")) throw err;
    }
    const original = isVideo ? await this.poster(asset) : await this.storage.get(asset.storageKey);
    if (!original) return null;
    const tall = fit === "grid" && asset.width && asset.height && asset.height > asset.width * 1.6;
    const pipeline = sharp(original, { animated: false }).rotate();
    const resized = tall
      ? pipeline.resize({ width, height: Math.round(width * 0.625), fit: "cover", position: "top", withoutEnlargement: false })
      : pipeline.resize({ width, withoutEnlargement: true });
    const bytes = new Uint8Array(await resized.webp({ quality: 80 }).toBuffer());
    try {
      await this.storage.put(key, bytes);
    } catch (err) {
      // Outra requisição gravou a mesma miniatura ao mesmo tempo: a dela vale.
      if (!isDomainError(err, "CONFLICT")) throw err;
    }
    return bytes;
  }

  /** Pôster do vídeo: grava o vídeo num temporário (o FFmpeg precisa de arquivo) e extrai um quadro. */
  private async poster(asset: Thumbnailable): Promise<Uint8Array | null> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "atlas-poster-"));
    try {
      const file = path.join(dir, "video");
      await writeFile(file, await this.storage.get(asset.storageKey));
      return await extractFrame(file, 1).catch(() => extractFrame(file, 0));
    } catch {
      return null; // sem FFmpeg ou vídeo ilegível: a interface mostra o marcador de vídeo
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

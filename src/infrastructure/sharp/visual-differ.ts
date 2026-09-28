import pixelmatch from "pixelmatch";
import sharp from "sharp";
import type { ImageDiffer, ImageDiffResult } from "../../modules/capture/visual-diff";

/** Teto de pixels comparados: páginas inteiras muito altas são reduzidas antes (memória). */
const MAX_PIXELS = 24_000_000;

/**
 * Sharp decodifica para RGBA cru e o pixelmatch compara (mesmos parâmetros do v1).
 * Se a página mudou de tamanho, o "depois" é redimensionado para a base.
 */
export class SharpPixelmatchDiffer implements ImageDiffer {
  async diff(before: Uint8Array, after: Uint8Array): Promise<ImageDiffResult> {
    const meta = await sharp(before).metadata();
    if (!meta.width || !meta.height) throw new Error("Imagem base sem dimensões.");
    const scale = Math.min(1, Math.sqrt(MAX_PIXELS / (meta.width * meta.height)));
    const width = Math.max(1, Math.round(meta.width * scale));
    const height = Math.max(1, Math.round(meta.height * scale));
    const raw = (bytes: Uint8Array) => sharp(bytes).resize(width, height, { fit: "fill" }).ensureAlpha().raw().toBuffer();
    const [a, b] = await Promise.all([raw(before), raw(after)]);
    const out = Buffer.alloc(width * height * 4);
    const changedPixels = pixelmatch(a, b, out, width, height, { threshold: 0.1, alpha: 0.3, diffColor: [255, 90, 60] });
    const png = await sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
    return { png: new Uint8Array(png), width, height, changedPixels, totalPixels: width * height };
  }
}

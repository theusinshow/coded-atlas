import sharp from "sharp";
import type { MediaProbe, ProbedMedia } from "../../modules/import/media-probe";

const IMAGE_FORMATS: Record<string, { mimeType: string; extension: string }> = {
  png: { mimeType: "image/png", extension: "png" },
  jpeg: { mimeType: "image/jpeg", extension: "jpg" },
  webp: { mimeType: "image/webp", extension: "webp" },
  avif: { mimeType: "image/avif", extension: "avif" },
  gif: { mimeType: "image/gif", extension: "gif" },
  svg: { mimeType: "image/svg+xml", extension: "svg" },
};

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((b, i) => bytes[offset + i] === b);
}

/** Vídeo: só assinatura (dimensões ficam para quando houver probe de vídeo). */
function sniffVideo(bytes: Uint8Array): ProbedMedia | null {
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    return { mimeType: "video/webm", extension: "webm", kind: "video", width: null, height: null };
  }
  // MP4/MOV: caixa "ftyp" nos bytes 4–7
  if (startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) {
    return { mimeType: "video/mp4", extension: "mp4", kind: "video", width: null, height: null };
  }
  return null;
}

/** MediaProbe sobre o Sharp (imagens) + assinaturas (vídeos). */
export class SharpMediaProbe implements MediaProbe {
  async probe(bytes: Uint8Array): Promise<ProbedMedia | null> {
    const video = sniffVideo(bytes);
    if (video) return video;
    try {
      const meta = await sharp(bytes, { animated: false }).metadata();
      const format = meta.format ? IMAGE_FORMATS[meta.format] : undefined;
      if (!format) return null;
      return { ...format, kind: "image", width: meta.width ?? null, height: meta.height ?? null };
    } catch {
      return null; // não é imagem que o Sharp reconheça = formato não aceito
    }
  }
}

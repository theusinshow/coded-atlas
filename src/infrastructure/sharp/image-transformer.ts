import sharp from "sharp";
import type { ImageTransformer, TransformedImage } from "../../modules/assets/image-transformer";

export class SharpImageTransformer implements ImageTransformer {
  async coverCrop(source: Uint8Array, width: number, height: number): Promise<TransformedImage> {
    const bytes = await sharp(source).resize(width, height, { fit: "cover", position: "attention" }).webp({ quality: 88 }).toBuffer();
    return { bytes: new Uint8Array(bytes), width, height, mimeType: "image/webp", extension: "webp" };
  }
}

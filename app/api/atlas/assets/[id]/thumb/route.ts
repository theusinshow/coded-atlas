export const runtime = "nodejs";

import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { isThumbWidth } from "@/src/infrastructure/sharp/thumbnails";
import { DomainError } from "@/src/shared/errors";
import { AssetIdSchema } from "@/src/shared/id";
import { errorResponse, parseParam } from "../../../_lib/http";

interface Params {
  params: Promise<{ id: string }>;
}

/** Miniatura WebP de um asset de imagem (?w=320|640|1280), cacheada no AssetStorage. */
export async function GET(req: Request, { params }: Params): Promise<Response> {
  try {
    const id = parseParam(AssetIdSchema, (await params).id, "id");
    const width = Number(new URL(req.url).searchParams.get("w") ?? 640);
    if (!isThumbWidth(width)) throw new DomainError("VALIDATION", "Largura inválida (use 320, 640 ou 1280).");
    const { repos, thumbnails } = await getAtlasRuntime();
    const asset = await repos.assets.getById(id);
    if (!asset) throw new DomainError("NOT_FOUND", "Asset não encontrado.");
    const bytes = await thumbnails.get(asset, width);
    if (!bytes) throw new DomainError("NOT_FOUND", "Este asset não tem miniatura.");
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=31536000, immutable",
        ETag: `"${asset.sha256}-w${width}"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

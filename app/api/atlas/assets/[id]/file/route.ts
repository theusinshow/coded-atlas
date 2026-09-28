export const runtime = "nodejs";

import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { DomainError } from "@/src/shared/errors";
import { AssetIdSchema } from "@/src/shared/id";
import { errorResponse, parseParam } from "../../../_lib/http";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Bytes de um Asset, lidos pelo AssetStorage (o caminho no disco nunca aparece).
 * Asset é imutável, então o cache pode ser eterno.
 */
export async function GET(_req: Request, { params }: Params): Promise<Response> {
  try {
    const id = parseParam(AssetIdSchema, (await params).id, "id");
    const { repos, storage } = await getAtlasRuntime();
    const asset = await repos.assets.getById(id);
    if (!asset) throw new DomainError("NOT_FOUND", "Asset não encontrado.");
    const bytes = await storage.get(asset.storageKey);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, max-age=31536000, immutable",
        ETag: `"${asset.sha256}"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export const runtime = "nodejs";

import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { isThumbWidth } from "@/src/infrastructure/sharp/thumbnails";
import { DomainError } from "@/src/shared/errors";
import { OutputIdSchema } from "@/src/shared/id";
import { errorResponse, parseParam } from "../../../_lib/http";

interface Params {
  params: Promise<{ id: string }>;
}

/** Miniatura WebP de um Output de imagem (?w=320|640|1280), cacheada no AssetStorage. */
export async function GET(req: Request, { params }: Params): Promise<Response> {
  try {
    const id = parseParam(OutputIdSchema, (await params).id, "id");
    const width = Number(new URL(req.url).searchParams.get("w") ?? 640);
    if (!isThumbWidth(width)) throw new DomainError("VALIDATION", "Largura inválida (use 320, 640 ou 1280).");
    const { repos, thumbnails } = await getAtlasRuntime();
    const output = await repos.outputs.getById(id);
    if (!output) throw new DomainError("NOT_FOUND", "Peça não encontrada.");
    const bytes = await thumbnails.get(output, width, "whole");
    if (!bytes) throw new DomainError("NOT_FOUND", "Esta peça não tem miniatura.");
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=31536000, immutable",
        ETag: `"${output.sha256}-w${width}-whole"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

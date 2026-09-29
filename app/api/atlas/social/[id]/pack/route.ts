export const runtime = "nodejs";

import { safeFileBase } from "@/src/core/assets/file-names";
import { SocialPostIdSchema } from "@/src/core/social/social-post";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { buildZip } from "@/src/infrastructure/zip/zip-builder";
import { getPlannedPost } from "@/src/modules/social/social-service";
import { DomainError } from "@/src/shared/errors";
import { errorResponse, parseParam } from "../../../_lib/http";

interface Params {
  params: Promise<{ id: string }>;
}

/** Pacote para postar: peças numeradas na ordem do post + legenda.txt (texto pronto para colar). */
export async function GET(_req: Request, { params }: Params): Promise<Response> {
  try {
    const id = parseParam(SocialPostIdSchema, (await params).id, "id");
    const { repos, storage } = await getAtlasRuntime();
    const planned = await getPlannedPost(repos, id);
    if (planned.pieces.length === 0) throw new DomainError("NOT_FOUND", "O post não tem peças disponíveis.");
    const entries = [];
    for (const [i, o] of planned.pieces.entries()) {
      entries.push({ name: `${String(i + 1).padStart(2, "0")}-${safeFileBase(o.label, o.id, 60)}.${o.format}`, bytes: await storage.get(o.storageKey) });
    }
    entries.push({ name: "legenda.txt", bytes: new TextEncoder().encode(`${planned.finalCaption}\n`) });
    const zip = await buildZip(entries);
    return new Response(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(zip.byteLength),
        "Content-Disposition": `attachment; filename="${safeFileBase(planned.post.title, "post")}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

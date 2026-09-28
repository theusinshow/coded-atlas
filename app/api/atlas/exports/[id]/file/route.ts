export const runtime = "nodejs";

import { safeFileBase } from "@/src/core/assets/file-names";
import { ExportIdSchema } from "@/src/core/publish/export";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { DomainError } from "@/src/shared/errors";
import { errorResponse, parseParam } from "../../../_lib/http";

interface Params {
  params: Promise<{ id: string }>;
}

/** ZIP de uma exportação entregue como download (pacote ou portfólio). */
export async function GET(_req: Request, { params }: Params): Promise<Response> {
  try {
    const id = parseParam(ExportIdSchema, (await params).id, "id");
    const { repos, storage } = await getAtlasRuntime();
    const record = await repos.exports.getById(id);
    const archive = record?.status === "delivered" ? record.result.archive : undefined;
    if (!record || !archive) throw new DomainError("NOT_FOUND", "Pacote não encontrado.");
    const bytes = await storage.get(archive.storageKey);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename="${safeFileBase(record.name, "pacote")}.zip"`,
        "Cache-Control": "private, max-age=31536000, immutable",
        ETag: `"${archive.sha256}"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

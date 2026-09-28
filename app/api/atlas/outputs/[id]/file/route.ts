export const runtime = "nodejs";

import { safeFileName } from "@/src/core/assets/file-names";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { DomainError } from "@/src/shared/errors";
import { OutputIdSchema } from "@/src/shared/id";
import { errorResponse, parseParam } from "../../../_lib/http";

interface Params {
  params: Promise<{ id: string }>;
}

/** Bytes de um Output (peça final). `?download=1` força o download com nome legível. */
export async function GET(req: Request, { params }: Params): Promise<Response> {
  try {
    const id = parseParam(OutputIdSchema, (await params).id, "id");
    const { repos, storage } = await getAtlasRuntime();
    const output = await repos.outputs.getById(id);
    if (!output) throw new DomainError("NOT_FOUND", "Peça não encontrada.");
    const bytes = await storage.get(output.storageKey);
    const headers: Record<string, string> = {
      "Content-Type": output.mimeType,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, max-age=31536000, immutable",
      ETag: `"${output.sha256}"`,
    };
    if (new URL(req.url).searchParams.get("download") === "1") {
      headers["Content-Disposition"] = `attachment; filename="${safeFileName(output.label, output.format, output.id)}"`;
    }
    return new Response(new Uint8Array(bytes), { headers });
  } catch (err) {
    return errorResponse(err);
  }
}

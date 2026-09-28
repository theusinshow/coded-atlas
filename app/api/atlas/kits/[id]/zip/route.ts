export const runtime = "nodejs";

import { safeFileBase, safeFileName } from "@/src/core/assets/file-names";
import { MediaKitIdSchema } from "@/src/core/kits/media-kit";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { buildZip } from "@/src/infrastructure/zip/zip-builder";
import { DomainError } from "@/src/shared/errors";
import { errorResponse, parseParam } from "../../../_lib/http";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Entrega do Media Kit: as peças do último render do kit, uma pasta por item na
 * ordem do preset (01-post-de-lancamento/…). Nomes seguros, nunca caminhos de disco.
 */
export async function GET(_req: Request, { params }: Params): Promise<Response> {
  try {
    const id = parseParam(MediaKitIdSchema, (await params).id, "id");
    const { repos, storage } = await getAtlasRuntime();
    const kit = await repos.kits.getById(id);
    if (!kit) throw new DomainError("NOT_FOUND", "Media Kit não encontrado.");
    const outputs = (await repos.outputs.listByProject(kit.projectId)).filter((o) => o.metadata.mediaKitId === kit.id && o.jobId === kit.lastRenderJobId);
    if (outputs.length === 0) throw new DomainError("NOT_FOUND", "Renderize o kit antes de baixar.");
    const entries = [];
    for (const [index, item] of kit.items.entries()) {
      const folder = `${String(index + 1).padStart(2, "0")}-${safeFileBase(item.label, item.presetItemId)}`;
      const mine = outputs.filter((o) => o.metadata.kitItemId === item.id).sort((a, b) => (a.metadata.page ?? 0) - (b.metadata.page ?? 0) || a.format.localeCompare(b.format));
      for (const [n, o] of mine.entries()) {
        const page = o.metadata.page !== undefined ? `${String(o.metadata.page + 1).padStart(2, "0")}-` : mine.length > 1 ? `${n + 1}-` : "";
        entries.push({ name: `${folder}/${page}${safeFileName(item.label, o.format, o.id)}`, bytes: await storage.get(o.storageKey) });
      }
    }
    const zip = await buildZip(entries);
    return new Response(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(zip.byteLength),
        "Content-Disposition": `attachment; filename="${safeFileBase(kit.name, "media-kit")}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

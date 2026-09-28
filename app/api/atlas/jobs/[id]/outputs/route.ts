export const runtime = "nodejs";

import { safeFileBase, safeFileName } from "@/src/core/assets/file-names";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { buildZip } from "@/src/infrastructure/zip/zip-builder";
import { DomainError } from "@/src/shared/errors";
import { JobIdSchema } from "@/src/shared/id";
import { errorResponse, parseParam } from "../../../_lib/http";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Todas as peças de um render num ZIP, na ordem de saída (páginas do carrossel
 * numeradas 01, 02…). Nomes derivados do rótulo, nunca de caminhos.
 */
export async function GET(_req: Request, { params }: Params): Promise<Response> {
  try {
    const id = parseParam(JobIdSchema, (await params).id, "id");
    const { repos, storage } = await getAtlasRuntime();
    const job = await repos.jobs.getById(id);
    if (!job?.projectId) throw new DomainError("NOT_FOUND", "Render não encontrado.");
    const outputs = (await repos.outputs.listByProject(job.projectId))
      .filter((o) => o.jobId === job.id)
      .sort((a, b) => (a.metadata.page ?? 0) - (b.metadata.page ?? 0) || a.format.localeCompare(b.format));
    if (outputs.length === 0) throw new DomainError("NOT_FOUND", "Este render não gerou peças.");
    const used = new Set<string>();
    const entries = [];
    for (const o of outputs) {
      const prefix = o.metadata.page !== undefined ? `${String(o.metadata.page + 1).padStart(2, "0")}-` : "";
      let name = prefix + safeFileName(o.label, o.format, o.id);
      if (used.has(name)) name = `${prefix}${safeFileBase(o.label, o.id)}-${o.id.slice(-6).toLowerCase()}.${o.format}`;
      used.add(name);
      entries.push({ name, bytes: await storage.get(o.storageKey) });
    }
    const zip = await buildZip(entries);
    const project = await repos.projects.getById(job.projectId);
    return new Response(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(zip.byteLength),
        "Content-Disposition": `attachment; filename="${safeFileBase(project?.slug, "atlas")}-render-${job.id.slice(-8).toLowerCase()}.zip"`,
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

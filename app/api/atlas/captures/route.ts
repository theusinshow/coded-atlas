export const runtime = "nodejs";

import { queueUrlCapture } from "@/src/modules/capture/queue-url-capture";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { DomainError } from "@/src/shared/errors";
import { errorResponse } from "../_lib/http";

/**
 * Enfileira a captura de uma URL (cria/reaproveita projeto e source).
 * Responde na hora com os IDs — o trabalho acontece no worker, não nesta request.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new DomainError("VALIDATION", "Corpo da requisição não é JSON.");
    }
    const { repos, urlPolicy } = await getAtlasRuntime();
    const { project, source, job } = await queueUrlCapture(
      { ...repos, assertUrlAllowed: urlPolicy.assertAllowed },
      body as Parameters<typeof queueUrlCapture>[1]
    );
    return Response.json({ projectId: project.id, sourceId: source.id, jobId: job.id }, { status: 202 });
  } catch (err) {
    return errorResponse(err);
  }
}

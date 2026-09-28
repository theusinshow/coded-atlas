export const runtime = "nodejs";

import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { JobIdSchema } from "@/src/shared/id";
import { errorResponse, parseParam } from "../../../_lib/http";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Pede o cancelamento (persistido). Job na fila é cancelado na hora; em execução,
 * o worker vê o pedido no próximo heartbeat e interrompe o navegador.
 */
export async function POST(_req: Request, { params }: Params): Promise<Response> {
  try {
    const id = parseParam(JobIdSchema, (await params).id, "id");
    const { repos } = await getAtlasRuntime();
    return Response.json({ job: await repos.jobs.requestCancel(id) });
  } catch (err) {
    return errorResponse(err);
  }
}

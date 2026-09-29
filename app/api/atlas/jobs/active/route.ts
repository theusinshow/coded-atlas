export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { errorResponse } from "../../_lib/http";

/** Quantos jobs estão na fila ou rodando — alimenta o indicador de atividade do cabeçalho. */
export async function GET(): Promise<Response> {
  try {
    const { repos } = await getAtlasRuntime();
    const jobs = await repos.jobs.listRecent({ statuses: ["queued", "preparing", "running"], limit: 100 });
    return Response.json({ active: jobs.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

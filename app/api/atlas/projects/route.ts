export const runtime = "nodejs";

import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { errorResponse } from "../_lib/http";

/** Projetos do Atlas 2.x (SQLite). A biblioteca v1 continua em /api/projects. */
export async function GET(): Promise<Response> {
  try {
    const { repos } = await getAtlasRuntime();
    return Response.json({ projects: await repos.projects.list() });
  } catch (err) {
    return errorResponse(err);
  }
}

export const runtime = "nodejs";

import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { DomainError } from "@/src/shared/errors";
import { ProjectIdSchema } from "@/src/shared/id";
import { errorResponse, parseParam } from "../../_lib/http";

interface Params {
  params: Promise<{ id: string }>;
}

/** Projeto recarregado do banco: sources, captures, assets e jobs. */
export async function GET(_req: Request, { params }: Params): Promise<Response> {
  try {
    const id = parseParam(ProjectIdSchema, (await params).id, "id");
    const { repos } = await getAtlasRuntime();
    const project = await repos.projects.getById(id);
    if (!project) throw new DomainError("NOT_FOUND", "Projeto não encontrado.");
    const [sources, captures, assets, jobs] = await Promise.all([
      repos.sources.listByProject(id),
      repos.captures.listByProject(id),
      repos.assets.listByProject(id),
      repos.jobs.listByProject(id),
    ]);
    return Response.json({ project, sources, captures, assets, jobs });
  } catch (err) {
    return errorResponse(err);
  }
}

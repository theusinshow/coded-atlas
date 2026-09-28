"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ExportDestinationSchema } from "@/src/core/publish/export";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { requestPackage, requestPortfolio } from "@/src/modules/publish/export-service";
import { isDomainError } from "@/src/shared/errors";
import { ProjectIdSchema } from "@/src/shared/id";

export type PublishActionState = { error?: string; jobId?: string; exportId?: string } | null;

function failure(err: unknown): { error: string } {
  if (isDomainError(err)) return { error: err.message };
  if (err instanceof z.ZodError) return { error: "Dados inválidos." };
  console.error("[atlas:publish]", err);
  return { error: "Algo deu errado. Tente novamente." };
}

const outputIds = (form: FormData) => form.getAll("outputId").filter((v): v is string => typeof v === "string");
const name = (form: FormData) => {
  const v = form.get("name");
  return typeof v === "string" ? v : undefined;
};

/** "Criar pacote" em Publicar: as peças marcadas → pasta/ZIP/GitHub. Sempre um clique do Matheus. */
export async function createPackageAction(_prev: PublishActionState, form: FormData): Promise<PublishActionState> {
  try {
    const { exportDeps, repos } = await getAtlasRuntime();
    const projectId = ProjectIdSchema.parse(form.get("projectId"));
    const { record, job } = await requestPackage(exportDeps, { projectId, outputIds: outputIds(form), destination: ExportDestinationSchema.parse(form.get("destination")), name: name(form) });
    const project = await repos.projects.getById(projectId);
    if (project) revalidatePath(`/projects/${project.slug}/publish`);
    return { jobId: job.id, exportId: record.id };
  } catch (err) {
    return failure(err);
  }
}

/** Portfólio: peças de vários projetos + portfolio.json (compatível com o manifesto do v1). */
export async function createPortfolioAction(_prev: PublishActionState, form: FormData): Promise<PublishActionState> {
  try {
    const { exportDeps } = await getAtlasRuntime();
    const { record, job } = await requestPortfolio(exportDeps, { outputIds: outputIds(form), destination: ExportDestinationSchema.parse(form.get("destination")), name: name(form) });
    revalidatePath("/portfolio");
    return { jobId: job.id, exportId: record.id };
  } catch (err) {
    return failure(err);
  }
}

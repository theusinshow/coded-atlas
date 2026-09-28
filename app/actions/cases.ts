"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { CreativeDocumentIdSchema } from "@/src/core/documents/creative-document";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { requestCaseCopy } from "@/src/modules/brain/case-copy";
import { createCase } from "@/src/modules/create/document-service";
import { isDomainError } from "@/src/shared/errors";
import { ProjectIdSchema } from "@/src/shared/id";

export type CaseActionResult = { ok: true; jobId: string } | { ok: false; error: string };

/** Case do projeto: esqueleto editorial a partir do material → editor. */
export async function createCaseAction(form: FormData): Promise<void> {
  const { documentDeps, repos } = await getAtlasRuntime();
  const direction = form.get("directionId");
  const { document } = await createCase({ ...documentDeps, sources: repos.sources, directions: repos.directions }, ProjectIdSchema.parse(form.get("projectId")), {
    directionId: typeof direction === "string" && direction ? direction : null,
  });
  redirect(`/cases/${document.id}`);
}

/** Atlas Brain escreve os trechos vazios (job; nada que já foi escrito é alterado). */
export async function requestCaseCopyAction(documentId: string): Promise<CaseActionResult> {
  try {
    const { repos, brainDeps } = await getAtlasRuntime();
    const job = await requestCaseCopy({ documents: repos.documents, jobs: repos.jobs, brain: brainDeps.brain }, CreativeDocumentIdSchema.parse(documentId));
    return { ok: true, jobId: job.id };
  } catch (err) {
    if (isDomainError(err)) return { ok: false, error: err.message };
    if (err instanceof z.ZodError) return { ok: false, error: "Dados inválidos." };
    console.error("[atlas:cases]", err);
    return { ok: false, error: "Algo deu errado. Tente novamente." };
  }
}

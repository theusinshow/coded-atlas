"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CompositionInstanceIdSchema } from "@/src/core/creative/composition";
import { FormatIdSchema } from "@/src/core/creative/formats";
import { CreativePlanIdSchema } from "@/src/core/brain/plan";
import { CreativeDocumentIdSchema, type DocumentContent, type RevisionSummary } from "@/src/core/documents/creative-document";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { updateInstance } from "@/src/modules/create/composition-service";
import {
  animateDocument,
  animateInstance,
  createBlankCanvas,
  createBlankCarousel,
  createBlankMotion,
  createVideoFromRecipe,
  createWebsiteScroll,
  materializePlanAsCarousel,
  deleteDocument,
  enqueueDocumentRender,
  materializeInstance,
  renameDocument,
  restoreRevision,
  saveCanvas,
} from "@/src/modules/create/document-service";
import { RenderFormatSchema } from "@/src/modules/render/render-job";
import { isDomainError } from "@/src/shared/errors";
import { ProjectIdSchema } from "@/src/shared/id";
import { PatchSchema, type InstancePatch } from "./schemas";

export type StudioResult =
  | { ok: true; revision: number; jobId?: string; content?: DocumentContent }
  | { ok: false; error: string; conflict?: boolean };

function failure(err: unknown): { ok: false; error: string; conflict?: boolean } {
  if (isDomainError(err)) return { ok: false, error: err.message, conflict: err.code === "CONFLICT" };
  if (err instanceof z.ZodError) return { ok: false, error: "Dados inválidos." };
  console.error("[atlas:studio]", err);
  return { ok: false, error: "Algo deu errado. Tente novamente." };
}

const RevisionSchema = z.number().int().positive();

/** Autosave: grava sobre a revisão que o editor conhece (CONFLICT se outra aba gravou antes). */
export async function saveCanvasAction(documentId: string, baseRevision: number, content: unknown): Promise<StudioResult> {
  try {
    const { documentDeps } = await getAtlasRuntime();
    const { revision } = await saveCanvas(documentDeps, CreativeDocumentIdSchema.parse(documentId), RevisionSchema.parse(baseRevision), content);
    return { ok: true, revision: revision.revision };
  } catch (err) {
    return failure(err);
  }
}

/** Salva o estado atual e renderiza exatamente essa revisão (que fica fixada). */
export async function renderCanvasAction(documentId: string, baseRevision: number, content: unknown, formats: string[], quality: "preview" | "final" = "final"): Promise<StudioResult> {
  try {
    const { documentDeps } = await getAtlasRuntime();
    const id = CreativeDocumentIdSchema.parse(documentId);
    const { revision } = await saveCanvas(documentDeps, id, RevisionSchema.parse(baseRevision), content);
    const job = await enqueueDocumentRender(documentDeps, id, revision.revision, z.array(RenderFormatSchema).min(1).max(5).parse(formats), z.enum(["preview", "final"]).parse(quality));
    return { ok: true, revision: revision.revision, jobId: job.id };
  } catch (err) {
    return failure(err);
  }
}

export async function restoreRevisionAction(documentId: string, revision: number): Promise<StudioResult> {
  try {
    const { documentDeps, repos } = await getAtlasRuntime();
    const id = CreativeDocumentIdSchema.parse(documentId);
    const result = await restoreRevision(documentDeps, id, RevisionSchema.parse(revision));
    const stored = await repos.documents.getRevision(id, result.revision.revision);
    return { ok: true, revision: result.revision.revision, content: stored?.content };
  } catch (err) {
    return failure(err);
  }
}

export async function renameDocumentAction(documentId: string, name: string): Promise<StudioResult> {
  try {
    const { documentDeps } = await getAtlasRuntime();
    const document = await renameDocument(documentDeps, CreativeDocumentIdSchema.parse(documentId), z.string().trim().min(1).max(120).parse(name));
    return { ok: true, revision: document.headRevision };
  } catch (err) {
    return failure(err);
  }
}

async function projectSlug(projectId: string): Promise<string | null> {
  const { repos } = await getAtlasRuntime();
  return (await repos.projects.getById(ProjectIdSchema.parse(projectId)))?.slug ?? null;
}

export async function deleteDocumentAction(documentId: string): Promise<StudioResult> {
  let slug: string | null;
  try {
    const { documentDeps } = await getAtlasRuntime();
    const document = await deleteDocument(documentDeps, CreativeDocumentIdSchema.parse(documentId));
    slug = await projectSlug(document.projectId);
  } catch (err) {
    return failure(err);
  }
  if (slug) revalidatePath(`/projects/${slug}/create`);
  redirect(slug ? `/projects/${slug}/create` : "/projects");
}

/** Galeria → canvas ou carrossel em branco no formato escolhido. */
export async function createBlankCanvasAction(form: FormData): Promise<void> {
  const { documentDeps } = await getAtlasRuntime();
  const projectId = ProjectIdSchema.parse(form.get("projectId"));
  const formatId = FormatIdSchema.parse(form.get("formatId"));
  const kind = form.get("kind");
  const { document } =
    kind === "carousel"
      ? await createBlankCarousel(documentDeps, projectId, { formatId, pages: z.coerce.number().int().min(1).max(20).catch(3).parse(form.get("pages")) })
      : kind === "motion"
        ? await createBlankMotion(documentDeps, projectId, { formatId })
        : await createBlankCanvas(documentDeps, projectId, { formatId });
  redirect(`/studio/${document.id}`);
}

/** Plano → carrossel editável (uma página por peça, mesmo formato). */
export async function planToCarouselAction(form: FormData): Promise<void> {
  const { documentDeps, repos } = await getAtlasRuntime();
  const formatRaw = form.get("formatId");
  const { document } = await materializePlanAsCarousel(
    { ...documentDeps, plans: repos.plans },
    CreativePlanIdSchema.parse(form.get("planId")),
    typeof formatRaw === "string" && formatRaw ? FormatIdSchema.parse(formatRaw) : undefined
  );
  redirect(`/studio/${document.id}`);
}

/** Editor rápido → salva o estado da composição e abre como canvas livre. */
export async function materializeInstanceAction(instanceId: string, patch: InstancePatch): Promise<StudioResult> {
  let documentId: string;
  try {
    const { compositionDeps, documentDeps } = await getAtlasRuntime();
    const id = CompositionInstanceIdSchema.parse(instanceId);
    await updateInstance(compositionDeps, id, PatchSchema.parse(patch));
    documentId = (await materializeInstance(documentDeps, id)).document.id;
  } catch (err) {
    return failure(err);
  }
  redirect(`/studio/${documentId}`);
}

export async function listRevisionsAction(documentId: string): Promise<{ ok: true; revisions: RevisionSummary[] } | { ok: false; error: string }> {
  try {
    const { repos } = await getAtlasRuntime();
    return { ok: true, revisions: await repos.documents.listRevisions(CreativeDocumentIdSchema.parse(documentId)) };
  } catch (err) {
    return failure(err);
  }
}

/** "Animar": canvas/carrossel → vídeo (páginas viram cenas animadas por presets). */
export async function animateDocumentAction(documentId: string): Promise<StudioResult> {
  let target: string;
  try {
    const { documentDeps } = await getAtlasRuntime();
    target = (await animateDocument(documentDeps, CreativeDocumentIdSchema.parse(documentId))).document.id;
  } catch (err) {
    return failure(err);
  }
  redirect(`/studio/${target}`);
}

/** Editor rápido → salva a composição e abre como vídeo de uma cena. */
export async function animateInstanceAction(instanceId: string, patch: InstancePatch): Promise<StudioResult> {
  let target: string;
  try {
    const { compositionDeps, documentDeps } = await getAtlasRuntime();
    const id = CompositionInstanceIdSchema.parse(instanceId);
    await updateInstance(compositionDeps, id, PatchSchema.parse(patch));
    target = (await animateInstance(documentDeps, id)).document.id;
  } catch (err) {
    return failure(err);
  }
  redirect(`/studio/${target}`);
}

/** "Website Scroll": página inteira rolando no navegador. */
export async function createWebsiteScrollAction(form: FormData): Promise<void> {
  const { documentDeps, repos } = await getAtlasRuntime();
  const assetId = form.get("assetId");
  const { document } = await createWebsiteScroll({ ...documentDeps, sources: repos.sources }, ProjectIdSchema.parse(form.get("projectId")), {
    assetId: typeof assetId === "string" ? assetId : "",
    formatId: FormatIdSchema.parse(form.get("formatId")),
  });
  redirect(`/studio/${document.id}`);
}

/** Vídeo por receita (VideoRecipe) no formato escolhido. */
export async function createVideoFromRecipeAction(form: FormData): Promise<void> {
  const { documentDeps, repos } = await getAtlasRuntime();
  const recipe = form.get("recipeId");
  const { document } = await createVideoFromRecipe({ ...documentDeps, sources: repos.sources }, ProjectIdSchema.parse(form.get("projectId")), {
    recipeId: typeof recipe === "string" ? recipe : "",
    formatId: FormatIdSchema.parse(form.get("formatId")),
  });
  redirect(`/studio/${document.id}`);
}

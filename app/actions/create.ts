"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { BindingSchema, CompositionInstanceIdSchema } from "@/src/core/creative/composition";
import { FormatIdSchema } from "@/src/core/creative/formats";
import { StyleModeSchema } from "@/src/core/creative/tokens";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { RasterFormatSchema } from "@/src/modules/render/render-job";
import { createInstance, deleteInstance, enqueueRender, updateInstance } from "@/src/modules/create/composition-service";
import { isDomainError } from "@/src/shared/errors";
import { ProjectIdSchema } from "@/src/shared/id";

export type CreateActionResult = { ok: true; jobId?: string; message?: string } | { ok: false; error: string };

function failure(err: unknown): { ok: false; error: string } {
  if (isDomainError(err)) return { ok: false, error: err.message };
  if (err instanceof z.ZodError) return { ok: false, error: "Dados inválidos." };
  console.error("[atlas:create]", err);
  return { ok: false, error: "Algo deu errado. Tente novamente." };
}

/** Alterações do inspetor rápido (validadas de novo no serviço). */
const PatchSchema = z.strictObject({
  name: z.string().max(120).optional(),
  formatId: FormatIdSchema.optional(),
  variant: z.string().min(1).max(40).optional(),
  styleMode: StyleModeSchema.optional(),
  bindings: z.record(z.string().min(1).max(40), BindingSchema).optional(),
  overrides: z.strictObject({ primary: z.string().regex(/^#[0-9a-f]{6}$/).optional() }).optional(),
  refreshProfile: z.boolean().optional(),
});
export type InstancePatch = z.infer<typeof PatchSchema>;

async function projectPath(projectId: string): Promise<string> {
  const { repos } = await getAtlasRuntime();
  const project = await repos.projects.getById(ProjectIdSchema.parse(projectId));
  return project ? `/projects/${project.slug}` : "/projects";
}

/** Galeria → nova instância com ligações automáticas → editor. */
export async function createInstanceAction(form: FormData): Promise<void> {
  const projectId = ProjectIdSchema.parse(form.get("projectId"));
  const compositionId = z.string().min(1).max(60).parse(form.get("compositionId"));
  const formatRaw = form.get("formatId");
  const { compositionDeps } = await getAtlasRuntime();
  const instance = await createInstance(compositionDeps, projectId, {
    compositionId,
    formatId: typeof formatRaw === "string" && formatRaw ? FormatIdSchema.parse(formatRaw) : undefined,
  });
  const base = await projectPath(projectId);
  revalidatePath(`${base}/create`);
  redirect(`${base}/create/${instance.id}`);
}

export async function saveInstanceAction(instanceId: string, patch: InstancePatch): Promise<CreateActionResult> {
  try {
    const { compositionDeps } = await getAtlasRuntime();
    const instance = await updateInstance(compositionDeps, CompositionInstanceIdSchema.parse(instanceId), PatchSchema.parse(patch));
    revalidatePath(`${await projectPath(instance.projectId)}/create`, "layout");
    return { ok: true, message: "Salvo." };
  } catch (err) {
    return failure(err);
  }
}

/** Salva o estado atual e enfileira o render — a peça sai exatamente como o preview. */
export async function renderInstanceAction(instanceId: string, patch: InstancePatch, formats: string[]): Promise<CreateActionResult> {
  try {
    const { compositionDeps } = await getAtlasRuntime();
    const id = CompositionInstanceIdSchema.parse(instanceId);
    await updateInstance(compositionDeps, id, PatchSchema.parse(patch));
    const job = await enqueueRender(compositionDeps, id, z.array(RasterFormatSchema).min(1).max(3).parse(formats));
    return { ok: true, jobId: job.id };
  } catch (err) {
    return failure(err);
  }
}

export async function deleteInstanceAction(instanceId: string): Promise<CreateActionResult> {
  let base: string;
  try {
    const { compositionDeps } = await getAtlasRuntime();
    const instance = await deleteInstance(compositionDeps, CompositionInstanceIdSchema.parse(instanceId));
    base = await projectPath(instance.projectId);
  } catch (err) {
    return failure(err);
  }
  revalidatePath(`${base}/create`);
  redirect(`${base}/create`);
}

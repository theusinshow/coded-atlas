"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CreativeGoalSchema, CreativePlanIdSchema } from "@/src/core/brain/plan";
import { FormatIdSchema } from "@/src/core/creative/formats";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { applyPlan, discardPlan, requestPlan } from "@/src/modules/brain/plan-service";
import { isDomainError } from "@/src/shared/errors";
import { ProjectIdSchema } from "@/src/shared/id";

export type BrainActionState = { error?: string; jobId?: string } | null;

function failure(err: unknown): { error: string } {
  if (isDomainError(err)) return { error: err.message };
  if (err instanceof z.ZodError) return { error: "Pedido inválido." };
  console.error("[atlas:brain]", err);
  return { error: "Algo deu errado. Tente novamente." };
}

const text = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === "string" ? v : "";
};

/** Pede um plano criativo (roda como job: com IA pode levar dezenas de segundos). */
export async function requestPlanAction(_prev: BrainActionState, form: FormData): Promise<BrainActionState> {
  try {
    const { brainDeps } = await getAtlasRuntime();
    const maxItems = Number(text(form, "maxItems"));
    const directionId = text(form, "directionId");
    const job = await requestPlan(brainDeps, ProjectIdSchema.parse(form.get("projectId")), {
      goal: CreativeGoalSchema.parse(form.get("goal")),
      notes: text(form, "notes"),
      formats: form.getAll("formats").map((f) => FormatIdSchema.parse(f)),
      ...(Number.isInteger(maxItems) && maxItems > 0 ? { maxItems } : {}),
      ...(directionId ? { directionId } : {}),
    });
    return { jobId: job.id };
  } catch (err) {
    return failure(err);
  }
}

/** Revisão: novo plano a partir do anterior + o que mudar. */
export async function revisePlanAction(_prev: BrainActionState, form: FormData): Promise<BrainActionState> {
  try {
    const { brainDeps, repos } = await getAtlasRuntime();
    const parent = await repos.plans.getById(CreativePlanIdSchema.parse(form.get("planId")));
    if (!parent) return { error: "Plano não encontrado." };
    const job = await requestPlan(brainDeps, parent.projectId, { ...parent.request, feedback: text(form, "feedback") }, parent.id);
    return { jobId: job.id };
  } catch (err) {
    return failure(err);
  }
}

async function slugOf(projectId: string): Promise<string> {
  const { repos } = await getAtlasRuntime();
  return (await repos.projects.getById(ProjectIdSchema.parse(projectId)))?.slug ?? "";
}

/** Aplicar = criar rascunhos em Criar. Todas as peças, ou só uma (`item`). */
export async function applyPlanAction(form: FormData): Promise<void> {
  const { brainDeps, compositionDeps } = await getAtlasRuntime();
  const planId = CreativePlanIdSchema.parse(form.get("planId"));
  const item = form.get("item");
  const plan = await applyPlan({ plans: brainDeps.plans, memory: brainDeps.memory, composition: compositionDeps }, planId, typeof item === "string" && item !== "" ? [z.coerce.number().int().min(0).parse(item)] : undefined);
  const slug = await slugOf(plan.projectId);
  revalidatePath(`/projects/${slug}/create`);
  revalidatePath(`/projects/${slug}/plans`);
  redirect(`/projects/${slug}/create`);
}

export async function discardPlanAction(form: FormData): Promise<void> {
  const { brainDeps } = await getAtlasRuntime();
  const plan = await discardPlan(brainDeps, CreativePlanIdSchema.parse(form.get("planId")));
  const slug = await slugOf(plan.projectId);
  revalidatePath(`/projects/${slug}/plans`);
  redirect(`/projects/${slug}/plans`);
}

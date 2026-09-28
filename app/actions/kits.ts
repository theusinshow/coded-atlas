"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { MediaKitIdSchema } from "@/src/core/kits/media-kit";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { deleteMediaKit, enqueueKitRender, generateMediaKit } from "@/src/modules/kits/kit-service";
import { isDomainError } from "@/src/shared/errors";
import { ProjectIdSchema } from "@/src/shared/id";

export type KitActionState = { error?: string; jobId?: string } | null;

function failure(err: unknown): { error: string } {
  if (isDomainError(err)) return { error: err.message };
  if (err instanceof z.ZodError) return { error: "Dados inválidos." };
  console.error("[atlas:kits]", err);
  return { error: "Algo deu errado. Tente novamente." };
}

async function slugOf(projectId: string): Promise<string> {
  const { repos } = await getAtlasRuntime();
  return (await repos.projects.getById(ProjectIdSchema.parse(projectId)))?.slug ?? "";
}

/** Gerar Media Kit: preset + direção → itens editáveis. */
export async function generateKitAction(_prev: KitActionState, form: FormData): Promise<KitActionState> {
  let target: string;
  try {
    const { kitDeps } = await getAtlasRuntime();
    const direction = form.get("directionId");
    const kit = await generateMediaKit(kitDeps, ProjectIdSchema.parse(form.get("projectId")), {
      presetId: z.string().min(1).max(40).parse(form.get("presetId")),
      directionId: typeof direction === "string" && direction ? direction : null,
    });
    target = `/projects/${await slugOf(kit.projectId)}/kits/${kit.id}`;
  } catch (err) {
    return failure(err);
  }
  revalidatePath(target.split("/kits/")[0] + "/kits");
  redirect(target);
}

export async function renderKitAction(_prev: KitActionState, form: FormData): Promise<KitActionState> {
  try {
    const { kitDeps } = await getAtlasRuntime();
    const job = await enqueueKitRender(kitDeps, MediaKitIdSchema.parse(form.get("kitId")), {
      image: form.get("image") === "jpg" ? "jpg" : "png",
      video: form.get("video") === "on",
      quality: form.get("quality") === "preview" ? "preview" : "final",
    });
    return { jobId: job.id };
  } catch (err) {
    return failure(err);
  }
}

export async function deleteKitAction(form: FormData): Promise<void> {
  const { kitDeps } = await getAtlasRuntime();
  const kit = await deleteMediaKit(kitDeps, MediaKitIdSchema.parse(form.get("kitId")));
  const slug = await slugOf(kit.projectId);
  revalidatePath(`/projects/${slug}/kits`);
  redirect(`/projects/${slug}/kits`);
}

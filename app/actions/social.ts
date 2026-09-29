"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { SocialPostIdSchema, SocialPostKindSchema, SocialPostStatusSchema } from "@/src/core/social/social-post";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { createPost, deletePost, movePost, setPostStatus, updatePost } from "@/src/modules/social/social-service";
import { isDomainError } from "@/src/shared/errors";

export type SocialActionState = { error?: string; message?: string; postId?: string } | null;

function failure(err: unknown): { error: string } {
  if (isDomainError(err)) return { error: err.message };
  if (err instanceof z.ZodError) return { error: "Dados inválidos." };
  console.error("[atlas:social]", err);
  return { error: "Algo deu errado. Tente novamente." };
}

const text = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === "string" ? v : undefined;
};

export async function createPostAction(_prev: SocialActionState, form: FormData): Promise<SocialActionState> {
  try {
    const { repos } = await getAtlasRuntime();
    const outputIds = form.getAll("outputId").filter((v): v is string => typeof v === "string");
    const post = await createPost(repos, { kind: SocialPostKindSchema.parse(form.get("kind")), outputIds });
    revalidatePath("/social");
    return { postId: post.id };
  } catch (err) {
    return failure(err);
  }
}

export async function updatePostAction(postId: string, _prev: SocialActionState, form: FormData): Promise<SocialActionState> {
  try {
    const { repos } = await getAtlasRuntime();
    await updatePost(repos, SocialPostIdSchema.parse(postId), {
      title: text(form, "title"),
      caption: text(form, "caption") ?? "",
      hashtags: text(form, "hashtags") ?? "",
      plannedFor: text(form, "plannedFor") ?? null,
    });
    revalidatePath("/social");
    return { message: "Salvo." };
  } catch (err) {
    return failure(err);
  }
}

export async function setPostStatusAction(postId: string, status: string): Promise<SocialActionState> {
  try {
    const { repos } = await getAtlasRuntime();
    await setPostStatus(repos, SocialPostIdSchema.parse(postId), SocialPostStatusSchema.parse(status));
    revalidatePath("/social");
    return { message: "Status atualizado." };
  } catch (err) {
    return failure(err);
  }
}

export async function movePostAction(postId: string, direction: "earlier" | "later"): Promise<SocialActionState> {
  try {
    const { repos } = await getAtlasRuntime();
    await movePost(repos, SocialPostIdSchema.parse(postId), z.enum(["earlier", "later"]).parse(direction));
    revalidatePath("/social");
    return null;
  } catch (err) {
    return failure(err);
  }
}

export async function deletePostAction(postId: string): Promise<SocialActionState> {
  try {
    const { repos } = await getAtlasRuntime();
    await deletePost(repos, SocialPostIdSchema.parse(postId));
    revalidatePath("/social");
    return { message: "Post excluído." };
  } catch (err) {
    return failure(err);
  }
}

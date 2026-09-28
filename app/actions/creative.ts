"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CreativePlanIdSchema } from "@/src/core/brain/plan";
import { CreativeDirectionIdSchema } from "@/src/core/creative/direction";
import { CreativeMemoryIdSchema, MemoryPolaritySchema, MemorySubjectSchema } from "@/src/core/creative/memory";
import { StyleModeSchema } from "@/src/core/creative/tokens";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { addMemory, createManualDirection, deleteDirection, removeMemory, reviseVisualProfile, saveDirectionFromPlan } from "@/src/modules/creative/creative-service";
import { isDomainError } from "@/src/shared/errors";
import { ProjectIdSchema } from "@/src/shared/id";

export type CreativeActionState = { error?: string; message?: string } | null;

function failure(err: unknown): { error: string } {
  if (isDomainError(err)) return { error: err.message };
  if (err instanceof z.ZodError) return { error: "Dados inválidos." };
  console.error("[atlas:creative]", err);
  return { error: "Algo deu errado. Tente novamente." };
}

const text = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === "string" ? v : "";
};

function revalidateAll() {
  revalidatePath("/settings");
  revalidatePath("/projects", "layout");
}

/** Memória criativa: sem projectId = workspace (Coded by M); com = projeto. */
export async function addMemoryAction(_prev: CreativeActionState, form: FormData): Promise<CreativeActionState> {
  try {
    const { creativeDeps } = await getAtlasRuntime();
    const projectRaw = text(form, "projectId");
    await addMemory(creativeDeps, {
      projectId: projectRaw ? ProjectIdSchema.parse(projectRaw) : null,
      polarity: MemoryPolaritySchema.parse(form.get("polarity")),
      subject: MemorySubjectSchema.parse(form.get("subject")),
      value: text(form, "value"),
    });
    revalidateAll();
    return { message: "Memória salva." };
  } catch (err) {
    return failure(err);
  }
}

export async function removeMemoryAction(form: FormData): Promise<void> {
  const { creativeDeps } = await getAtlasRuntime();
  await removeMemory(creativeDeps, CreativeMemoryIdSchema.parse(form.get("id")));
  revalidateAll();
}

export async function saveDirectionAction(_prev: CreativeActionState, form: FormData): Promise<CreativeActionState> {
  try {
    const { creativeDeps } = await getAtlasRuntime();
    const direction = await saveDirectionFromPlan(creativeDeps, CreativePlanIdSchema.parse(form.get("planId")), text(form, "name"));
    revalidateAll();
    return { message: `Direção "${direction.name}" salva — escolha-a ao pedir novos planos.` };
  } catch (err) {
    return failure(err);
  }
}

export async function createDirectionAction(_prev: CreativeActionState, form: FormData): Promise<CreativeActionState> {
  try {
    const { creativeDeps } = await getAtlasRuntime();
    const accent = text(form, "accent").trim().toLowerCase();
    await createManualDirection(creativeDeps, ProjectIdSchema.parse(form.get("projectId")), {
      name: text(form, "name"),
      tone: text(form, "tone"),
      emphasis: text(form, "emphasis"),
      styleMode: StyleModeSchema.parse(form.get("styleMode")),
      accent: form.get("useAccent") === "on" && /^#[0-9a-f]{6}$/.test(accent) ? accent : null,
      notes: text(form, "notes"),
    });
    revalidateAll();
    return { message: "Direção criada." };
  } catch (err) {
    return failure(err);
  }
}

export async function deleteDirectionAction(form: FormData): Promise<void> {
  const { creativeDeps } = await getAtlasRuntime();
  await deleteDirection(creativeDeps, CreativeDirectionIdSchema.parse(form.get("id")));
  revalidateAll();
}

/** Corrigir a identidade visual: cria uma revisão manual nova. */
export async function reviseIdentityAction(_prev: CreativeActionState, form: FormData): Promise<CreativeActionState> {
  try {
    const { creativeDeps } = await getAtlasRuntime();
    const split = (v: string) => v.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
    const profile = await reviseVisualProfile(creativeDeps, ProjectIdSchema.parse(form.get("projectId")), { palette: split(text(form, "palette")), fonts: split(text(form, "fonts")) });
    revalidateAll();
    return { message: `Identidade atualizada (revisão ${profile.revision}). Peças antigas continuam na revisão que usaram.` };
  } catch (err) {
    return failure(err);
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CAPTURE_PROFILES } from "@/src/core/assets/capture-plan";
import { getGoal, kitFiles } from "@/src/core/kits/goals";
import { MediaKitIdSchema } from "@/src/core/kits/media-kit";
import { ExportIdSchema } from "@/src/core/publish/export";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { generateMediaKit, removeKitItem, swapKitItemVisual } from "@/src/modules/kits/kit-service";
import { enqueueCapture } from "@/src/modules/projects/project-service";
import { requestPackage, revealExport } from "@/src/modules/publish/export-service";
import { isDomainError } from "@/src/shared/errors";
import { ProjectIdSchema } from "@/src/shared/id";

/**
 * Caminho guiado de um objetivo (Atlas 3.3): Material → Peças → Gerar → Pronto.
 * Só orquestra serviços que já existem; cada passo é um clique do Matheus.
 */
export type GoalActionState = { error?: string; jobId?: string; exportId?: string } | null;

function failure(err: unknown): { error: string } {
  if (isDomainError(err)) return { error: err.message };
  if (err instanceof z.ZodError) return { error: "Dados inválidos." };
  console.error("[atlas:goals]", err);
  return { error: "Algo deu errado. Tente novamente." };
}

async function goalPath(projectId: string, goalId: string): Promise<string> {
  const { repos } = await getAtlasRuntime();
  const project = await repos.projects.getById(ProjectIdSchema.parse(projectId));
  return `/projects/${project?.slug ?? ""}/fazer/${goalId}`;
}

/** "Montar as peças" / "Fazer outro conjunto": um kit novo do preset do objetivo. */
export async function buildGoalKitAction(projectId: string, goalId: string): Promise<GoalActionState> {
  const path = await goalPath(projectId, goalId);
  try {
    const goal = getGoal(goalId);
    if (!goal?.presetId) return { error: "Objetivo inválido." };
    const { kitDeps } = await getAtlasRuntime();
    await generateMediaKit(kitDeps, ProjectIdSchema.parse(projectId), { presetId: goal.presetId });
  } catch (err) {
    return failure(err);
  }
  revalidatePath(path);
  redirect(path);
}

/** "Capturar de novo": captura completa (com vídeo de rolagem) do endereço do site. */
export async function recaptureAction(projectId: string): Promise<GoalActionState> {
  try {
    const { projectDeps, repos } = await getAtlasRuntime();
    const id = ProjectIdSchema.parse(projectId);
    const source = (await repos.sources.listByProject(id)).find((s) => s.type === "url" || s.type === "local");
    if (!source) return { error: "Este projeto não tem endereço de site. Adicione um em Ajustes." };
    const job = await enqueueCapture(projectDeps, id, source.id, CAPTURE_PROFILES.complete);
    return { jobId: job.id };
  } catch (err) {
    return failure(err);
  }
}

export async function swapPieceAction(kitId: string, itemId: string): Promise<{ error?: string }> {
  try {
    const { kitDeps } = await getAtlasRuntime();
    await swapKitItemVisual(kitDeps, MediaKitIdSchema.parse(kitId), z.string().min(1).max(40).parse(itemId));
    revalidatePath(`/projects`, "layout");
    return {};
  } catch (err) {
    return failure(err);
  }
}

export async function removePieceAction(kitId: string, itemId: string): Promise<{ error?: string }> {
  try {
    const { kitDeps } = await getAtlasRuntime();
    await removeKitItem(kitDeps, MediaKitIdSchema.parse(kitId), z.string().min(1).max(40).parse(itemId));
    revalidatePath(`/projects`, "layout");
    return {};
  } catch (err) {
    return failure(err);
  }
}

/** "Salvar na pasta": os arquivos do último render do kit viram uma entrega na pasta de entregas. */
export async function saveKitToFolderAction(kitId: string): Promise<GoalActionState> {
  try {
    const { exportDeps, repos } = await getAtlasRuntime();
    const kit = await repos.kits.getById(MediaKitIdSchema.parse(kitId));
    if (!kit) return { error: "Conjunto de peças não encontrado." };
    const files = kitFiles(await repos.outputs.listByProject(kit.projectId), kit);
    if (files.length === 0) return { error: "Gere os arquivos antes de salvar." };
    const { record, job } = await requestPackage(exportDeps, { projectId: kit.projectId, outputIds: files.map((o) => o.id), destination: "folder", name: kit.name });
    return { jobId: job.id, exportId: record.id };
  } catch (err) {
    return failure(err);
  }
}

export async function revealExportAction(exportId: string): Promise<{ error?: string }> {
  try {
    const { exportDeps } = await getAtlasRuntime();
    await revealExport(exportDeps, ExportIdSchema.parse(exportId));
    return {};
  } catch (err) {
    return failure(err);
  }
}

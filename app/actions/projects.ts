"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { SourceTypeSchema } from "@/src/core/projects/source";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { ensureLegacyImportQueued } from "@/src/modules/import/legacy/legacy-import-job";
import { importUploads, UPLOADABLE_KINDS } from "@/src/modules/import/upload";
import {
  addSource,
  changeProjectStatus,
  createNewProject,
  deleteProjectPermanently,
  deleteUploadedAsset,
  enqueueCapture,
  removeSource,
  setProjectCover,
  updateProjectDetails,
} from "@/src/modules/projects/project-service";
import { CAPTURE_PROFILES, CapturePlanSchema } from "@/src/core/assets/capture-plan";
import { requestVisualDiff } from "@/src/modules/capture/visual-diff";
import { isDomainError } from "@/src/shared/errors";
import { AssetIdSchema, JobIdSchema, ProjectIdSchema, SourceIdSchema } from "@/src/shared/id";

/** Estado devolvido às telas por `useActionState`. */
export type ActionState = { error?: string; message?: string } | null;
/** Ações que enfileiram um job devolvem o ID para a tela acompanhar. */
export type JobActionState = { error?: string; message?: string; jobId?: string } | null;

function failure(err: unknown): { error: string } {
  if (isDomainError(err)) return { error: err.message };
  console.error("[atlas:action]", err);
  return { error: "Algo deu errado. Tente novamente." };
}

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : undefined;
};

export async function createProjectAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let slug: string;
  try {
    const { projectDeps } = await getAtlasRuntime();
    const { project } = await createNewProject(projectDeps, {
      name: text(form, "name") ?? "",
      category: text(form, "category") ?? "",
      client: text(form, "client"),
      description: text(form, "description"),
      url: text(form, "url"),
      captureNow: form.get("captureNow") === "on",
    });
    slug = project.slug;
  } catch (err) {
    return failure(err);
  }
  revalidatePath("/projects");
  redirect(`/projects/${slug}`);
}

export async function updateProjectAction(projectId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { projectDeps } = await getAtlasRuntime();
    const project = await updateProjectDetails(projectDeps, ProjectIdSchema.parse(projectId), {
      name: text(form, "name"),
      category: text(form, "category"),
      client: text(form, "client") ?? "",
      description: text(form, "description") ?? "",
    });
    revalidatePath(`/projects/${project.slug}`, "layout");
    revalidatePath("/projects");
    return { message: "Alterações salvas." };
  } catch (err) {
    return failure(err);
  }
}

export async function setProjectStatusAction(projectId: string, status: "active" | "archived"): Promise<ActionState> {
  try {
    const { projectDeps } = await getAtlasRuntime();
    const project = await changeProjectStatus(projectDeps, ProjectIdSchema.parse(projectId), z.enum(["active", "archived"]).parse(status));
    revalidatePath(`/projects/${project.slug}`, "layout");
    revalidatePath("/projects");
    return { message: status === "archived" ? "Projeto arquivado." : "Projeto restaurado." };
  } catch (err) {
    return failure(err);
  }
}

export async function deleteProjectAction(projectId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { projectDeps } = await getAtlasRuntime();
    await deleteProjectPermanently(projectDeps, ProjectIdSchema.parse(projectId), text(form, "confirmation") ?? "");
  } catch (err) {
    return failure(err);
  }
  revalidatePath("/projects");
  redirect("/projects");
}

export async function addSourceAction(projectId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { projectDeps } = await getAtlasRuntime();
    const id = ProjectIdSchema.parse(projectId);
    const source = await addSource(projectDeps, id, {
      type: SourceTypeSchema.parse(text(form, "type")),
      locator: text(form, "locator") ?? "",
      label: text(form, "label"),
    });
    const project = await projectDeps.projects.getById(id);
    revalidatePath(`/projects/${project?.slug}`, "layout");
    return { message: `Source adicionada: ${source.locator}` };
  } catch (err) {
    return failure(err);
  }
}

/** Diff visual entre duas capturas do projeto (job `diff`). */
export async function compareCapturesAction(_prev: JobActionState, form: FormData): Promise<JobActionState> {
  try {
    const { repos } = await getAtlasRuntime();
    const job = await requestVisualDiff(repos, AssetIdSchema.parse(form.get("beforeAssetId")), AssetIdSchema.parse(form.get("afterAssetId")));
    return { jobId: job.id };
  } catch (err) {
    if (err instanceof z.ZodError) return { error: "Escolha as duas capturas." };
    return failure(err);
  }
}

/** Remove a sessão autenticada de captura do projeto (as próximas capturas voltam a ser anônimas). */
export async function removeSessionAction(projectId: string): Promise<ActionState> {
  try {
    const { sessions, projectDeps } = await getAtlasRuntime();
    const id = ProjectIdSchema.parse(projectId);
    await sessions.remove(id);
    const project = await projectDeps.projects.getById(id);
    revalidatePath(`/projects/${project?.slug}/capture`);
    return { message: "Sessão removida." };
  } catch (err) {
    return failure(err);
  }
}

export async function removeSourceAction(projectId: string, sourceId: string): Promise<ActionState> {
  try {
    const { projectDeps } = await getAtlasRuntime();
    const id = ProjectIdSchema.parse(projectId);
    await removeSource(projectDeps, id, SourceIdSchema.parse(sourceId));
    const project = await projectDeps.projects.getById(id);
    revalidatePath(`/projects/${project?.slug}`, "layout");
    return { message: "Source removida." };
  } catch (err) {
    return failure(err);
  }
}

export async function captureSourceAction(projectId: string, sourceId: string): Promise<JobActionState> {
  try {
    const { projectDeps } = await getAtlasRuntime();
    const id = ProjectIdSchema.parse(projectId);
    const job = await enqueueCapture(projectDeps, id, SourceIdSchema.parse(sourceId));
    const project = await projectDeps.projects.getById(id);
    revalidatePath(`/projects/${project?.slug}`, "layout");
    revalidatePath("/jobs");
    return { message: "Captura enfileirada.", jobId: job.id };
  } catch (err) {
    return failure(err);
  }
}

/**
 * Captura com plano montado no formulário (perfil + ajustes finos).
 * Páginas: uma por linha. Estados: "Nome | seletor CSS" por linha.
 */
export async function captureWithPlanAction(projectId: string, _prev: JobActionState, form: FormData): Promise<JobActionState> {
  try {
    const { projectDeps } = await getAtlasRuntime();
    const id = ProjectIdSchema.parse(projectId);
    const profile = text(form, "profile") === "complete" ? CAPTURE_PROFILES.complete : CAPTURE_PROFILES.quick;
    const devices = (["desktop", "mobile"] as const).filter((d) => form.get(`device-${d}`) === "on");
    const lines = (name: string) =>
      (text(form, name) ?? "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    const states = lines("states").map((line) => {
      const [name, ...rest] = line.split("|");
      return { name: name.trim(), selector: rest.join("|").trim() };
    });
    const plan = CapturePlanSchema.parse({
      ...profile,
      devices: devices.length ? devices : profile.devices,
      fullPage: form.get("fullPage") === "on",
      sections: form.get("sections") === "on",
      video: form.get("video") === "on",
      pages: lines("pages"),
      states,
    });
    const job = await enqueueCapture(projectDeps, id, SourceIdSchema.parse(text(form, "sourceId")), plan);
    const project = await projectDeps.projects.getById(id);
    revalidatePath(`/projects/${project?.slug}`, "layout");
    revalidatePath("/jobs");
    return { message: "Captura enfileirada.", jobId: job.id };
  } catch (err) {
    if (err instanceof z.ZodError) return { error: "Plano inválido: confira devices, páginas (máx. 10) e estados no formato Nome | seletor." };
    return failure(err);
  }
}

export async function setCoverAction(projectId: string, assetId: string): Promise<ActionState> {
  try {
    const { projectDeps } = await getAtlasRuntime();
    const project = await setProjectCover(projectDeps, ProjectIdSchema.parse(projectId), AssetIdSchema.parse(assetId));
    revalidatePath(`/projects/${project.slug}`, "layout");
    revalidatePath("/projects");
    return { message: "Capa atualizada." };
  } catch (err) {
    return failure(err);
  }
}

export async function deleteAssetAction(projectId: string, assetId: string): Promise<ActionState> {
  let slug: string | undefined;
  try {
    const { projectDeps } = await getAtlasRuntime();
    const id = ProjectIdSchema.parse(projectId);
    slug = (await projectDeps.projects.getById(id))?.slug;
    await deleteUploadedAsset(projectDeps, id, AssetIdSchema.parse(assetId));
  } catch (err) {
    return failure(err);
  }
  revalidatePath(`/projects/${slug}`, "layout");
  redirect(`/projects/${slug}/assets`);
}

export async function uploadAssetsAction(projectId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { uploadDeps, projectDeps } = await getAtlasRuntime();
    const id = ProjectIdSchema.parse(projectId);
    const kind = z.enum(UPLOADABLE_KINDS).parse(text(form, "kind") ?? "image");
    const files = await Promise.all(
      form
        .getAll("files")
        .filter((f): f is File => typeof f !== "string" && f.size > 0)
        .map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))
    );
    const result = await importUploads(uploadDeps, id, files, kind);
    const project = await projectDeps.projects.getById(id);
    revalidatePath(`/projects/${project?.slug}`, "layout");
    const parts = [`${result.created.length} enviado(s)`];
    if (result.duplicates.length) parts.push(`${result.duplicates.length} já existia(m)`);
    if (result.rejected.length) parts.push(`recusado(s): ${result.rejected.map((r) => `${r.name} (${r.reason})`).join("; ")}`);
    return result.created.length === 0 && result.rejected.length > 0 ? { error: parts.join(" · ") } : { message: parts.join(" · ") };
  } catch (err) {
    return failure(err);
  }
}

export async function cancelJobAction(jobId: string): Promise<ActionState> {
  try {
    const { repos } = await getAtlasRuntime();
    await repos.jobs.requestCancel(JobIdSchema.parse(jobId));
    revalidatePath("/jobs");
    return { message: "Cancelamento pedido." };
  } catch (err) {
    return failure(err);
  }
}

export async function syncLegacyAction(): Promise<ActionState> {
  try {
    const { legacyImportDeps } = await getAtlasRuntime();
    const job = await ensureLegacyImportQueued(legacyImportDeps);
    revalidatePath("/settings");
    revalidatePath("/jobs");
    return { message: job ? "Sincronização enfileirada." : "A biblioteca v1 já está sincronizada." };
  } catch (err) {
    return failure(err);
  }
}

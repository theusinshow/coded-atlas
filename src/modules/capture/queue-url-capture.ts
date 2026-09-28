import { z } from "zod";
import { createJob, type Job } from "../../core/jobs/job";
import type { JobRepository } from "../../core/jobs/repository";
import { createProject, NewProjectInputSchema, type Project } from "../../core/projects/project";
import type { ProjectRepository, SourceRepository } from "../../core/projects/repositories";
import { createSource, isHttpUrl, type Source } from "../../core/projects/source";
import { parseOrThrow } from "../../shared/validation";
import type { CaptureJobPayload } from "./capture-job";

export const QueueUrlCaptureInputSchema = NewProjectInputSchema.extend({
  url: z.string().trim().refine(isHttpUrl, "URL http(s) inválida"),
});
export type QueueUrlCaptureInput = z.input<typeof QueueUrlCaptureInputSchema>;

export interface QueueUrlCaptureDeps {
  projects: ProjectRepository;
  sources: SourceRepository;
  jobs: JobRepository;
  /** Política de URL (2.1.G): lança se a URL não puder ser capturada no modo atual. */
  assertUrlAllowed?: (url: string) => Promise<void>;
}

/**
 * Caso de uso "capturar esta URL": cria (ou reaproveita, pelo slug) o projeto,
 * registra a Source URL (sem duplicar) e enfileira um job de captura.
 * Não captura nada — só persiste a intenção; o worker faz o trabalho.
 */
export async function queueUrlCapture(
  deps: QueueUrlCaptureDeps,
  input: QueueUrlCaptureInput
): Promise<{ project: Project; source: Source; job: Job }> {
  const data = parseOrThrow(QueueUrlCaptureInputSchema, input, "Pedido de captura");
  await deps.assertUrlAllowed?.(data.url);

  const project =
    (await deps.projects.getBySlug(data.slug)) ??
    (await deps.projects.create(
      createProject({ slug: data.slug, name: data.name, category: data.category, client: data.client })
    ));

  const existing = (await deps.sources.listByProject(project.id)).find(
    (s) => s.type === "url" && s.locator === data.url
  );
  const source =
    existing ?? (await deps.sources.create(createSource({ projectId: project.id, type: "url", locator: data.url })));

  const payload: CaptureJobPayload = { sourceId: source.id };
  const job = await deps.jobs.create(createJob({ type: "capture", projectId: project.id, payload }));
  return { project, source, job };
}

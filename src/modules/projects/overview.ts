import type { Asset, AssetKind } from "../../core/assets/asset";
import type { AssetRepository, OutputRepository } from "../../core/assets/repositories";
import type { Job } from "../../core/jobs/job";
import type { JobRepository } from "../../core/jobs/repository";
import type { Project } from "../../core/projects/project";
import type { ProjectRepository, SourceRepository } from "../../core/projects/repositories";
import type { Source } from "../../core/projects/source";
import { requireProjectBySlug } from "./project-service";

export interface ProjectReadiness {
  desktop: boolean;
  mobile: boolean;
  fullpage: boolean;
  sections: number;
  uploads: number;
  /** 0–100: quanto material existe para criar mídia. */
  score: number;
  missing: string[];
}

export interface ProjectOverview {
  project: Project;
  sources: Source[];
  cover: Asset | null;
  assetCounts: Partial<Record<AssetKind, number>>;
  totalAssets: number;
  outputs: number;
  recentJobs: Job[];
  readiness: ProjectReadiness;
  recommendations: string[];
}

/**
 * Responde as perguntas da tela Overview (docs/UX-ARCHITECTURE.md): o que é o
 * projeto, que origens tem, quanto material existe, se está pronto para criar
 * mídia e o que o Atlas recomenda fazer agora. Determinístico.
 */
export async function getProjectOverview(
  deps: { projects: ProjectRepository; sources: SourceRepository; assets: AssetRepository; outputs: OutputRepository; jobs: JobRepository },
  slug: string
): Promise<ProjectOverview> {
  const project = await requireProjectBySlug(deps.projects, slug);
  const [sources, assets, outputs, recentJobs] = await Promise.all([
    deps.sources.listByProject(project.id),
    deps.assets.listByProject(project.id),
    deps.outputs.listByProject(project.id),
    deps.jobs.listRecent({ projectId: project.id, limit: 5 }),
  ]);

  const assetCounts: Partial<Record<AssetKind, number>> = {};
  for (const a of assets) assetCounts[a.kind] = (assetCounts[a.kind] ?? 0) + 1;

  const has = (role: string, device?: string) => assets.some((a) => a.metadata.role === role && (!device || a.metadata.device === device));
  const readiness: ProjectReadiness = {
    desktop: has("viewport", "desktop"),
    mobile: has("viewport", "mobile"),
    fullpage: has("fullpage"),
    sections: assets.filter((a) => a.kind === "section").length,
    uploads: assets.filter((a) => a.metadata.origin === "upload").length,
    score: 0,
    missing: [],
  };
  if (!readiness.desktop) readiness.missing.push("screenshot desktop");
  if (!readiness.mobile) readiness.missing.push("screenshot mobile");
  if (!readiness.fullpage) readiness.missing.push("página inteira");
  if (readiness.sections === 0) readiness.missing.push("seções");
  readiness.score = Math.round(
    (Number(readiness.desktop) * 35 + Number(readiness.mobile) * 25 + Number(readiness.fullpage) * 15 + Math.min(readiness.sections, 5) * 5)
  );

  const recommendations: string[] = [];
  const capturable = sources.some((s) => s.type === "url" || s.type === "local");
  if (!capturable) recommendations.push("Adicione a URL do site (ou do servidor de desenvolvimento) para capturar.");
  else if (assets.length === 0) recommendations.push("Capture o site para gerar a matéria-prima do projeto.");
  else if (readiness.missing.length > 0) recommendations.push(`Complete a captura: falta ${readiness.missing.join(", ")}.`);
  if (readiness.score >= 60) recommendations.push("Material suficiente para criar peças: posts, stories e um hero de portfólio.");

  return {
    project,
    sources,
    cover: assets.find((a) => a.id === project.coverAssetId) ?? null,
    assetCounts,
    totalAssets: assets.length,
    outputs: outputs.length,
    recentJobs,
    readiness,
    recommendations,
  };
}

import { z } from "zod";
import type { Output } from "../assets/output";
import { safeFileBase } from "../assets/file-names";
import type { VisualProfile } from "../creative/visual-profile";
import type { Project } from "../projects/project";
import { ProjectIdSchema, UlidSchema, newId } from "../../shared/id";
import { Sha256Schema, TimestampSchema, nowIso, parseOrThrow } from "../../shared/validation";
import { StorageKeySchema } from "../assets/storage-key";

/**
 * Export (docs/DOMAIN-MODEL.md → Export): preparação e entrega de Outputs a um
 * destino. Stateful. Nunca autônomo: toda entrega nasce de uma ação explícita do
 * Matheus (docs/AI-GUARDRAILS.md → User approval).
 */
export const ExportKindSchema = z.enum(["package", "portfolio"]);
export const ExportDestinationSchema = z.enum(["download", "folder", "github"]);
export type ExportDestination = z.infer<typeof ExportDestinationSchema>;

export const ExportIdSchema = UlidSchema.brand<"ExportId">();
export type ExportId = z.infer<typeof ExportIdSchema>;

export const ExportSchema = z.strictObject({
  id: ExportIdSchema,
  /** null = portfólio de vários projetos. */
  projectId: ProjectIdSchema.nullable(),
  kind: ExportKindSchema,
  name: z.string().trim().min(1).max(120),
  destination: ExportDestinationSchema,
  outputIds: z.array(z.string().max(40)).max(500),
  status: z.enum(["queued", "running", "delivered", "failed"]),
  /** Onde foi parar: arquivo ZIP no storage (download), pasta relativa (folder) ou commit (github). */
  result: z.strictObject({
    archive: z.strictObject({ storageKey: StorageKeySchema, sha256: Sha256Schema, byteSize: z.number().int().nonnegative() }).optional(),
    folder: z.string().max(300).optional(),
    commitUrl: z.string().max(500).optional(),
    files: z.number().int().nonnegative().optional(),
    error: z.string().max(500).optional(),
  }),
  jobId: z.string().max(40).nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type ExportRecord = z.infer<typeof ExportSchema>;

export function createExport(input: Pick<ExportRecord, "projectId" | "kind" | "name" | "destination" | "outputIds">): ExportRecord {
  const now = nowIso();
  return parseOrThrow(ExportSchema, { ...input, id: newId(), status: "queued", result: {}, jobId: null, createdAt: now, updatedAt: now }, "Exportação");
}

export interface ExportRepository {
  create(record: ExportRecord): Promise<ExportRecord>;
  getById(id: ExportId): Promise<ExportRecord | null>;
  listByProject(projectId: z.infer<typeof ProjectIdSchema> | null): Promise<ExportRecord[]>;
  listRecent(limit: number): Promise<ExportRecord[]>;
  update(record: ExportRecord): Promise<ExportRecord>;
}

// ── Estrutura do pacote (pura) ──────────────────────────────────────────────

const FOLDER: Record<string, string> = { png: "imagens", jpg: "imagens", webp: "imagens", mp4: "videos", webm: "videos", pdf: "documentos", pptx: "documentos", zip: "web" };

/** Caminho de cada Output dentro do pacote: pasta por tipo + nome legível e único. */
export function packagePaths(outputs: readonly Pick<Output, "id" | "format" | "label" | "metadata">[], prefix = ""): Map<string, string> {
  const used = new Set<string>();
  const paths = new Map<string, string>();
  for (const o of outputs) {
    const folder = FOLDER[o.format] ?? "outros";
    const base = safeFileBase(o.label, o.id, 70);
    let name = `${prefix}${folder}/${base}.${o.format}`;
    if (used.has(name)) name = `${prefix}${folder}/${base}-${o.id.slice(-6).toLowerCase()}.${o.format}`;
    used.add(name);
    paths.set(o.id, name);
  }
  return paths;
}

export interface PackageManifest {
  generator: "Coded Atlas";
  version: 2;
  createdAt: string;
  project: { slug: string; name: string; category: string; client: string | null; url: string | null };
  files: { path: string; format: string; label: string | null; width: number | null; height: number | null; durationMs: number | null; sha256: string }[];
}

export function buildPackageManifest(
  project: Pick<Project, "slug" | "name" | "category" | "client">,
  url: string | null,
  outputs: readonly Output[],
  paths: ReadonlyMap<string, string>
): PackageManifest {
  return {
    generator: "Coded Atlas",
    version: 2,
    createdAt: nowIso(),
    project: { slug: project.slug, name: project.name, category: project.category, client: project.client, url },
    files: outputs.map((o) => ({ path: paths.get(o.id) ?? o.id, format: o.format, label: o.label, width: o.width, height: o.height, durationMs: o.durationMs, sha256: o.sha256 })),
  };
}

/**
 * Entrada do portfólio: os MESMOS campos do manifesto do v1 (lib/capture/
 * build-portfolio-manifest.ts — consumido por /cases/[slug] e pela Paisagem
 * Digital), agora com caminhos do pacote, peças escolhidas e o case web.
 */
export interface PortfolioEntry {
  slug: string;
  name: string;
  category: string;
  description?: string;
  url: string | null;
  thumbnail: string | null;
  thumbnailMobile: string | null;
  cover?: string;
  accent?: string;
  palette: string[];
  techStack: string[];
  hasVideo: boolean;
  date: string;
  atlasVersion: string;
  pieces: { path: string; format: string; label: string | null; width: number | null; height: number | null }[];
  case?: string;
}

export function buildPortfolioEntry(input: {
  project: Pick<Project, "slug" | "name" | "category" | "description" | "updatedAt">;
  url: string | null;
  profile: Pick<VisualProfile, "palette" | "techStack"> | null;
  outputs: readonly Output[];
  paths: ReadonlyMap<string, string>;
  cover: string | null;
  thumbnail: string | null;
  thumbnailMobile: string | null;
}): PortfolioEntry {
  const images = input.outputs.filter((o) => o.mimeType.startsWith("image/"));
  const web = input.outputs.find((o) => o.format === "zip" && o.metadata.caseModule === "web");
  const palette = input.profile?.palette ?? [];
  return {
    slug: input.project.slug,
    name: input.project.name,
    category: input.project.category,
    ...(input.project.description ? { description: input.project.description } : {}),
    url: input.url,
    thumbnail: input.thumbnail,
    thumbnailMobile: input.thumbnailMobile,
    ...(input.cover ? { cover: input.cover } : {}),
    ...(palette[0] ? { accent: palette.find((c, i) => i > 0) ?? palette[0] } : {}),
    palette,
    techStack: input.profile?.techStack ?? [],
    hasVideo: input.outputs.some((o) => o.mimeType.startsWith("video/")),
    date: input.project.updatedAt.slice(0, 10),
    atlasVersion: "2",
    pieces: images.concat(input.outputs.filter((o) => o.mimeType.startsWith("video/"))).map((o) => ({ path: input.paths.get(o.id) ?? o.id, format: o.format, label: o.label, width: o.width, height: o.height })),
    ...(web ? { case: input.paths.get(web.id) } : {}),
  };
}

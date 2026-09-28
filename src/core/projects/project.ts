import { z } from "zod";
import { newId, ProjectIdSchema, AssetIdSchema } from "../../shared/id";
import { DomainError } from "../../shared/errors";
import { TimestampSchema, nowIso, parseOrThrow } from "../../shared/validation";

/**
 * Slug: rótulo legível e estável para URLs (`/projects/[slug]`). Mesmo formato
 * aceito pelo Atlas v1 (lib/validation/validate-project-input.ts), para que os
 * projetos legados mapeiem 1:1. Nunca é identidade — o ID é o ULID.
 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SlugSchema = z.string().max(80).regex(SLUG_PATTERN, "slug: minúsculas, números e hífens");
export type Slug = z.infer<typeof SlugSchema>;

export const ProjectStatusSchema = z.enum(["active", "archived"]);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

/** De onde o projeto veio: criado no Atlas 2.x ou importado da biblioteca v1. */
export const ProjectOriginSchema = z.enum(["atlas", "legacy"]);
export type ProjectOrigin = z.infer<typeof ProjectOriginSchema>;

export const PROJECT_SCHEMA_VERSION = 1;

export const ProjectSchema = z.strictObject({
  id: ProjectIdSchema,
  slug: SlugSchema,
  name: z.string().trim().min(1).max(200),
  client: z.string().trim().min(1).max(200).nullable(),
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(2000).nullable(),
  status: ProjectStatusSchema,
  origin: ProjectOriginSchema,
  coverAssetId: AssetIdSchema.nullable(),
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type Project = z.infer<typeof ProjectSchema>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const NewProjectInputSchema = z.strictObject({
  slug: SlugSchema,
  name: ProjectSchema.shape.name,
  category: ProjectSchema.shape.category,
  client: optionalText(200),
  description: optionalText(2000),
  origin: ProjectOriginSchema.optional(),
});
export type NewProjectInput = z.input<typeof NewProjectInputSchema>;

/** Cria um Project novo e válido (ID e timestamps gerados aqui). */
export function createProject(input: NewProjectInput): Project {
  const data = parseOrThrow(NewProjectInputSchema, input, "Projeto");
  const now = nowIso();
  return parseOrThrow(
    ProjectSchema,
    {
      id: newId(),
      slug: data.slug,
      name: data.name,
      client: data.client ?? null,
      category: data.category,
      description: data.description ?? null,
      status: "active",
      origin: data.origin ?? "atlas",
      coverAssetId: null,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
    },
    "Projeto"
  );
}

export const ProjectPatchSchema = z.strictObject({
  name: ProjectSchema.shape.name.optional(),
  category: ProjectSchema.shape.category.optional(),
  client: optionalText(200),
  description: optionalText(2000),
});
export type ProjectPatch = z.input<typeof ProjectPatchSchema>;

/** Edição de metadados (slug e origem não mudam por aqui). Campos vazios limpam o valor. */
export function editProject(project: Project, patch: ProjectPatch): Project {
  const data = parseOrThrow(ProjectPatchSchema, patch, "Edição de projeto");
  return parseOrThrow(
    ProjectSchema,
    {
      ...project,
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.category !== undefined ? { category: data.category } : {}),
      ...("client" in patch ? { client: data.client ?? null } : {}),
      ...("description" in patch ? { description: data.description ?? null } : {}),
    },
    "Projeto"
  );
}

/** Ciclo de vida: arquivar esconde da biblioteca sem apagar nada. */
export function setProjectStatus(project: Project, status: ProjectStatus): Project {
  if (project.status === status) {
    throw new DomainError("INVALID_TRANSITION", `Projeto já está ${status === "archived" ? "arquivado" : "ativo"}.`);
  }
  return { ...project, status };
}

/** Texto normalizado para busca: minúsculas, sem acentos, campos pesquisáveis juntos. */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function projectSearchText(project: Pick<Project, "name" | "slug" | "client" | "category" | "description">): string {
  return normalizeSearch([project.name, project.slug, project.client, project.category, project.description].filter(Boolean).join(" "));
}

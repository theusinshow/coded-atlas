import { z } from "zod";
import { newId, ProjectIdSchema, AssetIdSchema } from "../../shared/id";
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

export const PROJECT_SCHEMA_VERSION = 1;

export const ProjectSchema = z.strictObject({
  id: ProjectIdSchema,
  slug: SlugSchema,
  name: z.string().trim().min(1).max(200),
  client: z.string().trim().min(1).max(200).nullable(),
  category: z.string().trim().min(1).max(80),
  status: ProjectStatusSchema,
  coverAssetId: AssetIdSchema.nullable(),
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type Project = z.infer<typeof ProjectSchema>;

export const NewProjectInputSchema = z.strictObject({
  slug: SlugSchema,
  name: ProjectSchema.shape.name,
  category: ProjectSchema.shape.category,
  client: ProjectSchema.shape.client.optional(),
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
      status: "active",
      coverAssetId: null,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
    },
    "Projeto"
  );
}

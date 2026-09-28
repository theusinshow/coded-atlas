import { z } from "zod";
import { newId, ProjectIdSchema, SourceIdSchema, type ProjectId } from "../../shared/id";
import { TimestampSchema, nowIso, parseOrThrow } from "../../shared/validation";

/**
 * Source: origem do material de um projeto. Um projeto pode ter várias.
 * - url: site publicado; local: servidor de desenvolvimento (http://localhost:3000),
 *   nunca um caminho de disco; github: "owner/repo" (base para leitura futura);
 *   upload: arquivos enviados manualmente.
 */
export const SourceTypeSchema = z.enum(["url", "github", "local", "upload"]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

export const SourceSchema = z
  .strictObject({
    id: SourceIdSchema,
    projectId: ProjectIdSchema,
    type: SourceTypeSchema,
    // O que identifica a origem: URL, "owner/repo", etc. Nunca um caminho absoluto
    // da máquina persistido como identidade.
    locator: z.string().trim().min(1).max(2048),
    label: z.string().trim().min(1).max(200).nullable(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .refine((s) => (s.type !== "url" && s.type !== "local") || isHttpUrl(s.locator), {
    message: "Sources url/local exigem URL http(s) válida (local = servidor de desenvolvimento)",
    path: ["locator"],
  });
export type Source = z.infer<typeof SourceSchema>;

export interface NewSourceInput {
  projectId: ProjectId;
  type: SourceType;
  locator: string;
  label?: string | null;
}

export function createSource(input: NewSourceInput): Source {
  const now = nowIso();
  return parseOrThrow(
    SourceSchema,
    {
      id: newId(),
      projectId: input.projectId,
      type: input.type,
      locator: input.locator,
      label: input.label ?? null,
      createdAt: now,
      updatedAt: now,
    },
    "Source"
  );
}

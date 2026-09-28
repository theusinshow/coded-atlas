import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, uniqueIndex, primaryKey, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import type { CaptureParams } from "../../core/assets/capture";
import type { JobError } from "../../core/jobs/job";

/**
 * Schema SQLite da fundação (docs/DATABASE.md — só as tabelas da fase ativa).
 * Colunas normais para identidade, FKs, status, timestamps e filtros; JSON só
 * para estruturas aninhadas — e todo JSON é revalidado com Zod ao ser lido.
 * Timestamps: TEXT ISO-8601 UTC. Nada de BLOB de mídia: bytes ficam no AssetStorage.
 *
 * Nomes de campo = nomes do domínio, para que a linha lida seja validada
 * diretamente pelo schema Zod da entidade.
 */

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    client: text("client"),
    category: text("category").notNull(),
    description: text("description"),
    status: text("status").notNull(),
    origin: text("origin").notNull().default("atlas"),
    coverAssetId: text("cover_asset_id"), // sem FK: assets referenciam projects (evita ciclo)
    // Derivado (nome, slug, cliente, categoria, descrição normalizados) — só para busca.
    searchText: text("search_text").notNull().default(""),
    schemaVersion: integer("schema_version").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("projects_slug_unique").on(t.slug), index("projects_status_idx").on(t.status)]
);

export const sources = sqliteTable(
  "sources",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    locator: text("locator").notNull(),
    label: text("label"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("sources_project_idx").on(t.projectId)]
);

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    status: text("status").notNull(),
    destructive: integer("destructive", { mode: "boolean" }).notNull().default(false),
    progress: integer("progress").notNull(),
    message: text("message"),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    result: text("result", { mode: "json" }).$type<Record<string, unknown>>(),
    error: text("error", { mode: "json" }).$type<JobError>(),
    attempts: integer("attempts").notNull(),
    cancelRequestedAt: text("cancel_requested_at"),
    lockedBy: text("locked_by"),
    lockedAt: text("locked_at"),
    heartbeatAt: text("heartbeat_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
  },
  (t) => [
    index("jobs_status_idx").on(t.status, t.createdAt),
    index("jobs_project_idx").on(t.projectId),
    // Rede de segurança do banco: no máximo um job destrutivo ativo por projeto,
    // mesmo que dois processos tentem ao mesmo tempo.
    uniqueIndex("jobs_one_active_destructive_per_project")
      .on(t.projectId)
      .where(sql`${t.destructive} = 1 AND ${t.status} IN ('preparing', 'running')`),
  ]
);

export const captures = sqliteTable(
  "captures",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    status: text("status").notNull(),
    params: text("params", { mode: "json" }).$type<CaptureParams>().notNull(),
    error: text("error", { mode: "json" }).$type<{ code: string; message: string }>(),
    createdAt: text("created_at").notNull(),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
  },
  (t) => [index("captures_project_idx").on(t.projectId)]
);

export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    storageKey: text("storage_key").notNull(),
    sha256: text("sha256").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width"),
    height: integer("height"),
    parentAssetId: text("parent_asset_id").references((): AnySQLiteColumn => assets.id, {
      onDelete: "set null",
    }),
    captureId: text("capture_id").references(() => captures.id, { onDelete: "set null" }),
    label: text("label"),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("assets_project_idx").on(t.projectId),
    index("assets_sha256_idx").on(t.projectId, t.sha256),
    index("assets_capture_idx").on(t.captureId),
  ]
);

export const assetRelations = sqliteTable(
  "asset_relations",
  {
    fromAssetId: text("from_asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    toAssetId: text("to_asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.fromAssetId, t.toAssetId, t.type] }), index("asset_relations_to_idx").on(t.toAssetId)]
);

export const outputs = sqliteTable(
  "outputs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
    format: text("format").notNull(),
    mimeType: text("mime_type").notNull(),
    storageKey: text("storage_key").notNull(),
    sha256: text("sha256").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    sourceAssetIds: text("source_asset_ids", { mode: "json" }).$type<string[]>().notNull(),
    label: text("label"),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("outputs_project_idx").on(t.projectId)]
);

/**
 * Registro da importação da biblioteca v1 (um por pasta/slug). Torna a
 * importação idempotente, lembra projetos que o usuário dispensou e detecta
 * recapturas feitas no v1 depois da importação (catalog_created_at mudou).
 */
export const legacyImports = sqliteTable("legacy_imports", {
  slug: text("slug").primaryKey(),
  projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
  status: text("status").notNull(), // imported | dismissed | failed
  catalogCreatedAt: text("catalog_created_at"),
  error: text("error"),
  importedAt: text("imported_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** VisualProfile: revisões append-only da identidade visual de um projeto. */
export const visualProfiles = sqliteTable(
  "visual_profiles",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    palette: text("palette", { mode: "json" }).$type<string[]>().notNull(),
    fonts: text("fonts", { mode: "json" }).$type<string[]>().notNull(),
    techStack: text("tech_stack", { mode: "json" }).$type<string[]>().notNull(),
    traits: text("traits", { mode: "json" }).$type<string[]>().notNull(),
    ogImageUrl: text("og_image_url"),
    logoAssetId: text("logo_asset_id").references(() => assets.id, { onDelete: "set null" }),
    source: text("source").notNull(),
    captureId: text("capture_id").references(() => captures.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("visual_profiles_project_revision").on(t.projectId, t.revision)]
);

/** CompositionInstance: receita curada ligada ao material de um projeto (2.4). */
export const compositionInstances = sqliteTable(
  "composition_instances",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    compositionId: text("composition_id").notNull(),
    compositionVersion: integer("composition_version").notNull(),
    variant: text("variant").notNull(),
    formatId: text("format_id").notNull(),
    styleMode: text("style_mode").notNull(),
    bindings: text("bindings", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    overrides: text("overrides", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    visualProfileRevision: integer("visual_profile_revision"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("composition_instances_project_idx").on(t.projectId)]
);

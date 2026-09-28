import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import {
  normalizeSearch,
  projectSearchText,
  ProjectSchema,
  type Project,
  type Slug,
} from "../../../core/projects/project";
import type { ProjectQuery, ProjectRepository } from "../../../core/projects/repositories";
import { DomainError } from "../../../shared/errors";
import type { ProjectId } from "../../../shared/id";
import { nowIso, parseOrThrow } from "../../../shared/validation";
import type { AtlasDb } from "../client";
import { projects } from "../schema";
import { run, toDomain } from "./support";

type ProjectRow = typeof projects.$inferSelect;

/** `search_text` é derivado e só existe no banco; a entidade não o carrega. */
function fromRow(row: ProjectRow): Project {
  const { searchText: _derived, ...entity } = row;
  void _derived;
  return toDomain(ProjectSchema, entity, "Projeto");
}

export class SqliteProjectRepository implements ProjectRepository {
  constructor(private readonly db: AtlasDb) {}

  async create(project: Project): Promise<Project> {
    const value = parseOrThrow(ProjectSchema, project, "Projeto");
    run("Projeto", () =>
      this.db
        .insert(projects)
        .values({ ...value, searchText: projectSearchText(value) })
        .run()
    );
    return value;
  }

  async getById(id: ProjectId): Promise<Project | null> {
    const row = run("Projeto", () => this.db.select().from(projects).where(eq(projects.id, id)).get());
    return row ? fromRow(row) : null;
  }

  async getBySlug(slug: Slug): Promise<Project | null> {
    const row = run("Projeto", () => this.db.select().from(projects).where(eq(projects.slug, slug)).get());
    return row ? fromRow(row) : null;
  }

  async list(options: { includeArchived?: boolean } = {}): Promise<Project[]> {
    return this.search({ status: options.includeArchived ? "all" : "active" });
  }

  async search(query: ProjectQuery = {}): Promise<Project[]> {
    const conditions: SQL[] = [];
    const status = query.status ?? "active";
    if (status !== "all") conditions.push(eq(projects.status, status));
    if (query.category) conditions.push(eq(projects.category, query.category));
    if (query.origin) conditions.push(eq(projects.origin, query.origin));
    for (const term of normalizeSearch(query.text ?? "").split(" ").filter(Boolean)) {
      // Escapa curingas do LIKE: a busca é por texto literal.
      const pattern = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      conditions.push(sql`${projects.searchText} LIKE ${pattern} ESCAPE '\\'`);
    }
    const order =
      query.sort === "name"
        ? [asc(sql`${projects.name} COLLATE NOCASE`), asc(projects.id)]
        : query.sort === "updated"
          ? [desc(projects.updatedAt), asc(projects.id)]
          : [desc(projects.createdAt), asc(projects.id)];
    const rows = run("Projeto", () =>
      this.db
        .select()
        .from(projects)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(...order)
        .all()
    );
    return rows.map(fromRow);
  }

  async categories(): Promise<string[]> {
    const rows = run("Projeto", () =>
      this.db.selectDistinct({ category: projects.category }).from(projects).orderBy(asc(projects.category)).all()
    );
    return rows.map((r) => r.category);
  }

  async update(project: Project): Promise<Project> {
    const value = parseOrThrow(ProjectSchema, { ...project, updatedAt: nowIso() }, "Projeto");
    // id e createdAt nunca mudam (drizzle ignora chaves undefined no SET).
    const result = run("Projeto", () =>
      this.db
        .update(projects)
        .set({ ...value, id: undefined, createdAt: undefined, searchText: projectSearchText(value) })
        .where(eq(projects.id, value.id))
        .run()
    );
    if (result.changes === 0) throw new DomainError("NOT_FOUND", `Projeto ${value.id} não existe.`, { id: value.id });
    const stored = await this.getById(value.id);
    if (!stored) throw new DomainError("NOT_FOUND", `Projeto ${value.id} não existe.`, { id: value.id });
    return stored;
  }

  async delete(id: ProjectId): Promise<void> {
    // Sources, captures, assets, jobs e outputs caem em cascata (FKs).
    const result = run("Projeto", () => this.db.delete(projects).where(eq(projects.id, id)).run());
    if (result.changes === 0) throw new DomainError("NOT_FOUND", `Projeto ${id} não existe.`, { id });
  }
}

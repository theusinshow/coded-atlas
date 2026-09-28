import { asc, desc, eq } from "drizzle-orm";
import { ProjectSchema, type Project, type Slug } from "../../../core/projects/project";
import type { ProjectRepository } from "../../../core/projects/repositories";
import { DomainError } from "../../../shared/errors";
import type { ProjectId } from "../../../shared/id";
import { nowIso, parseOrThrow } from "../../../shared/validation";
import type { AtlasDb } from "../client";
import { projects } from "../schema";
import { run, toDomain } from "./support";

export class SqliteProjectRepository implements ProjectRepository {
  constructor(private readonly db: AtlasDb) {}

  async create(project: Project): Promise<Project> {
    const value = parseOrThrow(ProjectSchema, project, "Projeto");
    run("Projeto", () => this.db.insert(projects).values(value).run());
    return value;
  }

  async getById(id: ProjectId): Promise<Project | null> {
    const row = run("Projeto", () => this.db.select().from(projects).where(eq(projects.id, id)).get());
    return row ? toDomain(ProjectSchema, row, "Projeto") : null;
  }

  async getBySlug(slug: Slug): Promise<Project | null> {
    const row = run("Projeto", () => this.db.select().from(projects).where(eq(projects.slug, slug)).get());
    return row ? toDomain(ProjectSchema, row, "Projeto") : null;
  }

  async list(options: { includeArchived?: boolean } = {}): Promise<Project[]> {
    const rows = run("Projeto", () => {
      const query = this.db.select().from(projects);
      return (options.includeArchived ? query : query.where(eq(projects.status, "active")))
        .orderBy(desc(projects.createdAt), asc(projects.id))
        .all();
    });
    return rows.map((row) => toDomain(ProjectSchema, row, "Projeto"));
  }

  async update(project: Project): Promise<Project> {
    const value = parseOrThrow(ProjectSchema, { ...project, updatedAt: nowIso() }, "Projeto");
    // id e createdAt nunca mudam (drizzle ignora chaves undefined no SET).
    const result = run("Projeto", () =>
      this.db
        .update(projects)
        .set({ ...value, id: undefined, createdAt: undefined })
        .where(eq(projects.id, value.id))
        .run()
    );
    if (result.changes === 0) throw new DomainError("NOT_FOUND", `Projeto ${value.id} não existe.`, { id: value.id });
    const stored = await this.getById(value.id);
    if (!stored) throw new DomainError("NOT_FOUND", `Projeto ${value.id} não existe.`, { id: value.id });
    return stored;
  }
}

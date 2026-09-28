import { asc, eq } from "drizzle-orm";
import { SourceSchema, type Source } from "../../../core/projects/source";
import type { SourceRepository } from "../../../core/projects/repositories";
import { DomainError } from "../../../shared/errors";
import type { ProjectId, SourceId } from "../../../shared/id";
import { parseOrThrow } from "../../../shared/validation";
import type { AtlasDb } from "../client";
import { sources } from "../schema";
import { run, toDomain } from "./support";

export class SqliteSourceRepository implements SourceRepository {
  constructor(private readonly db: AtlasDb) {}

  async create(source: Source): Promise<Source> {
    const value = parseOrThrow(SourceSchema, source, "Source");
    run("Source", () => this.db.insert(sources).values(value).run());
    return value;
  }

  async getById(id: SourceId): Promise<Source | null> {
    const row = run("Source", () => this.db.select().from(sources).where(eq(sources.id, id)).get());
    return row ? toDomain(SourceSchema, row, "Source") : null;
  }

  async listByProject(projectId: ProjectId): Promise<Source[]> {
    const rows = run("Source", () =>
      this.db.select().from(sources).where(eq(sources.projectId, projectId)).orderBy(asc(sources.id)).all()
    );
    return rows.map((row) => toDomain(SourceSchema, row, "Source"));
  }

  async delete(id: SourceId): Promise<void> {
    // Captures da source caem em cascata; os Assets ficam (captureId vira null).
    const result = run("Source", () => this.db.delete(sources).where(eq(sources.id, id)).run());
    if (result.changes === 0) throw new DomainError("NOT_FOUND", `Source ${id} não existe.`, { id });
  }
}

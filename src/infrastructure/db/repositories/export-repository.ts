import { desc, eq, isNull } from "drizzle-orm";
import { ExportSchema, type ExportId, type ExportRecord, type ExportRepository } from "../../../core/publish/export";
import { DomainError } from "../../../shared/errors";
import type { ProjectId } from "../../../shared/id";
import { nowIso, parseOrThrow } from "../../../shared/validation";
import type { AtlasDb } from "../client";
import { exportsTable } from "../schema";
import { run, toDomain } from "./support";

export class SqliteExportRepository implements ExportRepository {
  constructor(private readonly db: AtlasDb) {}

  async create(record: ExportRecord): Promise<ExportRecord> {
    const value = parseOrThrow(ExportSchema, record, "Exportação");
    run("Exportação", () => this.db.insert(exportsTable).values(value).run());
    return value;
  }

  async getById(id: ExportId): Promise<ExportRecord | null> {
    const row = run("Exportação", () => this.db.select().from(exportsTable).where(eq(exportsTable.id, id)).get());
    return row ? toDomain(ExportSchema, row, "Exportação") : null;
  }

  async listByProject(projectId: ProjectId | null): Promise<ExportRecord[]> {
    const rows = run("Exportação", () =>
      this.db
        .select()
        .from(exportsTable)
        .where(projectId ? eq(exportsTable.projectId, projectId) : isNull(exportsTable.projectId))
        .orderBy(desc(exportsTable.createdAt))
        .all()
    );
    return rows.map((row) => toDomain(ExportSchema, row, "Exportação"));
  }

  async listRecent(limit: number): Promise<ExportRecord[]> {
    const rows = run("Exportação", () => this.db.select().from(exportsTable).orderBy(desc(exportsTable.createdAt)).limit(Math.min(Math.max(limit, 1), 200)).all());
    return rows.map((row) => toDomain(ExportSchema, row, "Exportação"));
  }

  async update(record: ExportRecord): Promise<ExportRecord> {
    const value = parseOrThrow(ExportSchema, { ...record, updatedAt: nowIso() }, "Exportação");
    const result = run("Exportação", () => this.db.update(exportsTable).set({ ...value, id: undefined, createdAt: undefined }).where(eq(exportsTable.id, value.id)).run());
    if (result.changes === 0) throw new DomainError("NOT_FOUND", "Exportação não encontrada.", { id: value.id });
    return value;
  }
}

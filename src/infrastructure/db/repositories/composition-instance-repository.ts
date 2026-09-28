import { desc, eq } from "drizzle-orm";
import {
  CompositionInstanceSchema,
  type CompositionInstance,
  type CompositionInstanceId,
  type CompositionInstanceRepository,
} from "../../../core/creative/composition";
import { DomainError } from "../../../shared/errors";
import type { ProjectId } from "../../../shared/id";
import { nowIso, parseOrThrow } from "../../../shared/validation";
import type { AtlasDb } from "../client";
import { compositionInstances } from "../schema";
import { run, toDomain } from "./support";

export class SqliteCompositionInstanceRepository implements CompositionInstanceRepository {
  constructor(private readonly db: AtlasDb) {}

  async create(instance: CompositionInstance): Promise<CompositionInstance> {
    const value = parseOrThrow(CompositionInstanceSchema, instance, "Composição");
    run("Composição", () => this.db.insert(compositionInstances).values(value).run());
    return value;
  }

  async getById(id: CompositionInstanceId): Promise<CompositionInstance | null> {
    const row = run("Composição", () => this.db.select().from(compositionInstances).where(eq(compositionInstances.id, id)).get());
    return row ? toDomain(CompositionInstanceSchema, row, "Composição") : null;
  }

  async listByProject(projectId: ProjectId): Promise<CompositionInstance[]> {
    const rows = run("Composição", () =>
      this.db.select().from(compositionInstances).where(eq(compositionInstances.projectId, projectId)).orderBy(desc(compositionInstances.updatedAt)).all()
    );
    return rows.map((row) => toDomain(CompositionInstanceSchema, row, "Composição"));
  }

  async update(instance: CompositionInstance): Promise<CompositionInstance> {
    const value = parseOrThrow(CompositionInstanceSchema, { ...instance, updatedAt: nowIso() }, "Composição");
    const result = run("Composição", () =>
      this.db
        .update(compositionInstances)
        .set({ ...value, id: undefined, projectId: undefined, createdAt: undefined })
        .where(eq(compositionInstances.id, value.id))
        .run()
    );
    if (result.changes === 0) throw new DomainError("NOT_FOUND", "Composição não encontrada.", { id: value.id });
    return value;
  }

  async delete(id: CompositionInstanceId): Promise<void> {
    const result = run("Composição", () => this.db.delete(compositionInstances).where(eq(compositionInstances.id, id)).run());
    if (result.changes === 0) throw new DomainError("NOT_FOUND", "Composição não encontrada.", { id });
  }
}

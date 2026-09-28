import { and, desc, eq, isNull, or } from "drizzle-orm";
import {
  SavedDirectionSchema,
  type CreativeDirectionId,
  type CreativeDirectionRepository,
  type SavedDirection,
} from "../../../core/creative/direction";
import {
  CreativeMemorySchema,
  createMemory,
  type CreativeMemory,
  type CreativeMemoryId,
  type CreativeMemoryRepository,
} from "../../../core/creative/memory";
import { DomainError } from "../../../shared/errors";
import type { ProjectId } from "../../../shared/id";
import { nowIso, parseOrThrow } from "../../../shared/validation";
import type { AtlasDb } from "../client";
import { creativeDirections, creativeMemory } from "../schema";
import { run, toDomain } from "./support";

export class SqliteCreativeMemoryRepository implements CreativeMemoryRepository {
  constructor(private readonly db: AtlasDb) {}

  async create(memory: CreativeMemory): Promise<CreativeMemory> {
    const value = parseOrThrow(CreativeMemorySchema, memory, "Memória criativa");
    run("Memória criativa", () => this.db.insert(creativeMemory).values(value).run());
    return value;
  }

  async listFor(projectId: ProjectId | null): Promise<CreativeMemory[]> {
    const rows = run("Memória criativa", () =>
      this.db
        .select()
        .from(creativeMemory)
        .where(projectId ? or(isNull(creativeMemory.projectId), eq(creativeMemory.projectId, projectId)) : isNull(creativeMemory.projectId))
        .orderBy(desc(creativeMemory.updatedAt))
        .all()
    );
    return rows.map((row) => toDomain(CreativeMemorySchema, row, "Memória criativa"));
  }

  async listWorkspace(): Promise<CreativeMemory[]> {
    return this.listFor(null);
  }

  async delete(id: CreativeMemoryId): Promise<void> {
    const result = run("Memória criativa", () => this.db.delete(creativeMemory).where(eq(creativeMemory.id, id)).run());
    if (result.changes === 0) throw new DomainError("NOT_FOUND", "Memória não encontrada.", { id });
  }

  async bumpSignal(input: Pick<CreativeMemory, "scope" | "projectId" | "polarity" | "subject" | "value">): Promise<CreativeMemory> {
    return run("Memória criativa", () =>
      this.db.transaction(
        (tx) => {
          const row = tx
            .select()
            .from(creativeMemory)
            .where(
              and(
                eq(creativeMemory.scope, input.scope),
                input.projectId ? eq(creativeMemory.projectId, input.projectId) : isNull(creativeMemory.projectId),
                eq(creativeMemory.polarity, input.polarity),
                eq(creativeMemory.subject, input.subject),
                eq(creativeMemory.value, input.value),
                eq(creativeMemory.source, "signal")
              )
            )
            .get();
          if (row) {
            const current = toDomain(CreativeMemorySchema, row, "Memória criativa");
            const next = { ...current, weight: Math.min(current.weight + 1, 10_000), updatedAt: nowIso() };
            tx.update(creativeMemory).set({ weight: next.weight, updatedAt: next.updatedAt }).where(eq(creativeMemory.id, current.id)).run();
            return next;
          }
          const created = createMemory({ ...input, source: "signal", weight: 1 });
          tx.insert(creativeMemory).values(created).run();
          return created;
        },
        { behavior: "immediate" }
      )
    );
  }
}

export class SqliteCreativeDirectionRepository implements CreativeDirectionRepository {
  constructor(private readonly db: AtlasDb) {}

  async create(direction: SavedDirection): Promise<SavedDirection> {
    const value = parseOrThrow(SavedDirectionSchema, direction, "Direção criativa");
    run("Direção criativa", () => this.db.insert(creativeDirections).values(value).run());
    return value;
  }

  async getById(id: CreativeDirectionId): Promise<SavedDirection | null> {
    const row = run("Direção criativa", () => this.db.select().from(creativeDirections).where(eq(creativeDirections.id, id)).get());
    return row ? toDomain(SavedDirectionSchema, row, "Direção criativa") : null;
  }

  async listByProject(projectId: ProjectId): Promise<SavedDirection[]> {
    const rows = run("Direção criativa", () =>
      this.db.select().from(creativeDirections).where(eq(creativeDirections.projectId, projectId)).orderBy(desc(creativeDirections.createdAt)).all()
    );
    return rows.map((row) => toDomain(SavedDirectionSchema, row, "Direção criativa"));
  }

  async delete(id: CreativeDirectionId): Promise<void> {
    const result = run("Direção criativa", () => this.db.delete(creativeDirections).where(eq(creativeDirections.id, id)).run());
    if (result.changes === 0) throw new DomainError("NOT_FOUND", "Direção não encontrada.", { id });
  }
}

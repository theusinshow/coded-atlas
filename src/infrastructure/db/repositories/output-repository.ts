import { asc, count, eq } from "drizzle-orm";
import type { StorageKey } from "../../../core/assets/storage-key";
import { OutputSchema, type Output } from "../../../core/assets/output";
import type { OutputRepository } from "../../../core/assets/repositories";
import type { OutputId, ProjectId } from "../../../shared/id";
import { parseOrThrow } from "../../../shared/validation";
import type { AtlasDb } from "../client";
import { outputs } from "../schema";
import { run, toDomain } from "./support";

export class SqliteOutputRepository implements OutputRepository {
  constructor(private readonly db: AtlasDb) {}

  async create(output: Output): Promise<Output> {
    const value = parseOrThrow(OutputSchema, output, "Output");
    run("Output", () => this.db.insert(outputs).values(value).run());
    return value;
  }

  async getById(id: OutputId): Promise<Output | null> {
    const row = run("Output", () => this.db.select().from(outputs).where(eq(outputs.id, id)).get());
    return row ? toDomain(OutputSchema, row, "Output") : null;
  }

  async listByProject(projectId: ProjectId): Promise<Output[]> {
    const rows = run("Output", () =>
      this.db.select().from(outputs).where(eq(outputs.projectId, projectId)).orderBy(asc(outputs.id)).all()
    );
    return rows.map((row) => toDomain(OutputSchema, row, "Output"));
  }

  async countByStorageKey(key: StorageKey): Promise<number> {
    const row = run("Output", () => this.db.select({ n: count() }).from(outputs).where(eq(outputs.storageKey, key)).get());
    return row?.n ?? 0;
  }
}

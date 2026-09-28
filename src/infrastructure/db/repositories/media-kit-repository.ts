import { desc, eq } from "drizzle-orm";
import { MediaKitSchema, type MediaKit, type MediaKitId, type MediaKitRepository } from "../../../core/kits/media-kit";
import { DomainError } from "../../../shared/errors";
import type { ProjectId } from "../../../shared/id";
import { nowIso, parseOrThrow } from "../../../shared/validation";
import type { AtlasDb } from "../client";
import { mediaKits } from "../schema";
import { run, toDomain } from "./support";

export class SqliteMediaKitRepository implements MediaKitRepository {
  constructor(private readonly db: AtlasDb) {}

  async create(kit: MediaKit): Promise<MediaKit> {
    const value = parseOrThrow(MediaKitSchema, kit, "Media Kit");
    run("Media Kit", () => this.db.insert(mediaKits).values(value).run());
    return value;
  }

  async getById(id: MediaKitId): Promise<MediaKit | null> {
    const row = run("Media Kit", () => this.db.select().from(mediaKits).where(eq(mediaKits.id, id)).get());
    return row ? toDomain(MediaKitSchema, row, "Media Kit") : null;
  }

  async listByProject(projectId: ProjectId): Promise<MediaKit[]> {
    const rows = run("Media Kit", () => this.db.select().from(mediaKits).where(eq(mediaKits.projectId, projectId)).orderBy(desc(mediaKits.createdAt)).all());
    return rows.map((row) => toDomain(MediaKitSchema, row, "Media Kit"));
  }

  async update(kit: MediaKit): Promise<MediaKit> {
    const value = parseOrThrow(MediaKitSchema, { ...kit, updatedAt: nowIso() }, "Media Kit");
    const result = run("Media Kit", () =>
      this.db.update(mediaKits).set({ ...value, id: undefined, projectId: undefined, createdAt: undefined }).where(eq(mediaKits.id, value.id)).run()
    );
    if (result.changes === 0) throw new DomainError("NOT_FOUND", "Media Kit não encontrado.", { id: value.id });
    return value;
  }

  async delete(id: MediaKitId): Promise<void> {
    const result = run("Media Kit", () => this.db.delete(mediaKits).where(eq(mediaKits.id, id)).run());
    if (result.changes === 0) throw new DomainError("NOT_FOUND", "Media Kit não encontrado.", { id });
  }
}

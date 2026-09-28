import { and, asc, desc, eq } from "drizzle-orm";
import { VisualProfileSchema, type VisualProfile, type VisualProfileRepository } from "../../../core/creative/visual-profile";
import type { ProjectId } from "../../../shared/id";
import { parseOrThrow } from "../../../shared/validation";
import type { AtlasDb } from "../client";
import { visualProfiles } from "../schema";
import { run, toDomain } from "./support";

export class SqliteVisualProfileRepository implements VisualProfileRepository {
  constructor(private readonly db: AtlasDb) {}

  async create(profile: VisualProfile): Promise<VisualProfile> {
    const value = parseOrThrow(VisualProfileSchema, profile, "VisualProfile");
    run("VisualProfile", () => this.db.insert(visualProfiles).values(value).run());
    return value;
  }

  async latest(projectId: ProjectId): Promise<VisualProfile | null> {
    const row = run("VisualProfile", () =>
      this.db.select().from(visualProfiles).where(eq(visualProfiles.projectId, projectId)).orderBy(desc(visualProfiles.revision)).limit(1).get()
    );
    return row ? toDomain(VisualProfileSchema, row, "VisualProfile") : null;
  }

  async getRevision(projectId: ProjectId, revision: number): Promise<VisualProfile | null> {
    const row = run("VisualProfile", () =>
      this.db
        .select()
        .from(visualProfiles)
        .where(and(eq(visualProfiles.projectId, projectId), eq(visualProfiles.revision, revision)))
        .get()
    );
    return row ? toDomain(VisualProfileSchema, row, "VisualProfile") : null;
  }

  async listByProject(projectId: ProjectId): Promise<VisualProfile[]> {
    const rows = run("VisualProfile", () =>
      this.db.select().from(visualProfiles).where(eq(visualProfiles.projectId, projectId)).orderBy(asc(visualProfiles.revision)).all()
    );
    return rows.map((row) => toDomain(VisualProfileSchema, row, "VisualProfile"));
  }
}

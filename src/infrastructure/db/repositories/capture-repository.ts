import { asc, eq } from "drizzle-orm";
import { CaptureSchema, type Capture } from "../../../core/assets/capture";
import type { CaptureRepository } from "../../../core/assets/repositories";
import { DomainError } from "../../../shared/errors";
import type { CaptureId, ProjectId } from "../../../shared/id";
import { parseOrThrow } from "../../../shared/validation";
import type { AtlasDb } from "../client";
import { captures } from "../schema";
import { run, toDomain } from "./support";

export class SqliteCaptureRepository implements CaptureRepository {
  constructor(private readonly db: AtlasDb) {}

  async create(capture: Capture): Promise<Capture> {
    const value = parseOrThrow(CaptureSchema, capture, "Capture");
    run("Capture", () => this.db.insert(captures).values(value).run());
    return value;
  }

  async getById(id: CaptureId): Promise<Capture | null> {
    const row = run("Capture", () => this.db.select().from(captures).where(eq(captures.id, id)).get());
    return row ? toDomain(CaptureSchema, row, "Capture") : null;
  }

  async listByProject(projectId: ProjectId): Promise<Capture[]> {
    const rows = run("Capture", () =>
      this.db.select().from(captures).where(eq(captures.projectId, projectId)).orderBy(asc(captures.id)).all()
    );
    return rows.map((row) => toDomain(CaptureSchema, row, "Capture"));
  }

  async update(capture: Capture): Promise<Capture> {
    const value = parseOrThrow(CaptureSchema, capture, "Capture");
    const { status, error, startedAt, completedAt, jobId } = value;
    const result = run("Capture", () =>
      this.db.update(captures).set({ status, error, startedAt, completedAt, jobId }).where(eq(captures.id, value.id)).run()
    );
    if (result.changes === 0) throw new DomainError("NOT_FOUND", `Capture ${value.id} não existe.`, { id: value.id });
    return value;
  }
}

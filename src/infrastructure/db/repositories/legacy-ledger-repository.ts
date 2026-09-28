import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { LegacyImportEntry, LegacyImportLedger } from "../../../modules/import/legacy/legacy-ledger";
import { ProjectIdSchema } from "../../../shared/id";
import { nowIso } from "../../../shared/validation";
import type { AtlasDb } from "../client";
import { legacyImports } from "../schema";
import { run, toDomain } from "./support";

const EntrySchema = z.object({
  slug: z.string().min(1).max(200),
  projectId: ProjectIdSchema.nullable(),
  status: z.enum(["imported", "dismissed", "failed"]),
  catalogCreatedAt: z.string().nullable(),
  error: z.string().nullable(),
});

export class SqliteLegacyImportLedger implements LegacyImportLedger {
  constructor(private readonly db: AtlasDb) {}

  async get(slug: string): Promise<LegacyImportEntry | null> {
    const row = run("Importação v1", () => this.db.select().from(legacyImports).where(eq(legacyImports.slug, slug)).get());
    return row ? toDomain(EntrySchema, row, "Importação v1") : null;
  }

  async list(): Promise<LegacyImportEntry[]> {
    const rows = run("Importação v1", () => this.db.select().from(legacyImports).orderBy(asc(legacyImports.slug)).all());
    return rows.map((row) => toDomain(EntrySchema, row, "Importação v1"));
  }

  async record(entry: LegacyImportEntry): Promise<void> {
    const now = nowIso();
    const value = EntrySchema.parse(entry);
    run("Importação v1", () =>
      this.db
        .insert(legacyImports)
        .values({ ...value, importedAt: now, updatedAt: now })
        .onConflictDoUpdate({ target: legacyImports.slug, set: { ...value, updatedAt: now } })
        .run()
    );
  }
}

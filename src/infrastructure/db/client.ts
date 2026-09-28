import path from "node:path";
import { mkdirSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { DomainError } from "../../shared/errors";
import { silentLogger, type Logger } from "../../shared/logger";
import * as schema from "./schema";

export type AtlasDb = BetterSQLite3Database<typeof schema>;

export interface AtlasDatabase {
  db: AtlasDb;
  sqlite: Database.Database;
  close(): void;
}

export const DEFAULT_MIGRATIONS_FOLDER = path.join(process.cwd(), "src", "infrastructure", "db", "migrations");
const MIGRATIONS_TABLE = "__drizzle_migrations";

export interface OpenDatabaseOptions {
  /** Caminho do arquivo SQLite, ou ":memory:" (testes). */
  file: string;
  migrationsFolder?: string;
  logger?: Logger;
}

/**
 * Abre o banco do Atlas: WAL, foreign keys, busy timeout; confere se o schema
 * gravado é compatível com as migrations que este código conhece e aplica as
 * pendentes. Banco vindo de uma versão mais nova (ou com migration editada)
 * falha com DB_SCHEMA_MISMATCH em vez de ser corrompido.
 */
export function openDatabase(options: OpenDatabaseOptions): AtlasDatabase {
  const logger = (options.logger ?? silentLogger).child("db");
  const migrationsFolder = options.migrationsFolder ?? DEFAULT_MIGRATIONS_FOLDER;

  if (options.file !== ":memory:") mkdirSync(path.dirname(options.file), { recursive: true });
  const sqlite = new Database(options.file);

  try {
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    sqlite.pragma("busy_timeout = 5000");
    sqlite.pragma("synchronous = NORMAL");

    const known = readMigrationFiles({ migrationsFolder });
    assertCompatibleSchema(sqlite, known);

    const db = drizzle(sqlite, { schema });
    const before = appliedMigrationCount(sqlite);
    migrate(db, { migrationsFolder, migrationsTable: MIGRATIONS_TABLE });
    const applied = appliedMigrationCount(sqlite) - before;
    if (applied > 0) logger.info("migrations aplicadas", { applied, file: options.file });

    return { db, sqlite, close: () => sqlite.close() };
  } catch (err) {
    sqlite.close();
    throw err;
  }
}

interface KnownMigration {
  folderMillis: number;
  hash: string;
}

function hasMigrationsTable(sqlite: Database.Database): boolean {
  return (
    sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(MIGRATIONS_TABLE) !== undefined
  );
}

function appliedMigrationCount(sqlite: Database.Database): number {
  if (!hasMigrationsTable(sqlite)) return 0;
  const row = sqlite.prepare(`SELECT COUNT(*) AS n FROM ${MIGRATIONS_TABLE}`).get() as { n: number };
  return row.n;
}

function assertCompatibleSchema(sqlite: Database.Database, known: KnownMigration[]): void {
  if (!hasMigrationsTable(sqlite)) return; // banco vazio: tudo será aplicado

  const applied = sqlite
    .prepare(`SELECT hash, created_at AS createdAt FROM ${MIGRATIONS_TABLE} ORDER BY created_at`)
    .all() as { hash: string; createdAt: number | string }[];
  const byMillis = new Map(known.map((m) => [m.folderMillis, m.hash]));

  for (const row of applied) {
    const expected = byMillis.get(Number(row.createdAt));
    if (expected === undefined) {
      throw new DomainError(
        "DB_SCHEMA_MISMATCH",
        "O banco do Atlas foi criado por uma versão mais nova (ou diferente) do código. " +
          "Atualize o Atlas ou aponte ATLAS_HOME para outro diretório.",
        { unknownMigration: Number(row.createdAt) }
      );
    }
    if (expected !== row.hash) {
      throw new DomainError(
        "DB_SCHEMA_MISMATCH",
        "Uma migration já aplicada neste banco foi alterada. Migrations aplicadas nunca devem ser editadas — " +
          "restaure o arquivo original e crie uma migration nova.",
        { migration: Number(row.createdAt) }
      );
    }
  }
}

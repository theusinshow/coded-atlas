/**
 * Inicializa/atualiza o banco do Atlas 2.x em ATLAS_HOME (padrão: ./.atlas).
 * Uso: npm run db:migrate
 * Não toca em public/generated nem nos projetos legados.
 */
import { resolveAtlasHome } from "../src/infrastructure/atlas-home";
import { openDatabase } from "../src/infrastructure/db/client";
import { isDomainError } from "../src/shared/errors";
import { createLogger } from "../src/shared/logger";

const logger = createLogger({ scope: "atlas:db-migrate" });
const home = resolveAtlasHome();

try {
  const database = openDatabase({ file: home.databaseFile, logger });
  const tables = database.sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[];
  const journal = database.sqlite.pragma("journal_mode", { simple: true });
  database.close();
  logger.info("banco pronto", { file: home.databaseFile, journal, tables: tables.map((t) => t.name) });
} catch (err) {
  logger.error(isDomainError(err) ? err.message : "falha ao abrir o banco", {
    code: isDomainError(err) ? err.code : undefined,
    error: err,
  });
  process.exitCode = 1;
}

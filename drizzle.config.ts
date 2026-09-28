import { defineConfig } from "drizzle-kit";

// Só para GERAR migrations (`npm run db:generate`). Aplicar é responsabilidade
// do app (src/infrastructure/db/client.ts), que roda as pendentes ao abrir o banco.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/infrastructure/db/schema.ts",
  out: "./src/infrastructure/db/migrations",
});

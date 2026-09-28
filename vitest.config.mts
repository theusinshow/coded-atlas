import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // better-sqlite3 é módulo nativo: processos (forks) são mais estáveis que worker threads.
    pool: "forks",
  },
});

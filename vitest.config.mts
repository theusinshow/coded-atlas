import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // O tsconfig mantém `jsx: preserve` para o Next; nos testes o JSX do kernel de render é transformado aqui.
  oxc: { jsx: { runtime: "automatic" } },
  // Mesmo alias do tsconfig (`@/…` = raiz do projeto) para testar módulos de UI puros (ex.: store do Studio).
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "lib/**/*.test.ts"],
    // better-sqlite3 é módulo nativo: processos (forks) são mais estáveis que worker threads.
    pool: "forks",
  },
});

import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Há um package-lock.json solto em C:\Dev que o Next confunde como raiz do
  // workspace. Fixar a raiz no diretório do projeto silencia o aviso e garante
  // que o build trace os arquivos certos.
  outputFileTracingRoot: path.resolve(process.cwd()),

  // esbuild empacota o kernel de render em tempo de execução (binário nativo): fica fora do bundle.
  serverExternalPackages: ["esbuild"],

  // Upload manual de assets passa por server action: o limite padrão (1 MB) não
  // cabe um screenshot em alta. O teto por arquivo é validado no serviço.
  experimental: {
    serverActions: { bodySizeLimit: "200mb" },
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  webpack(config: any, { dev }: { dev: boolean }) {
    if (dev) {
      // No Windows o cache em disco pode corromper (rename atômico falha).
      // Memória é mais lenta no cold start mas nunca quebra entre requests.
      config.cache = { type: "memory" };
    }
    return config;
  },
};

export default nextConfig;

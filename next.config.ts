import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

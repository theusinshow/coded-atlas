import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isDomainError } from "../../shared/errors";
import { PlaywrightCaptureEngine } from "../playwright/playwright-capture-engine";
import { createUrlPolicy, resolveUrlPolicyMode } from "./url-policy";

const VIEWPORT = { label: "desktop", width: 400, height: 300, deviceScaleFactor: 1 };

describe("createUrlPolicy", () => {
  it("hosted-safe consulta o DNS e bloqueia quem resolve para rede interna", async () => {
    const dns: Record<string, string[]> = {
      "publico.example": ["93.184.216.34"],
      "rebind.example": ["93.184.216.34", "192.168.0.7"],
    };
    const policy = createUrlPolicy("hosted-safe", async (host) => dns[host] ?? Promise.reject(new Error("NXDOMAIN")));

    await expect(policy.assertAllowed("https://publico.example/")).resolves.toBeUndefined();
    for (const url of ["https://rebind.example/", "https://nxdomain.example/", "http://127.0.0.1/"]) {
      await expect(policy.assertAllowed(url)).rejects.toSatisfy((err: unknown) => isDomainError(err, "VALIDATION"));
    }
  });

  it("local não consulta DNS e aceita localhost", async () => {
    const policy = createUrlPolicy("local", async () => {
      throw new Error("não deveria resolver");
    });
    await expect(policy.assertAllowed("http://localhost:5000/")).resolves.toBeUndefined();
    await expect(policy.assertAllowed("ftp://x.com/")).rejects.toThrow(/Protocolo/);
  });

  it("modo vem de ATLAS_URL_POLICY (padrão local) e valor desconhecido falha", () => {
    const env = (vars: Record<string, string>) => vars as NodeJS.ProcessEnv;
    expect(resolveUrlPolicyMode(env({}))).toBe("local");
    expect(resolveUrlPolicyMode(env({ ATLAS_URL_POLICY: "hosted-safe" }))).toBe("hosted-safe");
    expect(() => resolveUrlPolicyMode(env({ ATLAS_URL_POLICY: "aberto" }))).toThrow(/ATLAS_URL_POLICY/);
  });
});

describe("PlaywrightCaptureEngine com urlGuard", () => {
  let server: Server;
  let base: string;
  const hits: string[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      hits.push(req.url ?? "");
      if (req.url === "/redirect") return void res.writeHead(302, { location: "/proibido" }).end();
      if (req.url === "/com-imagem") {
        res.writeHead(200, { "content-type": "text/html" });
        return void res.end(`<html><body><img src="/proibido.png"></body></html>`);
      }
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><body>ok</body></html>");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const guard = async (url: string) => {
    if (url.includes("proibido")) throw new Error(`bloqueado: ${url}`);
  };
  const engine = new PlaywrightCaptureEngine({
    headless: true,
    navTimeoutMs: 15_000,
    userAgent: "AtlasTest",
    settle: false,
    urlGuard: guard,
  });
  const capture = (path: string) =>
    engine.captureViewport({ url: `${base}${path}`, viewport: VIEWPORT, signal: new AbortController().signal });

  it("página permitida captura normalmente", async () => {
    const shot = await capture("/ok");
    expect(shot).toMatchObject({ width: 400, height: 300 });
  }, 30_000);

  it("subrecurso proibido é barrado antes de sair do navegador e a captura falha", async () => {
    hits.length = 0;
    await expect(capture("/com-imagem")).rejects.toThrow(/bloqueado: .*proibido\.png/);
    expect(hits).not.toContain("/proibido.png");
  }, 30_000);

  it("redirect para destino proibido é detectado na cadeia da navegação", async () => {
    await expect(capture("/redirect")).rejects.toThrow(/bloqueado: .*\/proibido/);
  }, 30_000);
});

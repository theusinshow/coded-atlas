import { lookup as dnsLookup } from "node:dns/promises";
import { evaluateUrl, isInternalHostname, isIpLiteral, type UrlPolicyMode } from "../../core/projects/url-policy";
import { DomainError } from "../../shared/errors";

export type Resolver = (hostname: string) => Promise<string[]>;

const systemResolver: Resolver = async (hostname) =>
  (await dnsLookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);

export interface UrlPolicy {
  readonly mode: UrlPolicyMode;
  /** Lança DomainError("VALIDATION") se a URL não puder ser acessada neste modo. */
  assertAllowed(url: string): Promise<void>;
}

export function resolveUrlPolicyMode(env: NodeJS.ProcessEnv = process.env): UrlPolicyMode {
  const value = env.ATLAS_URL_POLICY ?? "local";
  if (value !== "local" && value !== "hosted-safe") {
    throw new DomainError("VALIDATION", `ATLAS_URL_POLICY inválido: "${value}" (use local ou hosted-safe).`);
  }
  return value;
}

/**
 * Política de URL com resolução de DNS: em `hosted-safe`, TODOS os endereços
 * do host precisam ser públicos (um único privado bloqueia — evita DNS que
 * mistura endereços para burlar a checagem).
 */
export function createUrlPolicy(mode: UrlPolicyMode, resolve: Resolver = systemResolver): UrlPolicy {
  return {
    mode,
    assertAllowed: async (rawUrl) => {
      let addresses: string[] = [];
      if (mode === "hosted-safe") {
        let host = "";
        try {
          host = new URL(rawUrl).hostname;
        } catch {
          /* evaluateUrl devolve "URL inválida" */
        }
        if (host && !isIpLiteral(host) && !isInternalHostname(host)) {
          addresses = await resolve(host).catch(() => []);
        }
      }
      const verdict = evaluateUrl(rawUrl, mode, addresses);
      if (!verdict.allowed) {
        throw new DomainError("VALIDATION", `URL bloqueada pela política (${mode}): ${verdict.reason}`, { url: rawUrl });
      }
    },
  };
}

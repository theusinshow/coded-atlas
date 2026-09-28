/**
 * Política de URL (docs/ARCHITECTURE.md → Security boundaries). Regras puras;
 * a resolução de DNS fica na infraestrutura (src/infrastructure/net).
 *
 * - `local` (padrão): Atlas rodando na máquina do dono — capturar localhost e a
 *   rede interna é um caso de uso legítimo (site em desenvolvimento). Só exige http(s).
 * - `hosted-safe`: para quando o Atlas estiver exposto a terceiros — bloqueia
 *   loopback, redes privadas, link-local, endereços de metadados de nuvem e
 *   faixas reservadas, inclusive quando um hostname resolve para eles.
 */
export type UrlPolicyMode = "local" | "hosted-safe";

export type AddressClass =
  | "public"
  | "loopback"
  | "private"
  | "link-local"
  | "metadata"
  | "unspecified"
  | "reserved"
  | "invalid";

export type UrlVerdict = { allowed: true } | { allowed: false; reason: string };

function parseIpv4(ip: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p <= 255) ? parts : null;
}

function classifyIpv4([a, b, c, d]: number[]): AddressClass {
  if (a === 169 && b === 254 && c === 169 && d === 254) return "metadata";
  if (a === 0) return "unspecified";
  if (a === 127) return "loopback";
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return "private";
  if (a === 100 && b >= 64 && b <= 127) return "private"; // CGNAT
  if (a === 169 && b === 254) return "link-local";
  if (a >= 224) return "reserved"; // multicast + reservado + broadcast
  if (a === 192 && b === 0 && c === 0) return "reserved";
  if (a === 198 && (b === 18 || b === 19)) return "reserved"; // benchmark
  return "public";
}

/** Expande um IPv6 (com ou sem ::, com IPv4 embutido) em 8 grupos de 16 bits. */
function parseIpv6(ip: string): number[] | null {
  let text = ip.toLowerCase().split("%")[0];
  const v4Tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (v4Tail) {
    const v4 = parseIpv4(v4Tail[1]);
    if (!v4) return null;
    text = text.slice(0, -v4Tail[1].length) + `${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

function classifyIpv6(g: number[]): AddressClass {
  if (g.every((x) => x === 0)) return "unspecified";
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return "loopback";
  // ::ffff:a.b.c.d (mapeado) → regras do IPv4
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return classifyIpv4([g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff]);
  }
  if (g[0] === 0xfd00 && g[1] === 0x0ec2 && g.slice(2, 7).every((x) => x === 0) && g[7] === 0x254) {
    return "metadata"; // AWS IMDS IPv6: fd00:ec2::254
  }
  if ((g[0] & 0xfe00) === 0xfc00) return "private"; // fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return "link-local"; // fe80::/10
  if ((g[0] & 0xff00) === 0xff00) return "reserved"; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return "reserved"; // documentação
  return "public";
}

export function classifyAddress(ip: string): AddressClass {
  const bare = ip.startsWith("[") && ip.endsWith("]") ? ip.slice(1, -1) : ip;
  const v4 = parseIpv4(bare);
  if (v4) return classifyIpv4(v4);
  const v6 = parseIpv6(bare);
  return v6 ? classifyIpv6(v6) : "invalid";
}

export function isIpLiteral(host: string): boolean {
  return classifyAddress(host) !== "invalid";
}

/** Nomes que sempre apontam para a própria máquina/rede, sem precisar resolver. */
export function isInternalHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local");
}

/**
 * Veredito para uma URL, dados os endereços para os quais o host resolveu
 * (vazio se não foi preciso resolver). Em `local`, só o protocolo importa.
 */
export function evaluateUrl(rawUrl: string, mode: UrlPolicyMode, resolvedAddresses: readonly string[] = []): UrlVerdict {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: "URL inválida." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { allowed: false, reason: `Protocolo não permitido: ${url.protocol}` };
  }
  if (url.username || url.password) return { allowed: false, reason: "URL com credenciais embutidas." };
  if (mode === "local") return { allowed: true };

  const host = url.hostname;
  if (isInternalHostname(host)) return { allowed: false, reason: `Host interno bloqueado: ${host}` };
  const addresses = isIpLiteral(host) ? [host] : resolvedAddresses;
  if (addresses.length === 0) return { allowed: false, reason: `Não foi possível resolver ${host}.` };
  for (const address of addresses) {
    const cls = classifyAddress(address);
    if (cls !== "public") return { allowed: false, reason: `${host} aponta para endereço ${cls} (${address}).` };
  }
  return { allowed: true };
}

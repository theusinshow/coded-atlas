import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DeliveryFile, FolderDestination, GithubDestination } from "../../modules/publish/destinations";
import { DomainError } from "../../shared/errors";

/** Só segmentos simples (sem `..`, sem absolutos, sem separadores estranhos). */
function assertRelative(relative: string): string[] {
  const parts = relative.split("/");
  if (!relative || relative.startsWith("/") || parts.some((p) => !p || p === "." || p === ".." || /[\\:*?"<>|\u0000-\u001f]/.test(p))) {
    throw new DomainError("PATH_OUTSIDE_ROOT", `Caminho de entrega inválido: ${relative}`);
  }
  return parts;
}

/**
 * Pasta local de entregas (ATLAS_EXPORT_DIR, padrão `<ATLAS_HOME>/exports`): cada
 * pacote vira uma subpasta. Confinado à raiz — nada escapa dela.
 */
export class LocalFolderDestination implements FolderDestination {
  readonly configured = true;
  constructor(private readonly root: string) {}

  get label(): string {
    return this.root;
  }

  async deliver(folder: string, files: readonly DeliveryFile[]): Promise<{ folder: string; files: number }> {
    const base = path.resolve(this.root, ...assertRelative(folder));
    if (!base.startsWith(path.resolve(this.root) + path.sep)) throw new DomainError("PATH_OUTSIDE_ROOT", "Pasta de entrega fora da raiz.");
    for (const file of files) {
      const target = path.resolve(base, ...assertRelative(file.path));
      if (!target.startsWith(base + path.sep)) throw new DomainError("PATH_OUTSIDE_ROOT", "Arquivo de entrega fora da pasta.");
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.bytes, { flag: "wx" }); // nunca sobrescreve
    }
    return { folder, files: files.length };
  }
}

export interface GithubConfig {
  token: string;
  repo: string;
  branch: string;
  /** Pasta no repositório onde o Atlas escreve (ex.: "atlas"). */
  basePath: string;
  fetch?: typeof fetch;
  apiUrl?: string;
}

/**
 * Destino GitHub opcional (repositório do portfólio): um commit com todos os
 * arquivos via Git Data API (blobs → tree → commit → ref). Só com token e repo
 * configurados; a ação é sempre disparada pelo Matheus.
 */
export class GithubApiDestination implements GithubDestination {
  readonly configured: boolean;
  constructor(private readonly config: GithubConfig | null) {
    this.configured = !!config;
  }

  get label(): string {
    return this.config ? `${this.config.repo}@${this.config.branch}` : "não configurado";
  }

  private async call<T>(method: string, route: string, body?: unknown): Promise<T> {
    const c = this.config!;
    const res = await (c.fetch ?? fetch)(`${c.apiUrl ?? "https://api.github.com"}/repos/${c.repo}${route}`, {
      method,
      headers: { Authorization: `Bearer ${c.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw new DomainError("VALIDATION", `GitHub respondeu ${res.status} em ${route.split("?")[0]}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
  }

  async deliver(prefix: string, files: readonly DeliveryFile[], message: string): Promise<{ commitUrl: string; files: number }> {
    if (!this.config) throw new DomainError("VALIDATION", "GitHub não configurado (ATLAS_GITHUB_TOKEN e ATLAS_GITHUB_REPO).");
    const c = this.config;
    const root = [c.basePath, ...assertRelative(prefix)].filter(Boolean).join("/");
    const ref = await this.call<{ object: { sha: string } }>("GET", `/git/ref/heads/${encodeURIComponent(c.branch)}`);
    const parent = await this.call<{ tree: { sha: string } }>("GET", `/git/commits/${ref.object.sha}`);
    const tree = [];
    for (const file of files) {
      const blob = await this.call<{ sha: string }>("POST", "/git/blobs", { content: Buffer.from(file.bytes).toString("base64"), encoding: "base64" });
      tree.push({ path: `${root}/${assertRelative(file.path).join("/")}`, mode: "100644", type: "blob", sha: blob.sha });
    }
    const newTree = await this.call<{ sha: string }>("POST", "/git/trees", { base_tree: parent.tree.sha, tree });
    const commit = await this.call<{ sha: string; html_url?: string }>("POST", "/git/commits", { message, tree: newTree.sha, parents: [ref.object.sha] });
    await this.call("PATCH", `/git/refs/heads/${encodeURIComponent(c.branch)}`, { sha: commit.sha, force: false });
    return { commitUrl: commit.html_url ?? `https://github.com/${c.repo}/commit/${commit.sha}`, files: files.length };
  }
}

export function githubConfigFromEnv(env: Record<string, string | undefined> = process.env): GithubConfig | null {
  const token = env.ATLAS_GITHUB_TOKEN?.trim();
  const repo = env.ATLAS_GITHUB_REPO?.trim();
  if (!token || !repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  return { token, repo, branch: env.ATLAS_GITHUB_BRANCH?.trim() || "main", basePath: (env.ATLAS_GITHUB_PATH?.trim() || "atlas").replace(/^\/+|\/+$/g, "") };
}

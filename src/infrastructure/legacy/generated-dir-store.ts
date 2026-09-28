import { promises as fs } from "node:fs";
import path from "node:path";
import type { LegacyCatalogRead, LegacyFolder, LegacyStore } from "../../modules/import/legacy/legacy-store";
import { isDomainError } from "../../shared/errors";
import { assertRealWithin, resolveWithin } from "../storage/confine";

/** Catálogos reais têm dezenas de KB; acima disso não é um catalog.json legítimo. */
const MAX_CATALOG_BYTES = 5 * 1024 * 1024;
const PUBLIC_PREFIX = "/generated/";

/**
 * Leitura confinada da pasta de saída do Atlas v1 (`public/generated`).
 * Somente leitura. Todo caminho passa por `resolveWithin` + realpath, então nem
 * slug malicioso nem junction/symlink dentro da pasta levam a arquivos de fora.
 */
export class GeneratedDirStore implements LegacyStore {
  private constructor(private readonly root: string) {}

  /** Raiz inexistente = biblioteca vazia (instalação nova). */
  static async open(outputDir: string): Promise<GeneratedDirStore> {
    let root = path.resolve(outputDir);
    try {
      root = await fs.realpath(root);
    } catch {
      /* ainda não existe: listFolders devolve vazio */
    }
    return new GeneratedDirStore(root);
  }

  async listFolders(): Promise<LegacyFolder[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.root);
    } catch {
      return [];
    }
    const folders: LegacyFolder[] = [];
    for (const name of entries.filter((n) => !n.startsWith(".")).sort()) {
      folders.push({ name, isSafeDirectory: await this.isSafeDirectory(name) });
    }
    return folders;
  }

  async readCatalog(slug: string): Promise<LegacyCatalogRead> {
    let file: string;
    let size: number;
    try {
      file = await this.resolve(path.posix.join(slug, "catalog.json"));
      const info = await fs.stat(file);
      if (!info.isFile()) return { status: "missing" };
      size = info.size;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return { status: "missing" };
      return { status: "unreadable", reason: String(err) };
    }
    if (size > MAX_CATALOG_BYTES) return { status: "too-large", byteSize: size };

    let text: string;
    try {
      text = await fs.readFile(file, "utf-8");
    } catch (err) {
      return { status: "unreadable", reason: String(err) };
    }
    try {
      return { status: "ok", raw: JSON.parse(text) as unknown };
    } catch (err) {
      return { status: "invalid-json", reason: err instanceof Error ? err.message : String(err) };
    }
  }

  async statPublicPath(publicPath: string): Promise<{ byteSize: number } | null> {
    if (!publicPath.startsWith(PUBLIC_PREFIX)) return null;
    const info = await this.statOrNull(publicPath.slice(PUBLIC_PREFIX.length));
    return info?.isFile() ? { byteSize: info.size } : null;
  }

  async hasCaseDraft(slug: string): Promise<boolean> {
    return (await this.statOrNull(path.posix.join(slug, "case-draft.mdx")))?.isFile() ?? false;
  }

  /** `null` para ausente ou fora da raiz; outros erros de I/O (permissão etc.) sobem. */
  private async statOrNull(relative: string) {
    try {
      return await fs.stat(await this.resolve(relative));
    } catch (err) {
      if (isDomainError(err, "PATH_OUTSIDE_ROOT")) return null;
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") return null;
      throw err;
    }
  }

  private async isSafeDirectory(name: string): Promise<boolean> {
    return (await this.statOrNull(name))?.isDirectory() ?? false;
  }

  private async resolve(relative: string): Promise<string> {
    const target = resolveWithin(this.root, relative);
    await assertRealWithin(this.root, target);
    return target;
  }
}

import path from "node:path";
import { promises as fs, constants as fsConstants } from "node:fs";
import type { AssetStorage, StagingArea, StoredObject } from "../../core/assets/asset-storage";
import { parseStorageKey, type StorageKey } from "../../core/assets/storage-key";
import { DomainError } from "../../shared/errors";
import { newId } from "../../shared/id";
import { silentLogger, type Logger } from "../../shared/logger";
import type { Sha256 } from "../../shared/validation";
import { assertRealWithin, resolveWithin } from "./confine";
import { sha256Bytes, sha256File } from "./hash";

/**
 * Pasta interna de trabalho. Começa com "." — storage keys nunca começam com
 * ponto, então não há colisão possível com objetos publicados.
 */
const STAGING_DIR = ".staging";

/**
 * AssetStorage em disco local. Uma StorageKey `a/b/c.png` vive em `<root>/a/b/c.png`.
 *
 * Garantias:
 * - confinamento: chave revalidada + caminho resolvido dentro da raiz (inclusive
 *   após resolver symlinks/junctions);
 * - publicação atômica e sem sobrescrita: os bytes são escritos num arquivo
 *   temporário e publicados com hard link (falha se o destino existir);
 * - imutabilidade: destino existente com o mesmo SHA-256 = dedupe; diferente = CONFLICT.
 */
export class LocalAssetStorage implements AssetStorage {
  private constructor(
    private readonly root: string,
    private readonly logger: Logger
  ) {}

  static async open(root: string, options: { logger?: Logger } = {}): Promise<LocalAssetStorage> {
    await fs.mkdir(path.join(root, STAGING_DIR, "tmp"), { recursive: true });
    const realRoot = await fs.realpath(root);
    return new LocalAssetStorage(realRoot, (options.logger ?? silentLogger).child("storage"));
  }

  async put(key: StorageKey, data: Uint8Array): Promise<StoredObject> {
    const target = await this.pathFor(key);
    const tmp = path.join(this.root, STAGING_DIR, "tmp", newId().toLowerCase());
    try {
      await guard(() => fs.writeFile(tmp, data, { flag: "wx" }), "gravar", key);
      const sha256 = sha256Bytes(data);
      await this.publish(tmp, target, key, sha256);
      return { key: parseStorageKey(key), sha256, byteSize: data.byteLength };
    } finally {
      await fs.rm(tmp, { force: true });
    }
  }

  async get(key: StorageKey): Promise<Uint8Array> {
    const target = await this.pathFor(key);
    try {
      return await fs.readFile(target);
    } catch (err) {
      if (isErrno(err, "ENOENT")) throw new DomainError("NOT_FOUND", `Objeto não encontrado: ${key}`, { key });
      throw storageFailed("ler", key, err);
    }
  }

  async stat(key: StorageKey): Promise<StoredObject | null> {
    const target = await this.pathFor(key);
    try {
      const info = await fs.stat(target);
      if (!info.isFile()) return null;
      return { key: parseStorageKey(key), sha256: await sha256File(target), byteSize: info.size };
    } catch (err) {
      if (isErrno(err, "ENOENT")) return null;
      throw storageFailed("inspecionar", key, err);
    }
  }

  async exists(key: StorageKey): Promise<boolean> {
    const target = await this.pathFor(key);
    try {
      return (await fs.stat(target)).isFile();
    } catch (err) {
      if (isErrno(err, "ENOENT")) return false;
      throw storageFailed("inspecionar", key, err);
    }
  }

  async copy(from: StorageKey, to: StorageKey): Promise<StoredObject> {
    return this.put(to, await this.get(from));
  }

  async delete(key: StorageKey): Promise<void> {
    const target = await this.pathFor(key);
    await guard(() => fs.rm(target, { force: true }), "remover", key);
  }

  async beginStaging(): Promise<StagingArea> {
    const id = newId().toLowerCase();
    const dir = path.join(this.root, STAGING_DIR, id);
    await fs.mkdir(dir);
    return new LocalStagingArea(id, dir, this);
  }

  /** Caminho absoluto confinado para uma chave (revalidada — o brand pode ter sido forjado por cast). */
  async pathFor(key: string): Promise<string> {
    const safeKey = parseStorageKey(key);
    const target = resolveWithin(this.root, safeKey);
    await assertRealWithin(this.root, target);
    return target;
  }

  /**
   * Publica `tmp` em `target` sem nunca sobrescrever. Devolve `true` se criou o
   * objeto, `false` se ele já existia com o mesmo conteúdo (dedupe).
   */
  async publish(tmp: string, target: string, key: string, sha256: Sha256): Promise<boolean> {
    await guard(() => fs.mkdir(path.dirname(target), { recursive: true }), "criar pasta para", key);
    try {
      await linkOrCopyExclusive(tmp, target);
      return true;
    } catch (err) {
      if (!isErrno(err, "EEXIST")) throw storageFailed("publicar", key, err);
    }
    const existing = await sha256File(target);
    if (existing !== sha256) {
      throw new DomainError("CONFLICT", `Objeto imutável já existe com outro conteúdo: ${key}`, { key });
    }
    this.logger.debug("dedupe", { key });
    return false;
  }
}

class LocalStagingArea implements StagingArea {
  private readonly entries = new Map<StorageKey, { file: string; sha256: Sha256; byteSize: number }>();
  private closed = false;

  constructor(
    readonly id: string,
    private readonly dir: string,
    private readonly storage: LocalAssetStorage
  ) {}

  async put(key: StorageKey, data: Uint8Array): Promise<StoredObject> {
    this.assertOpen();
    const safeKey = parseStorageKey(key);
    const sha256 = sha256Bytes(data);
    const staged = this.entries.get(safeKey);
    if (staged) {
      if (staged.sha256 !== sha256) {
        throw new DomainError("CONFLICT", `Chave já preparada com outro conteúdo: ${key}`, { key });
      }
      return { key: safeKey, sha256, byteSize: staged.byteSize };
    }
    const file = path.join(this.dir, String(this.entries.size));
    await guard(() => fs.writeFile(file, data, { flag: "wx" }), "preparar", key);
    this.entries.set(safeKey, { file, sha256, byteSize: data.byteLength });
    return { key: safeKey, sha256, byteSize: data.byteLength };
  }

  async commit(): Promise<StoredObject[]> {
    this.assertOpen();
    this.closed = true;
    const created: string[] = [];
    try {
      const published: StoredObject[] = [];
      for (const [key, entry] of this.entries) {
        const target = await this.storage.pathFor(key);
        if (await this.storage.publish(entry.file, target, key, entry.sha256)) created.push(target);
        published.push({ key, sha256: entry.sha256, byteSize: entry.byteSize });
      }
      return published;
    } catch (err) {
      // Tudo-ou-nada: desfaz só o que ESTE commit criou (objetos deduplicados já existiam).
      await Promise.all(created.map((target) => fs.rm(target, { force: true })));
      throw err;
    } finally {
      await fs.rm(this.dir, { recursive: true, force: true });
    }
  }

  async discard(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await fs.rm(this.dir, { recursive: true, force: true });
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new DomainError("INVALID_TRANSITION", `Staging ${this.id} já foi finalizada.`, { stagingId: this.id });
    }
  }
}

/** Hard link é atômico e falha com EEXIST; sem suporte (FAT, rede), cai para cópia exclusiva. */
async function linkOrCopyExclusive(src: string, dest: string): Promise<void> {
  try {
    await fs.link(src, dest);
  } catch (err) {
    if (isErrno(err, "EEXIST")) throw err;
    if (isErrno(err, "EPERM") || isErrno(err, "ENOTSUP") || isErrno(err, "EXDEV") || isErrno(err, "ENOSYS")) {
      await fs.copyFile(src, dest, fsConstants.COPYFILE_EXCL);
      return;
    }
    throw err;
  }
}

function isErrno(err: unknown, code: string): boolean {
  return typeof err === "object" && err !== null && (err as NodeJS.ErrnoException).code === code;
}

function storageFailed(action: string, key: string, cause: unknown): DomainError {
  return new DomainError("STORAGE_FAILED", `Falha ao ${action} ${key}.`, { key }, { cause });
}

async function guard<T>(op: () => Promise<T>, action: string, key: string): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (err instanceof DomainError) throw err;
    throw storageFailed(action, key, err);
  }
}

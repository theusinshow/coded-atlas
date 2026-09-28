import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { SessionStateSchema, summarizeSession, type SessionInfo, type SessionState, type SessionStore } from "../../modules/capture/session-store";
import { DomainError } from "../../shared/errors";
import { ProjectIdSchema, type ProjectId } from "../../shared/id";

/**
 * Sessões em `<ATLAS_HOME>/auth/<projectId>.json` (permissão 600 onde o sistema
 * suporta). O nome do arquivo é o ULID validado — nada vindo de fora vira caminho.
 * Separado de `storage/`: não é Asset, não entra em GC de bytes nem em exportação.
 */
export class FileSessionStore implements SessionStore {
  constructor(private readonly root: string) {}

  private file(projectId: ProjectId): string {
    const id = ProjectIdSchema.safeParse(projectId);
    if (!id.success) throw new DomainError("VALIDATION", "Projeto inválido para sessão.");
    return path.join(this.root, `${id.data}.json`);
  }

  async get(projectId: ProjectId): Promise<SessionState | null> {
    let raw: string;
    try {
      raw = await readFile(this.file(projectId), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      json = null;
    }
    const parsed = SessionStateSchema.safeParse(json);
    if (!parsed.success) throw new DomainError("VALIDATION", "A sessão salva está corrompida — faça o login de novo.");
    return parsed.data;
  }

  async info(projectId: ProjectId): Promise<SessionInfo | null> {
    const state = await this.get(projectId);
    if (!state) return null;
    const { mtime } = await stat(this.file(projectId));
    return summarizeSession(state, mtime.toISOString());
  }

  async save(projectId: ProjectId, state: SessionState): Promise<SessionInfo> {
    const valid = SessionStateSchema.parse(state);
    const target = this.file(projectId);
    await mkdir(this.root, { recursive: true });
    const tmp = `${target}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(valid), { mode: 0o600 });
    await rename(tmp, target);
    return summarizeSession(valid, new Date().toISOString());
  }

  async remove(projectId: ProjectId): Promise<boolean> {
    const target = this.file(projectId);
    try {
      await stat(target);
    } catch {
      return false;
    }
    await rm(target, { force: true });
    return true;
  }
}

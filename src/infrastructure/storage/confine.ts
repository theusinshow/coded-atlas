import path from "node:path";
import { promises as fs } from "node:fs";
import { DomainError } from "../../shared/errors";

/**
 * Proteção central de caminhos: resolve `relative` dentro de `root` e recusa
 * qualquer coisa que escape (.., absolutos POSIX/Windows, UNC, drive letters).
 * Toda operação de filesystem da nova fundação passa por aqui.
 */
export function resolveWithin(root: string, relative: string): string {
  if (
    relative.length === 0 ||
    relative.includes("\0") ||
    path.isAbsolute(relative) ||
    path.win32.isAbsolute(relative) ||
    path.posix.isAbsolute(relative) ||
    /^[a-zA-Z]:/.test(relative)
  ) {
    throw outside(root, relative);
  }

  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relative);
  const rel = path.relative(resolvedRoot, target);

  if (rel === "" || rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw outside(root, relative);
  }
  return target;
}

/**
 * Confere, depois de resolver links simbólicos/junctions, que `target` (ou o
 * diretório existente mais próximo dele) continua dentro de `realRoot`.
 * `realRoot` deve ser o realpath da raiz.
 */
export async function assertRealWithin(realRoot: string, target: string): Promise<void> {
  let probe = target;
  for (;;) {
    try {
      const real = await fs.realpath(probe);
      const rel = path.relative(realRoot, real);
      if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
        throw outside(realRoot, target);
      }
      return;
    } catch (err) {
      if (err instanceof DomainError) throw err;
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") {
        throw new DomainError("STORAGE_FAILED", "Falha ao resolver caminho.", { target }, { cause: err });
      }
      const parent = path.dirname(probe);
      if (parent === probe) throw outside(realRoot, target);
      probe = parent; // ainda não existe: sobe até achar um ancestral real
    }
  }
}

function outside(root: string, relative: string): DomainError {
  return new DomainError("PATH_OUTSIDE_ROOT", "Caminho fora da raiz permitida.", { root, relative });
}

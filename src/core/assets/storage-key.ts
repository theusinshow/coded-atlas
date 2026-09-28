import { z } from "zod";
import { DomainError } from "../../shared/errors";
import type { Sha256 } from "../../shared/validation";

/**
 * StorageKey: endereço lógico de um objeto de bytes, relativo à raiz do storage.
 * É o que os registros de domínio guardam — nunca um caminho absoluto.
 *
 * Formato (validado aqui, puro, sem tocar no filesystem):
 *   - segmentos separados por "/", sem "/" inicial/final nem segmento vazio;
 *   - cada segmento: [a-z0-9] nas pontas, [a-z0-9._-] no meio;
 *   - só minúsculas: o NTFS não diferencia caixa, então "A.png" e "a.png"
 *     seriam o mesmo arquivo no Windows;
 *   - sem "..", "\", ":", "%" (nada de traversal, drive letter, ADS ou
 *     traversal codificado) e sem nomes reservados do Windows (con, nul…).
 * A infraestrutura ainda confina o caminho resolvido à raiz (defesa em camadas).
 */
const SEGMENT_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;
export const STORAGE_KEY_MAX_LENGTH = 512;

export function isValidStorageKey(value: string): boolean {
  if (value.length === 0 || value.length > STORAGE_KEY_MAX_LENGTH) return false;
  return value.split("/").every((segment) => {
    if (!SEGMENT_PATTERN.test(segment)) return false;
    if (segment.includes("..")) return false;
    return !WINDOWS_RESERVED.test(segment.split(".")[0]);
  });
}

export const StorageKeySchema = z
  .string()
  .refine(isValidStorageKey, "storage key inválida")
  .brand<"StorageKey">();
export type StorageKey = z.infer<typeof StorageKeySchema>;

/** Valida uma string vinda de fora (input, banco, legado) como StorageKey. */
export function parseStorageKey(value: string): StorageKey {
  const result = StorageKeySchema.safeParse(value);
  if (!result.success) {
    throw new DomainError("INVALID_STORAGE_KEY", `Storage key inválida: "${value}"`);
  }
  return result.data;
}

const EXTENSION_PATTERN = /^[a-z0-9]{1,10}$/;

/**
 * Chave endereçada por conteúdo: `<namespace>/<ab>/<sha256>.<ext>`.
 * Bytes iguais → mesma chave → dedupe natural e imutabilidade por construção.
 */
export function contentStorageKey(namespace: string, sha256: Sha256, extension: string): StorageKey {
  if (!EXTENSION_PATTERN.test(extension)) {
    throw new DomainError("INVALID_STORAGE_KEY", `Extensão inválida para storage key: "${extension}"`);
  }
  return parseStorageKey(`${namespace}/${sha256.slice(0, 2)}/${sha256}.${extension}`);
}

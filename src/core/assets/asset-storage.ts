import type { Sha256 } from "../../shared/validation";
import type { StorageKey } from "./storage-key";

/** Metadados de um objeto de bytes gravado. */
export interface StoredObject {
  key: StorageKey;
  sha256: Sha256;
  byteSize: number;
}

/**
 * Porta de storage de bytes. Código de domínio/aplicação só enxerga StorageKeys;
 * o layout físico (pastas, raiz, disco local ou futuro S3) é da implementação.
 *
 * Objetos são imutáveis: `put` numa chave existente é idempotente se o conteúdo
 * for idêntico (dedupe) e falha com CONFLICT se for diferente — nova versão =
 * nova chave.
 */
export interface AssetStorage {
  put(key: StorageKey, data: Uint8Array): Promise<StoredObject>;
  /** Falha com NOT_FOUND se não existir. */
  get(key: StorageKey): Promise<Uint8Array>;
  /** `null` se não existir. Calcula o SHA-256 do conteúdo atual. */
  stat(key: StorageKey): Promise<StoredObject | null>;
  exists(key: StorageKey): Promise<boolean>;
  copy(from: StorageKey, to: StorageKey): Promise<StoredObject>;
  /** Idempotente: remover chave inexistente não é erro. */
  delete(key: StorageKey): Promise<void>;
  /** Área de staging para geração transacional (stage → validate → commit). */
  beginStaging(): Promise<StagingArea>;
}

/**
 * Objetos gravados na staging ficam invisíveis para `get/exists` até o commit.
 * `commit` publica todos (tudo-ou-nada: se um falhar, os já publicados por este
 * commit são desfeitos); `discard` descarta tudo. Depois de qualquer um dos dois,
 * a área não aceita mais operações.
 */
export interface StagingArea {
  readonly id: string;
  put(key: StorageKey, data: Uint8Array): Promise<StoredObject>;
  commit(): Promise<StoredObject[]>;
  discard(): Promise<void>;
}

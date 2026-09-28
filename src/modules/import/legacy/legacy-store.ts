/**
 * Porta de leitura da pasta de saída do Atlas v1 (`public/generated`).
 * Somente leitura: nenhuma operação grava, move ou apaga arquivos legados.
 * Implementação: src/infrastructure/legacy/generated-dir-store.ts.
 */
export type LegacyCatalogRead =
  | { status: "ok"; raw: unknown }
  | { status: "missing" }
  | { status: "too-large"; byteSize: number }
  | { status: "invalid-json"; reason: string }
  | { status: "unreadable"; reason: string };

export interface LegacyFolder {
  /** Nome da pasta como está no disco (ainda não validado como slug). */
  name: string;
  /** false para arquivos soltos ou links que apontam para fora da raiz. */
  isSafeDirectory: boolean;
}

export interface LegacyStore {
  /** Pastas de projeto candidatas; ignora entradas que começam com "." (.trash, .gitkeep). */
  listFolders(): Promise<LegacyFolder[]>;
  /** Só é chamado com nomes já validados como slug. */
  readCatalog(slug: string): Promise<LegacyCatalogRead>;
  /** `null` se o arquivo não existir. Só é chamado com caminhos já validados. */
  statPublicPath(publicPath: string): Promise<{ byteSize: number } | null>;
  hasCaseDraft(slug: string): Promise<boolean>;
}

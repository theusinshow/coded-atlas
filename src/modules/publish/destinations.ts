/**
 * Destinos de entrega (docs/ROADMAP.md 2.14 → packages, portfolio, GitHub opcional).
 * Recebem arquivos já prontos (caminho relativo + bytes); nunca caminhos de disco
 * vindos de fora. Nenhum destino é acionado sem um pedido explícito do Matheus.
 */
export interface DeliveryFile {
  /** Caminho relativo e seguro (montado pelo Atlas: pastas/nomes sanitizados). */
  path: string;
  bytes: Uint8Array;
}

export interface FolderDestination {
  readonly configured: boolean;
  /** Raiz exibida na UI (Ajustes) — nunca vai para o banco como caminho absoluto. */
  readonly label: string;
  deliver(folder: string, files: readonly DeliveryFile[]): Promise<{ folder: string; files: number }>;
  /** Caminho absoluto de uma entrega, só para exibir ("copiar caminho"). */
  locate(folder: string): string;
  /** O sistema sabe abrir uma pasta no gerenciador de arquivos? */
  readonly canReveal: boolean;
  /** Abre a pasta da entrega no gerenciador de arquivos (confinada à raiz). */
  reveal(folder: string): Promise<void>;
}

export interface GithubDestination {
  readonly configured: boolean;
  /** owner/repo@branch (para a UI). */
  readonly label: string;
  deliver(prefix: string, files: readonly DeliveryFile[], message: string): Promise<{ commitUrl: string; files: number }>;
}

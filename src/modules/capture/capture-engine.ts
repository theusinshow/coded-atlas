/**
 * Porta da engine de captura. A aplicação pede "uma foto deste viewport" e
 * recebe bytes; navegador, contexto e arquivos temporários são da implementação
 * (src/infrastructure/playwright). O `signal` é obrigatório: abortar deve
 * interromper o trabalho real (fechar o navegador) e rejeitar a promessa.
 */
export interface ViewportSpec {
  label: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
}

export interface ViewportShot {
  png: Uint8Array;
  /** Dimensões reais em pixels do PNG (viewport × deviceScaleFactor). */
  width: number;
  height: number;
  /** URL final após redirecionamentos. */
  finalUrl: string;
}

export interface CaptureEngine {
  captureViewport(request: { url: string; viewport: ViewportSpec; signal: AbortSignal }): Promise<ViewportShot>;
}

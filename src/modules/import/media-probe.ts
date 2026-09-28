/**
 * Porta para identificar mídia pelos BYTES (nunca pela extensão ou pelo MIME
 * declarado pelo navegador). Implementação: src/infrastructure/sharp/media-probe.ts.
 */
export interface ProbedMedia {
  mimeType: string;
  extension: string;
  kind: "image" | "video";
  width: number | null;
  height: number | null;
}

export interface MediaProbe {
  /** `null` se os bytes não forem de um formato aceito. */
  probe(bytes: Uint8Array): Promise<ProbedMedia | null>;
}

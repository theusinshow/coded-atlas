import { ZipArchive } from "archiver";

export interface ZipEntry {
  /** Caminho dentro do ZIP (já sanitizado pelo chamador). */
  name: string;
  bytes: Uint8Array;
}

/**
 * Monta um ZIP em memória. Os listeners são ligados ANTES de finalizar (senão
 * pedaços iniciais se perdem). Peças do Atlas são pequenas — memória basta.
 */
export function buildZip(entries: readonly ZipEntry[], level = 6): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level } });
    const chunks: Buffer[] = [];
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    archive.on("error", reject);
    archive.on("warning", reject);
    for (const entry of entries) archive.append(Buffer.from(entry.bytes), { name: entry.name });
    void archive.finalize();
  });
}

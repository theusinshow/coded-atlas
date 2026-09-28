import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import type { Sha256 } from "../../shared/validation";

export function sha256Bytes(data: Uint8Array): Sha256 {
  return createHash("sha256").update(data).digest("hex");
}

/** Hash em streaming — não carrega arquivos grandes (vídeos) na memória. */
export function sha256File(absPath: string): Promise<Sha256> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(absPath)
      .on("error", reject)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")));
  });
}

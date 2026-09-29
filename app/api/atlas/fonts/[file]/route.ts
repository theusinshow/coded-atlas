export const runtime = "nodejs";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fontFiles } from "@/src/render/fonts";
import { DomainError } from "@/src/shared/errors";
import { errorResponse } from "../../_lib/http";

interface Params {
  params: Promise<{ file: string }>;
}

/**
 * Fontes curadas para o preview no navegador — os MESMOS arquivos que o render
 * estático usa. Só nomes da lista fechada (nunca um caminho vindo da URL).
 */
export async function GET(_req: Request, { params }: Params): Promise<Response> {
  try {
    const name = (await params).file;
    const font = fontFiles().find((f) => path.posix.basename(f.file) === name);
    if (!font) throw new DomainError("NOT_FOUND", "Fonte não encontrada.");
    const bytes = await readFile(path.join(process.cwd(), font.file));
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": "font/woff2", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

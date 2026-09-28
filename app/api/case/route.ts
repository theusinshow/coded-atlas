export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import { caseDraftPath } from "@/lib/storage/paths";
import { loadCatalog } from "@/lib/storage/read-catalog";
import { generateCaseDraft } from "@/lib/capture/generate-case";
import { SlugSchema } from "@/src/core/projects/project";

export async function POST(req: NextRequest): Promise<Response> {
  let slug: string;
  try {
    const body = (await req.json()) as { slug: unknown };
    const parsed = SlugSchema.safeParse(typeof body.slug === "string" ? body.slug.trim() : body.slug);
    if (!parsed.success) {
      return Response.json({ error: "slug inválido" }, { status: 400 });
    }
    slug = parsed.data;
  } catch {
    return Response.json({ error: "corpo da requisição inválido" }, { status: 400 });
  }

  const catalog = await loadCatalog(slug);
  if (!catalog) {
    return Response.json({ error: "Catálogo não encontrado. Gere o catálogo primeiro." }, { status: 404 });
  }

  try {
    const mdx = generateCaseDraft(catalog);
    await fs.writeFile(caseDraftPath(slug), mdx, "utf-8");

    console.log(`[atlas:${slug}] case-draft.mdx gerado`);

    return Response.json({ path: `/generated/${slug}/case-draft.mdx` });
  } catch (err) {
    console.error(`[atlas:${slug}]`, err instanceof Error ? err.message : err);
    return Response.json(
      { error: "Não foi possível gerar o rascunho de case." },
      { status: 500 }
    );
  }
}

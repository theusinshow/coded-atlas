export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { loadCatalog } from "@/lib/storage/read-catalog";
import { buildPortfolioManifest } from "@/lib/capture/build-portfolio-manifest";
import { SlugSchema } from "@/src/core/projects/project";

interface Params {
  params: Promise<{ slug: string }>;
}

/**
 * Manifesto de portfólio de um projeto — o contrato que `/cases/[slug]` e a
 * Paisagem Digital consomem. Derivado do catalog.json (sem dados novos).
 * `?download=1` força o salvamento como portfolio.json.
 */
export async function GET(req: NextRequest, { params }: Params): Promise<Response> {
  const { slug } = await params;

  if (!SlugSchema.safeParse(slug).success) {
    return Response.json({ error: "slug inválido" }, { status: 400 });
  }

  const catalog = await loadCatalog(slug);
  if (!catalog) return Response.json({ error: "Projeto não encontrado." }, { status: 404 });

  const manifest = buildPortfolioManifest(catalog);
  const body = JSON.stringify(manifest, null, 2);

  const isDownload = req.nextUrl.searchParams.get("download") === "1";
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
  if (isDownload) {
    headers["Content-Disposition"] = `attachment; filename="portfolio-${slug}.json"`;
  }

  return new Response(body, { headers });
}

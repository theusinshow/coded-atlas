export const runtime = "nodejs";
export const maxDuration = 120;

import { NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import { chromium } from "playwright";
import type { Browser } from "playwright";
import { config } from "@/lib/config";
import { catalogPath, viewportShotPath } from "@/lib/storage/paths";
import { writeJson } from "@/lib/storage/write-json";
import { loadCatalog } from "@/lib/storage/read-catalog";
import { generateShowcase } from "@/lib/capture/generate-showcase";
import type { Catalog } from "@/lib/types";

interface Params {
  params: Promise<{ slug: string }>;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Gera as peças de vitrine (capa, composições, mockups) de um projeto já
 * capturado, a partir dos screenshots de viewport salvos — sem recapturar o
 * site. Atualiza o catalog.json e marca `options.showcase` para o
 * reprocessamento herdar.
 */
export async function POST(_req: NextRequest, { params }: Params): Promise<Response> {
  const { slug } = await params;
  if (!SLUG_PATTERN.test(slug)) {
    return Response.json({ error: "Slug inválido." }, { status: 400 });
  }

  const catalog = await loadCatalog(slug);
  if (!catalog) return Response.json({ error: "Projeto não encontrado." }, { status: 404 });

  const desktopAbs = viewportShotPath(slug, config.viewports.desktop);
  const mobileAbs = viewportShotPath(slug, config.viewports.mobile);
  try {
    await fs.access(desktopAbs);
    await fs.access(mobileAbs);
  } catch {
    return Response.json(
      { error: "Screenshots base não encontrados. Reprocesse as capturas." },
      { status: 400 }
    );
  }

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({
      headless: config.headless,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const showcase = await generateShowcase(
      browser,
      slug,
      { desktopAbs, mobileAbs },
      { url: catalog.project.url, ogImage: catalog.inspection?.ogImage }
    );

    const SHOWCASE_CODES = new Set(["COVER_FAILED", "COVER_FALLBACK", "COMPOSITIONS_FAILED", "MOCKUPS_FAILED", "MOCKUPS_3D_FAILED"]);
    const warnings = [...(catalog.warnings ?? []).filter((w) => !SHOWCASE_CODES.has(w.code)), ...showcase.warnings];
    const updated: Catalog = {
      ...catalog,
      warnings: warnings.length ? warnings : undefined, // undefined some do JSON
      project: {
        ...catalog.project,
        options: { ...catalog.project.options, showcase: true },
      },
      ...(showcase.cover
        ? { cover: { image: showcase.cover.cover, source: showcase.cover.source } }
        : {}),
      ...(showcase.compositions.length ? { compositions: showcase.compositions } : {}),
      ...(showcase.mockups.length ? { mockups: showcase.mockups } : {}),
    };
    await writeJson(catalogPath(slug), updated);

    return Response.json(
      {
        ok: true,
        cover: Boolean(showcase.cover),
        compositions: showcase.compositions.length,
        mockups: showcase.mockups.length,
        warnings: showcase.warnings,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error(`[atlas:${slug}] vitrine falhou:`, err);
    return Response.json({ error: "Não foi possível gerar as peças de vitrine." }, { status: 500 });
  } finally {
    await browser?.close().catch(() => {});
  }
}

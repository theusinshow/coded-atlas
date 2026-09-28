import type { Browser } from "playwright";
import { generateCover, type CoverResult } from "./generate-cover";
import { generateCompositions, type CompositionResult } from "./generate-compositions";
import { generateMockups, type MockupResult } from "./generate-mockups";
import { generateMockups3D } from "../mockup/render-3d";
import type { CatalogWarning } from "../types";
import { warning } from "../warnings";

export interface ShowcaseResult {
  cover?: CoverResult;
  compositions: CompositionResult[];
  mockups: MockupResult[];
  /** Peças que falharam ou usaram fallback — o chamador persiste no catálogo. */
  warnings: CatalogWarning[];
}

/**
 * Peças de vitrine de um projeto: capa, composições para redes e mockups
 * (flat + 3D). Tudo derivado dos screenshots de viewport já capturados — roda
 * na geração (opção `showcase`) ou depois, sob demanda, via /api/showcase.
 * Cada peça é enhancement: falha vira ausência + aviso estruturado, nunca derruba o chamador.
 */
export async function generateShowcase(
  browser: Browser,
  slug: string,
  shots: { desktopAbs: string; mobileAbs: string },
  site: { url: string; ogImage?: string }
): Promise<ShowcaseResult> {
  const desktop = { screenshotAbsPath: shots.desktopAbs };
  const mobile = { screenshotAbsPath: shots.mobileAbs };

  const warnings: CatalogWarning[] = [];

  const cover = await generateCover(slug, shots.desktopAbs, site.url, site.ogImage).catch((err: unknown) => {
    warnings.push(warning("COVER_FAILED", "A capa não pôde ser gerada.", err));
    return undefined;
  });
  if (site.ogImage && cover?.source === "smart-crop") {
    warnings.push(warning("COVER_FALLBACK", "A og:image do site não pôde ser usada; a capa veio do screenshot."));
  }
  const collect = (w: CatalogWarning) => warnings.push(w);
  const compositions = await generateCompositions(slug, desktop, mobile, collect).catch((err: unknown) => {
    warnings.push(warning("COMPOSITIONS_FAILED", "As composições para redes não puderam ser geradas.", err));
    return [];
  });
  const flatMockups = await generateMockups(slug, desktop, mobile, collect).catch((err: unknown) => {
    warnings.push(warning("MOCKUPS_FAILED", "Os mockups com moldura não puderam ser gerados.", err));
    return [];
  });
  const mockups3d = await generateMockups3D(browser, slug, shots.desktopAbs, shots.mobileAbs, collect).catch((err: unknown) => {
    warnings.push(warning("MOCKUPS_3D_FAILED", "Os mockups 3D não puderam ser gerados.", err));
    return [];
  });

  return { cover, compositions, mockups: [...flatMockups, ...mockups3d], warnings };
}

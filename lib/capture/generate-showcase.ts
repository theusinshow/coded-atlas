import type { Browser } from "playwright";
import { generateCover, type CoverResult } from "./generate-cover";
import { generateCompositions, type CompositionResult } from "./generate-compositions";
import { generateMockups, type MockupResult } from "./generate-mockups";
import { generateMockups3D } from "../mockup/render-3d";

export interface ShowcaseResult {
  cover?: CoverResult;
  compositions: CompositionResult[];
  mockups: MockupResult[];
}

/**
 * Peças de vitrine de um projeto: capa, composições para redes e mockups
 * (flat + 3D). Tudo derivado dos screenshots de viewport já capturados — roda
 * na geração (opção `showcase`) ou depois, sob demanda, via /api/showcase.
 * Cada peça é enhancement: falha vira ausência, nunca derruba o chamador.
 */
export async function generateShowcase(
  browser: Browser,
  slug: string,
  shots: { desktopAbs: string; mobileAbs: string },
  site: { url: string; ogImage?: string }
): Promise<ShowcaseResult> {
  const desktop = { screenshotAbsPath: shots.desktopAbs };
  const mobile = { screenshotAbsPath: shots.mobileAbs };

  const cover = await generateCover(slug, shots.desktopAbs, site.url, site.ogImage)
    .catch(() => undefined);
  const compositions = await generateCompositions(slug, desktop, mobile).catch(() => []);
  const flatMockups = await generateMockups(slug, desktop, mobile).catch(() => []);
  const mockups3d = await generateMockups3D(browser, slug, shots.desktopAbs, shots.mobileAbs)
    .catch(() => []);

  return { cover, compositions, mockups: [...flatMockups, ...mockups3d] };
}

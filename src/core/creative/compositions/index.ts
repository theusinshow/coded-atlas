import type { CompositionDefinition } from "../composition";
import { projectClosing, projectReveal, statement, typographyColors } from "./brand";
import { editorialSplit, mobileStack, singleFeature, uiDetailsGrid } from "./editorial";
import { desktopHero, desktopMobile, floatingDevices } from "./showcase";

/** Composições curadas: as 10 iniciais (docs/COMPOSITION-ENGINE.md) + Statement (slides de texto, 2.12). */
export const COMPOSITIONS: readonly CompositionDefinition[] = [
  desktopHero,
  desktopMobile,
  floatingDevices,
  editorialSplit,
  mobileStack,
  uiDetailsGrid,
  singleFeature,
  typographyColors,
  projectReveal,
  projectClosing,
  statement,
];

export function getComposition(id: string): CompositionDefinition | undefined {
  return COMPOSITIONS.find((c) => c.id === id);
}

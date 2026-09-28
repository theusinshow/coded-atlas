import type { CompositionDefinition } from "../composition";
import { projectClosing, projectReveal, typographyColors } from "./brand";
import { editorialSplit, mobileStack, singleFeature, uiDetailsGrid } from "./editorial";
import { desktopHero, desktopMobile, floatingDevices } from "./showcase";

/** As 10 composições curadas iniciais (docs/COMPOSITION-ENGINE.md → Initial compositions). */
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
];

export function getComposition(id: string): CompositionDefinition | undefined {
  return COMPOSITIONS.find((c) => c.id === id);
}

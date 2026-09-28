import type { AssetSlot, TextSlot } from "../composition";

/** Slots recorrentes: descrevem INTENÇÃO; o auto-binding escolhe o material real. */

export const desktopSlot = (id = "desktop", label = "Screenshot desktop", required = true): AssetSlot => ({
  id,
  label,
  type: "asset",
  required,
  prefers: [
    { kinds: ["screenshot"], role: "viewport", device: "desktop" },
    { kinds: ["screenshot"], role: "page-viewport", device: "desktop" },
    { kinds: ["screenshot", "image"] },
  ],
});

export const mobileSlot = (id = "mobile", label = "Screenshot mobile", required = true): AssetSlot => ({
  id,
  label,
  type: "asset",
  required,
  prefers: [
    { kinds: ["screenshot"], role: "viewport", device: "mobile" },
    { kinds: ["section"], device: "mobile" },
    { kinds: ["screenshot"], role: "page-viewport", device: "mobile" },
  ],
});

export const sectionSlot = (id: string, label: string, required = false): AssetSlot => ({
  id,
  label,
  type: "asset",
  required,
  prefers: [
    { kinds: ["section"], device: "desktop" },
    { kinds: ["screenshot"], role: "page-viewport", device: "desktop" },
    { kinds: ["screenshot"], role: "state" },
    { kinds: ["screenshot"], role: "viewport", device: "desktop" },
  ],
});

export const mobileSectionSlot = (id: string, label: string, required = false): AssetSlot => ({
  id,
  label,
  type: "asset",
  required,
  prefers: [
    { kinds: ["section"], device: "mobile" },
    { kinds: ["screenshot"], role: "page-viewport", device: "mobile" },
    { kinds: ["screenshot"], role: "viewport", device: "mobile" },
  ],
});

export const heroImageSlot = (id = "image", label = "Imagem principal", required = false): AssetSlot => ({
  id,
  label,
  type: "asset",
  required,
  prefers: [
    { kinds: ["screenshot"], role: "viewport", device: "desktop" },
    { kinds: ["screenshot"], role: "cover" },
    { kinds: ["screenshot", "image"] },
  ],
});

export const titleSlot = (required = false, maxLength = 90): TextSlot => ({ id: "title", label: "Título", type: "text", required, maxLength, source: "project.name" });
export const labelSlot = (source: TextSlot["source"] = "project.category"): TextSlot => ({ id: "label", label: "Rótulo", type: "text", required: false, maxLength: 60, source });
export const subtitleSlot = (source: TextSlot["source"] = "project.description"): TextSlot => ({ id: "subtitle", label: "Subtítulo", type: "text", required: false, maxLength: 180, source });
export const urlSlot = (): TextSlot => ({ id: "url", label: "Endereço", type: "text", required: false, maxLength: 80, source: "project.url" });
export const creditSlot = (): TextSlot => ({ id: "credit", label: "Crédito", type: "text", required: false, maxLength: 80, source: "atlas.credit" });

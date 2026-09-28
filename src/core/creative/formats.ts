import { z } from "zod";

/** Formatos de saída suportados (docs/MOTION-ENGINE.md → 9:16, 4:5, 1:1, 16:9 + Open Graph). */
export const FORMATS = {
  "post-1x1": { width: 1080, height: 1080, label: "Post 1:1", group: "social" },
  "post-4x5": { width: 1080, height: 1350, label: "Post 4:5", group: "social" },
  "story-9x16": { width: 1080, height: 1920, label: "Story 9:16", group: "social" },
  "landscape-16x9": { width: 1920, height: 1080, label: "Paisagem 16:9", group: "presentation" },
  "og-1.91x1": { width: 1200, height: 630, label: "Capa 1.91:1", group: "web" },
} as const;

export type FormatId = keyof typeof FORMATS;
export const FORMAT_IDS = Object.keys(FORMATS) as FormatId[];
export const FormatIdSchema = z.enum(FORMAT_IDS as [FormatId, ...FormatId[]]);

export function formatSize(id: FormatId): { width: number; height: number } {
  return { width: FORMATS[id].width, height: FORMATS[id].height };
}

import { z } from "zod";

/**
 * Schema de runtime do `catalog.json` do Atlas v1 (versões 0.1.0–0.2.0, features
 * v0.1–v1.7). O formato só cresceu por adição, então um único schema com campos
 * opcionais cobre todas as versões gravadas.
 *
 * Objetos não-estritos: chaves desconhecidas são ignoradas na leitura (o legado
 * pode ter sido editado à mão ou vir de um build intermediário) — o que importa é
 * que os campos usados tenham o tipo certo.
 *
 * Definição congelada: o v1 foi aposentado (3.1.C) e não grava mais catálogos,
 * então este schema é agora a única descrição do formato (antes espelhava
 * `lib/types.ts` com uma asserção de compilação).
 */
const PublicPathSchema = z.string().startsWith("/generated/").max(1024);

const DeviceCaptureSchema = z.object({
  viewport: z.string(),
  screenshot: PublicPathSchema,
  fullpage: PublicPathSchema,
});

const SectionSchema = z.object({
  device: z.enum(["desktop", "mobile"]),
  name: z.string(),
  y: z.number(),
  height: z.number(),
  screenshot: PublicPathSchema,
  heading: z.string().optional(),
  suggestedName: z.string().optional(),
  semanticTag: z.string().optional(),
  sectionId: z.string().optional(),
});

const ProjectInputSchema = z.object({
  url: z.string(),
  name: z.string(),
  slug: z.string(),
  category: z.string(),
  client: z.string().optional(),
  description: z.string().optional(),
  options: z
    .object({
      video: z.boolean().optional(),
      sections: z.boolean().optional(),
      showcase: z.boolean().optional(),
    })
    .optional(),
  pages: z.array(z.string()).optional(),
  states: z.array(z.object({ name: z.string(), selector: z.string() })).optional(),
});

export const LegacyCatalogSchema = z.object({
  version: z.string(),
  project: ProjectInputSchema,
  captures: z.object({ desktop: DeviceCaptureSchema, mobile: DeviceCaptureSchema }),
  thumbnails: z.object({ main: PublicPathSchema, mobile: PublicPathSchema }),
  videos: z.object({ desktop: PublicPathSchema.optional(), mobile: PublicPathSchema.optional() }).optional(),
  sections: z.array(SectionSchema),
  pages: z
    .array(
      z.object({
        path: z.string(),
        url: z.string(),
        desktop: DeviceCaptureSchema,
        mobile: DeviceCaptureSchema,
      })
    )
    .optional(),
  states: z.array(z.object({ name: z.string(), selector: z.string(), screenshot: PublicPathSchema })).optional(),
  inspection: z
    .object({
      colors: z.array(z.string()),
      fonts: z.array(z.string()),
      techStack: z.array(z.string()),
      ogImage: z.string().optional(),
    })
    .optional(),
  cover: z.object({ image: PublicPathSchema, source: z.enum(["og-image", "smart-crop"]) }).optional(),
  compositions: z
    .array(
      z.object({
        name: z.string(),
        label: z.string(),
        width: z.number(),
        height: z.number(),
        image: PublicPathSchema,
      })
    )
    .optional(),
  mockups: z.array(z.object({ name: z.string(), label: z.string(), image: PublicPathSchema })).optional(),
  warnings: z
    .array(
      z.object({
        code: z.enum([
          "COVER_FAILED",
          "COVER_FALLBACK",
          "COMPOSITIONS_FAILED",
          "MOCKUPS_FAILED",
          "MOCKUPS_3D_FAILED",
          "PAGE_CAPTURE_FAILED",
          "STATE_CAPTURE_FAILED",
          "VIDEO_SAVE_FAILED",
          "SECTION_DETECTION_FALLBACK",
          "INSPECTION_FAILED",
          "SCROLL_LIMIT_REACHED",
          "FULLPAGE_TRUNCATED",
        ]),
        message: z.string(),
        device: z.enum(["desktop", "mobile"]).optional(),
        detail: z.string().optional(),
      })
    )
    .optional(),
  meta: z.object({
    captureDelayMs: z.number(),
    navTimeoutMs: z.number(),
    durationMs: z.number(),
    userAgent: z.string(),
  }),
  createdAt: z.string(),
});

export type LegacyCatalog = z.infer<typeof LegacyCatalogSchema>;

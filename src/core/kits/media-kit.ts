import { z } from "zod";
import { ProjectIdSchema, UlidSchema, newId, type ProjectId } from "../../shared/id";
import { TimestampSchema, nowIso, parseOrThrow } from "../../shared/validation";
import { CreativeDirectionSchema } from "../brain/plan";
import { FormatIdSchema, type FormatId } from "../creative/formats";

/**
 * Media Kit (docs/DOMAIN-MODEL.md → MediaKit): entregáveis de um projeto sob UMA
 * Creative Direction (docs/PRINCIPLES.md #5). Presets definem a estrutura; a
 * geração materializa cada item como rascunho editável; o render é em lote.
 */
export type KitItemKind = "composition" | "carousel" | "video";

export interface KitPresetItem {
  id: string;
  label: string;
  kind: KitItemKind;
  formatId: FormatId;
  /** composition: receita preferida + alternativas (a memória pode vetar a primeira). */
  compositions?: readonly string[];
  /** carousel: nº de páginas; video: receita. */
  pages?: number;
  recipeId?: string;
}

export interface KitPreset {
  id: string;
  name: string;
  description: string;
  items: readonly KitPresetItem[];
}

export const KIT_PRESETS: readonly KitPreset[] = [
  {
    id: "launch-kit",
    name: "Kit de lançamento",
    description: "Tudo para anunciar o site no ar: post, carrossel, story, capa de link e reel.",
    items: [
      { id: "post", label: "Post de lançamento", kind: "composition", formatId: "post-4x5", compositions: ["desktop-mobile", "desktop-hero", "floating-devices"] },
      { id: "carousel", label: "Carrossel do projeto", kind: "carousel", formatId: "post-4x5", pages: 5 },
      { id: "story", label: "Story", kind: "composition", formatId: "story-9x16", compositions: ["mobile-stack", "floating-devices", "desktop-mobile"] },
      { id: "cover", label: "Capa de link (Open Graph)", kind: "composition", formatId: "og-1.91x1", compositions: ["desktop-hero", "editorial-split"] },
      { id: "reel", label: "Reel", kind: "video", formatId: "story-9x16", recipeId: "website-reveal-reel" },
    ],
  },
  {
    id: "portfolio-kit",
    name: "Kit de portfólio",
    description: "Peças 16:9 para o portfólio e apresentações, identidade visual e um vídeo vitrine.",
    items: [
      { id: "hero", label: "Destaque 16:9", kind: "composition", formatId: "landscape-16x9", compositions: ["desktop-hero", "floating-devices"] },
      { id: "editorial", label: "Editorial 16:9", kind: "composition", formatId: "landscape-16x9", compositions: ["editorial-split", "single-feature"] },
      { id: "details", label: "Detalhes da interface", kind: "composition", formatId: "landscape-16x9", compositions: ["ui-details-grid", "single-feature"] },
      { id: "identity", label: "Identidade visual", kind: "composition", formatId: "post-4x5", compositions: ["typography-colors", "project-reveal"] },
      { id: "showcase", label: "Vídeo vitrine", kind: "video", formatId: "landscape-16x9", recipeId: "quick-showcase" },
    ],
  },
  {
    id: "social-kit",
    name: "Kit social",
    description: "Presença nas redes em todos os formatos: 1:1, 4:5, 9:16, carrossel e reel mobile.",
    items: [
      { id: "square", label: "Post 1:1", kind: "composition", formatId: "post-1x1", compositions: ["desktop-hero", "desktop-mobile"] },
      { id: "portrait", label: "Post 4:5", kind: "composition", formatId: "post-4x5", compositions: ["editorial-split", "desktop-mobile"] },
      { id: "story", label: "Story", kind: "composition", formatId: "story-9x16", compositions: ["floating-devices", "mobile-stack"] },
      { id: "carousel", label: "Carrossel", kind: "carousel", formatId: "post-4x5", pages: 4 },
      { id: "reel", label: "Reel mobile", kind: "video", formatId: "story-9x16", recipeId: "mobile-first" },
    ],
  },
];

export function getKitPreset(id: string): KitPreset | undefined {
  return KIT_PRESETS.find((p) => p.id === id);
}

export const KitItemSchema = z.strictObject({
  id: z.string().min(1).max(40),
  presetItemId: z.string().min(1).max(40),
  label: z.string().min(1).max(80),
  kind: z.enum(["composition", "carousel", "video"]),
  formatId: FormatIdSchema,
  /** O que materializa o item (instância de composição ou documento). */
  instanceId: z.string().max(40).nullable(),
  documentId: z.string().max(40).nullable(),
  /** Por que o item ficou como está (ex.: alternativa por causa da memória). */
  note: z.string().max(300).nullable(),
});
export type KitItem = z.infer<typeof KitItemSchema>;

export const MediaKitIdSchema = UlidSchema.brand<"MediaKitId">();
export type MediaKitId = z.infer<typeof MediaKitIdSchema>;

export const MediaKitSchema = z.strictObject({
  id: MediaKitIdSchema,
  projectId: ProjectIdSchema,
  name: z.string().trim().min(1).max(120),
  presetId: z.string().min(1).max(40),
  /** Snapshot da direção única do kit (vale para todos os itens). */
  direction: CreativeDirectionSchema,
  directionId: z.string().max(40).nullable(),
  items: z.array(KitItemSchema).min(1).max(12),
  status: z.enum(["ready", "rendering", "rendered", "failed"]),
  lastRenderJobId: z.string().max(40).nullable(),
  visualProfileRevision: z.number().int().positive().nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type MediaKit = z.infer<typeof MediaKitSchema>;

export function createMediaKit(input: Omit<MediaKit, "id" | "status" | "lastRenderJobId" | "createdAt" | "updatedAt">): MediaKit {
  const now = nowIso();
  return parseOrThrow(MediaKitSchema, { ...input, id: newId(), status: "ready", lastRenderJobId: null, createdAt: now, updatedAt: now }, "Media Kit");
}

export interface MediaKitRepository {
  create(kit: MediaKit): Promise<MediaKit>;
  getById(id: MediaKitId): Promise<MediaKit | null>;
  listByProject(projectId: ProjectId): Promise<MediaKit[]>;
  update(kit: MediaKit): Promise<MediaKit>;
  delete(id: MediaKitId): Promise<void>;
}

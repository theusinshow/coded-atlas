import { z } from "zod";
import type { AssetKind } from "../assets/asset";
import type { ArtboardInput } from "../documents/artboard";
import { AssetIdSchema, ProjectIdSchema, UlidSchema } from "../../shared/id";
import { TimestampSchema } from "../../shared/validation";
import { FormatIdSchema, type FormatId } from "./formats";
import { StyleModeSchema } from "./tokens";

/**
 * Composition Engine (docs/COMPOSITION-ENGINE.md). Uma CompositionDefinition é
 * uma receita curada e versionada: slots (intenção, não assets), variantes,
 * formatos, capacidades e uma função `build` pura que monta o Artboard.
 * A IA (2.6) escolhe ENTRE estas receitas — não inventa layout.
 */
export type CompositionFamily = "showcase" | "mobile" | "editorial" | "feature" | "detail" | "typography" | "intro" | "outro";

export interface AssetSlot {
  id: string;
  label: string;
  type: "asset";
  required: boolean;
  /** Preferência de material em ordem (o auto-binding tenta cada uma). */
  prefers: { kinds: readonly AssetKind[]; role?: string; device?: "desktop" | "mobile" }[];
}

export interface TextSlot {
  id: string;
  label: string;
  type: "text";
  required: boolean;
  maxLength: number;
  /** De onde vem o texto padrão. */
  source: "project.name" | "project.category" | "project.client" | "project.description" | "project.url" | "atlas.credit" | "none";
}

export type SlotDefinition = AssetSlot | TextSlot;

export interface ResolvedAsset {
  id: string;
  width: number;
  height: number;
}

export interface BuildContext {
  width: number;
  height: number;
  variant: string;
  assets: Record<string, ResolvedAsset | null>;
  texts: Record<string, string>;
  palette: readonly string[];
  fonts: readonly string[];
}

export interface CompositionDefinition {
  id: string;
  version: number;
  name: string;
  family: CompositionFamily;
  description: string;
  formats: readonly FormatId[];
  slots: readonly SlotDefinition[];
  variants: readonly { id: string; label: string }[];
  capabilities: { motion: boolean; text: boolean; brandAdaptation: boolean; minAssets: number; maxAssets: number };
  build(ctx: BuildContext): ArtboardInput;
}

/** Valor ligado a um slot: um asset real ou um texto. */
export const BindingSchema = z.union([z.strictObject({ assetId: AssetIdSchema.nullable() }), z.strictObject({ text: z.string().max(500) })]);
export type Binding = z.infer<typeof BindingSchema>;

export const CompositionInstanceIdSchema = UlidSchema.brand<"CompositionInstanceId">();
export type CompositionInstanceId = z.infer<typeof CompositionInstanceIdSchema>;

/**
 * CompositionInstance: uma definição ligada ao material real de um projeto.
 * Guarda a versão da receita e a revisão do VisualProfile usadas (snapshot rule).
 */
export const CompositionInstanceSchema = z.strictObject({
  id: CompositionInstanceIdSchema,
  projectId: ProjectIdSchema,
  name: z.string().trim().min(1).max(120),
  compositionId: z.string().min(1).max(60),
  compositionVersion: z.number().int().positive(),
  variant: z.string().min(1).max(40),
  formatId: FormatIdSchema,
  styleMode: StyleModeSchema,
  bindings: z.record(z.string().min(1).max(40), BindingSchema),
  /** Ajustes pequenos sem precisar de Canvas (cor de destaque). */
  overrides: z.strictObject({ primary: z.string().regex(/^#[0-9a-f]{6}$/).optional() }),
  visualProfileRevision: z.number().int().positive().nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type CompositionInstance = z.infer<typeof CompositionInstanceSchema>;

export interface CompositionInstanceRepository {
  create(instance: CompositionInstance): Promise<CompositionInstance>;
  getById(id: CompositionInstanceId): Promise<CompositionInstance | null>;
  listByProject(projectId: z.infer<typeof ProjectIdSchema>): Promise<CompositionInstance[]>;
  update(instance: CompositionInstance): Promise<CompositionInstance>;
  delete(id: CompositionInstanceId): Promise<void>;
}

import { z } from "zod";
import { newId, AssetIdSchema, CaptureIdSchema, ProjectIdSchema } from "../../shared/id";
import { Sha256Schema, TimestampSchema, nowIso, parseOrThrow } from "../../shared/validation";
import { StorageKeySchema } from "./storage-key";

/**
 * Asset: material criativo reutilizável. Imutável — bytes nunca mudam depois de
 * gravados; uma transformação gera um Asset novo que aponta para o original via
 * `parentAssetId` (linhagem). Por isso não há `updatedAt` nem update no repositório.
 */
export const AssetKindSchema = z.enum([
  "image",
  "screenshot",
  "section",
  "logo",
  "icon",
  "video",
  "motion-clip",
  "font",
  "illustration",
  "background",
  "document",
]);
export type AssetKind = z.infer<typeof AssetKindSchema>;

const MimeTypeSchema = z.string().regex(/^[a-z]+\/[a-z0-9.+-]+$/, "MIME type inválido");
const DimensionSchema = z.number().int().positive().max(100_000);

export const AssetSchema = z.strictObject({
  id: AssetIdSchema,
  projectId: ProjectIdSchema,
  kind: AssetKindSchema,
  storageKey: StorageKeySchema,
  sha256: Sha256Schema,
  mimeType: MimeTypeSchema,
  byteSize: z.number().int().nonnegative(),
  width: DimensionSchema.nullable(),
  height: DimensionSchema.nullable(),
  parentAssetId: AssetIdSchema.nullable(),
  captureId: CaptureIdSchema.nullable(),
  label: z.string().trim().min(1).max(200).nullable(),
  createdAt: TimestampSchema,
});
export type Asset = z.infer<typeof AssetSchema>;

export type NewAssetInput = Omit<Asset, "id" | "createdAt" | "width" | "height" | "parentAssetId" | "captureId" | "label"> &
  Partial<Pick<Asset, "width" | "height" | "parentAssetId" | "captureId" | "label">>;

export function createAsset(input: NewAssetInput): Asset {
  return parseOrThrow(
    AssetSchema,
    {
      width: null,
      height: null,
      parentAssetId: null,
      captureId: null,
      label: null,
      ...input,
      id: newId(),
      createdAt: nowIso(),
    },
    "Asset"
  );
}

/**
 * Relação não-linear entre assets (a linhagem direta usa `parentAssetId`).
 */
export const AssetRelationTypeSchema = z.enum(["thumbnail-of", "variant-of"]);
export type AssetRelationType = z.infer<typeof AssetRelationTypeSchema>;

export const AssetRelationSchema = z
  .strictObject({
    fromAssetId: AssetIdSchema,
    toAssetId: AssetIdSchema,
    type: AssetRelationTypeSchema,
    createdAt: TimestampSchema,
  })
  .refine((r) => r.fromAssetId !== r.toAssetId, { message: "Asset não pode se relacionar consigo mesmo" });
export type AssetRelation = z.infer<typeof AssetRelationSchema>;

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
  "audio",
  "motion-clip",
  "font",
  "illustration",
  "background",
  "document",
]);
export type AssetKind = z.infer<typeof AssetKindSchema>;

/**
 * Metadados descritivos do asset (JSON validado). Servem para filtrar e escolher
 * material — nunca para localizar bytes (isso é a storageKey).
 */
export const AssetMetadataSchema = z.strictObject({
  device: z.enum(["desktop", "mobile"]).optional(),
  role: z.string().min(1).max(40).optional(),         // viewport | fullpage | section | page | state | thumbnail | cover | upload…
  viewport: z.string().max(20).optional(),             // "1440x900"
  sectionName: z.string().max(120).optional(),
  sectionIndex: z.number().int().nonnegative().optional(),
  scrollY: z.number().nonnegative().optional(),
  pagePath: z.string().max(500).optional(),
  stateName: z.string().max(120).optional(),
  origin: z.enum(["capture", "upload", "legacy", "derived"]).optional(),
  legacyPath: z.string().max(1024).optional(),         // /generated/... de onde veio (importação v1)
  originalName: z.string().max(255).optional(),        // nome do arquivo enviado
  comparedTo: z.string().max(40).optional(),           // diff visual: Asset "antes" (o "depois" é o parentAssetId)
  changedPercent: z.number().min(0).max(100).optional(), // diff visual: % de pixels alterados
});
export type AssetMetadata = z.infer<typeof AssetMetadataSchema>;

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
  metadata: AssetMetadataSchema,
  createdAt: TimestampSchema,
});
export type Asset = z.infer<typeof AssetSchema>;

export type NewAssetInput = Omit<Asset, "id" | "createdAt" | "width" | "height" | "parentAssetId" | "captureId" | "label" | "metadata"> &
  Partial<Pick<Asset, "width" | "height" | "parentAssetId" | "captureId" | "label" | "metadata">>;

export function createAsset(input: NewAssetInput): Asset {
  return parseOrThrow(
    AssetSchema,
    {
      width: null,
      height: null,
      parentAssetId: null,
      captureId: null,
      label: null,
      metadata: {},
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

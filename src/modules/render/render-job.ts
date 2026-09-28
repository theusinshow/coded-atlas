import { createHash } from "node:crypto";
import { z } from "zod";
import type { AssetStorage } from "../../core/assets/asset-storage";
import { createOutput, type Output } from "../../core/assets/output";
import type { AssetRepository, OutputRepository } from "../../core/assets/repositories";
import { contentStorageKey } from "../../core/assets/storage-key";
import type { Artboard } from "../../core/documents/artboard";
import { CreativeDocumentIdSchema, type CreativeDocumentId, type CreativeDocumentRepository } from "../../core/documents/creative-document";
import { artboardAssetIds } from "../../core/documents/artboard";
import { CompositionInstanceIdSchema, type CompositionInstanceRepository } from "../../core/creative/composition";
import { getComposition } from "../../core/creative/compositions";
import { FORMATS } from "../../core/creative/formats";
import { buildArtboard } from "../../core/creative/instance-artboard";
import { resolveTokens, type StyleTokens } from "../../core/creative/tokens";
import type { VisualProfileRepository } from "../../core/creative/visual-profile";
import type { ProjectId } from "../../shared/id";
import { DomainError } from "../../shared/errors";
import { AssetIdSchema, JobIdSchema } from "../../shared/id";
import { parseOrThrow } from "../../shared/validation";
import type { JobContext, JobHandler } from "../../workers/job-worker";
import type { OutputMetadata } from "../../core/assets/output";
import type { RasterFormat, StaticRenderer } from "./static-renderer";

export const RasterFormatSchema = z.enum(["png", "jpg", "webp"]);

/** O que renderizar: uma composição (estado atual) ou uma revisão CONCRETA de um documento. */
export const RenderTargetSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("composition"), instanceId: CompositionInstanceIdSchema }),
  z.strictObject({ kind: z.literal("document"), documentId: CreativeDocumentIdSchema, revision: z.number().int().positive() }),
]);

export const RenderJobPayloadSchema = z.strictObject({
  target: RenderTargetSchema,
  formats: z.array(RasterFormatSchema).min(1).max(3),
});
export type RenderJobPayload = z.infer<typeof RenderJobPayloadSchema>;

export interface RenderDeps {
  compositionInstances: CompositionInstanceRepository;
  documents: CreativeDocumentRepository;
  assets: AssetRepository;
  outputs: OutputRepository;
  visualProfiles: VisualProfileRepository;
  storage: AssetStorage;
  renderer: StaticRenderer;
}

export interface RenderUnit {
  projectId: ProjectId;
  artboard: Artboard;
  tokens: StyleTokens;
  label: string;
  metadata: OutputMetadata;
}

/** Resolve um alvo de render em artboard + tokens + rótulo, a partir do estado persistido. */
async function resolveTarget(deps: RenderDeps, target: RenderJobPayload["target"]): Promise<RenderUnit[]> {
  if (target.kind === "document") return resolveDocument(deps, target.documentId, target.revision);
  const instance = await deps.compositionInstances.getById(target.instanceId);
  if (!instance) throw new DomainError("NOT_FOUND", "Composição não encontrada.");
  const definition = getComposition(instance.compositionId);
  if (!definition) throw new DomainError("NOT_FOUND", `Receita de composição "${instance.compositionId}" não existe mais.`);
  const profile =
    (instance.visualProfileRevision ? await deps.visualProfiles.getRevision(instance.projectId, instance.visualProfileRevision) : null) ??
    (await deps.visualProfiles.latest(instance.projectId));
  const assets = await deps.assets.listByProject(instance.projectId);
  const artboard = buildArtboard(definition, instance, new Map<string, (typeof assets)[number]>(assets.map((a) => [a.id, a])), profile);
  return [
    {
      projectId: instance.projectId,
      artboard,
      tokens: resolveTokens(profile, instance.styleMode, instance.overrides),
      label: `${instance.name} · ${FORMATS[instance.formatId].label}`,
      metadata: {
        origin: "render",
        compositionId: instance.compositionId,
        compositionVersion: definition.version,
        instanceId: instance.id,
        formatId: instance.formatId,
        variant: instance.variant,
        styleMode: instance.styleMode,
      },
    },
  ];
}

async function resolveDocument(deps: RenderDeps, documentId: CreativeDocumentId, revisionNumber: number): Promise<RenderUnit[]> {
  const document = await deps.documents.getById(documentId);
  if (!document) throw new DomainError("NOT_FOUND", "Documento não encontrado.");
  const revision = await deps.documents.getRevision(document.id, revisionNumber);
  if (!revision) throw new DomainError("NOT_FOUND", `Revisão ${revisionNumber} do documento não existe.`);
  const { artboard, style, formatId } = revision.content;
  const profile = style.profileRevision ? await deps.visualProfiles.getRevision(document.projectId, style.profileRevision) : null;
  return [
    {
      projectId: document.projectId,
      artboard,
      tokens: resolveTokens(profile, style.mode, style.primary ? { primary: style.primary } : {}),
      label: `${document.name} · rev ${revision.revision}`,
      metadata: {
        origin: "render",
        documentId: document.id,
        documentRevision: revision.revision,
        ...(formatId ? { formatId } : {}),
        styleMode: style.mode,
        ...(document.source.compositionId ? { compositionId: document.source.compositionId } : {}),
      },
    },
  ];
}

/**
 * Renderiza unidades e grava Outputs (imutáveis): staging → commit → registros.
 * Usado pelo job de render e, depois, pelo lote do Media Kit.
 */
export async function renderUnits(deps: RenderDeps, ctx: JobContext, units: RenderUnit[], formats: readonly RasterFormat[]): Promise<Output[]> {
  const assetCache = new Map<string, { bytes: Uint8Array; mimeType: string } | null>();
  const results = await deps.renderer.renderBatch(
    units.map((u) => ({ artboard: u.artboard, tokens: u.tokens, formats })),
    {
      signal: ctx.signal,
      loadAsset: async (id) => {
        if (!assetCache.has(id)) {
          const parsed = AssetIdSchema.safeParse(id);
          const asset = parsed.success ? await deps.assets.getById(parsed.data) : null;
          assetCache.set(id, asset ? { bytes: await deps.storage.get(asset.storageKey), mimeType: asset.mimeType } : null);
        }
        return assetCache.get(id) ?? null;
      },
    }
  );
  ctx.throwIfAborted();

  const staging = await deps.storage.beginStaging();
  const staged: { unit: RenderUnit; image: (typeof results)[number][number]; key: ReturnType<typeof contentStorageKey>; sha256: string }[] = [];
  try {
    results.forEach((images, i) => {
      for (const image of images) {
        const sha256 = createHash("sha256").update(image.bytes).digest("hex");
        staged.push({ unit: units[i], image, key: contentStorageKey("renders", sha256, image.extension), sha256 });
      }
    });
    for (const s of staged) await staging.put(s.key, s.image.bytes);
    ctx.throwIfAborted();
    await staging.commit();
  } catch (err) {
    await staging.discard();
    throw err;
  }

  const outputs: Output[] = [];
  for (const s of staged) {
    outputs.push(
      await deps.outputs.create(
        createOutput({
          projectId: s.unit.projectId,
          jobId: JobIdSchema.parse(ctx.job.id),
          format: s.image.format,
          mimeType: s.image.mimeType,
          storageKey: s.key,
          sha256: s.sha256,
          byteSize: s.image.bytes.byteLength,
          width: s.image.width,
          height: s.image.height,
          label: s.unit.label.slice(0, 200),
          sourceAssetIds: artboardAssetIds(s.unit.artboard).map((id) => AssetIdSchema.parse(id)),
          metadata: s.unit.metadata,
        })
      )
    );
  }
  return outputs;
}

export function createRenderJobHandler(deps: RenderDeps): JobHandler {
  return {
    timeoutMs: 10 * 60_000,
    run: async (ctx) => {
      const payload = parseOrThrow(RenderJobPayloadSchema, ctx.job.payload, "Payload do render");
      await ctx.progress(5, "Montando a peça…");
      const units = await resolveTarget(deps, payload.target);
      await ctx.progress(20, "Renderizando…");
      const outputs = await renderUnits(deps, ctx, units, payload.formats);
      return { outputIds: outputs.map((o) => o.id), count: outputs.length };
    },
  };
}

import { createHash } from "node:crypto";
import { z } from "zod";
import type { AssetStorage } from "../../core/assets/asset-storage";
import { createOutput, type Output } from "../../core/assets/output";
import type { AssetRepository, OutputRepository } from "../../core/assets/repositories";
import { contentStorageKey } from "../../core/assets/storage-key";
import type { Artboard } from "../../core/documents/artboard";
import { CreativeDocumentIdSchema, contentAssetIds, contentPages, isCase, isMotion, isPresentation, isSequence, type CreativeDocumentId, type CreativeDocumentRepository } from "../../core/documents/creative-document";
import { EXPORT_MIME, type DocumentExporter } from "./document-exporter";
import type { CaseExporter, CaseOutputKind } from "./case-exporter";
import { caseAssetIds } from "../../core/case/case-document";
import { artboardAssetIds } from "../../core/documents/artboard";
import { CompositionInstanceIdSchema, type CompositionInstanceRepository } from "../../core/creative/composition";
import { getComposition } from "../../core/creative/compositions";
import { FORMATS } from "../../core/creative/formats";
import { buildArtboard } from "../../core/creative/instance-artboard";
import { resolveTokens, type StyleTokens } from "../../core/creative/tokens";
import type { VisualProfileRepository } from "../../core/creative/visual-profile";
import type { ProjectId } from "../../shared/id";
import { DomainError } from "../../shared/errors";
import { AssetIdSchema, JobIdSchema, OutputIdSchema } from "../../shared/id";
import { parseOrThrow } from "../../shared/validation";
import type { JobContext, JobHandler } from "../../workers/job-worker";
import type { OutputMetadata } from "../../core/assets/output";
import { MediaKitIdSchema, type MediaKitId, type MediaKitRepository } from "../../core/kits/media-kit";
import type { MotionRenderer, VideoFormat, VideoQuality } from "./motion-renderer";
import type { RasterFormat, StaticRenderer } from "./static-renderer";

export const RasterFormatSchema = z.enum(["png", "jpg", "webp"]);
export const VideoFormatSchema = z.enum(["mp4", "webm"]);
export const ExportFormatSchema = z.enum(["pdf", "pptx"]);
/** Formatos pedidos a um render: imagens, vídeo (só motion) e arquivos de documento (PDF/PPTX). */
/** `zip` = pacote web do case (index.html + assets). */
export const RenderFormatSchema = z.union([RasterFormatSchema, VideoFormatSchema, ExportFormatSchema, z.literal("zip")]);
export type RenderFormat = z.infer<typeof RenderFormatSchema>;
type ExportFormat = z.infer<typeof ExportFormatSchema>;
const isVideoFormat = (f: RenderFormat): f is VideoFormat => f === "mp4" || f === "webm";
const isExportFormat = (f: RenderFormat): f is ExportFormat => f === "pdf" || f === "pptx";

/** O que renderizar: uma composição (estado atual) ou uma revisão CONCRETA de um documento. */
export const RenderTargetSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("composition"), instanceId: CompositionInstanceIdSchema }),
  z.strictObject({ kind: z.literal("document"), documentId: CreativeDocumentIdSchema, revision: z.number().int().positive() }),
  /** Media Kit inteiro: cada item na revisão atual (fixada), tudo marcado com o kit. */
  z.strictObject({ kind: z.literal("kit"), kitId: MediaKitIdSchema }),
]);

export const RenderJobPayloadSchema = z.strictObject({
  target: RenderTargetSchema,
  formats: z.array(RenderFormatSchema).min(1).max(5),
  /** Vídeo: preview rápido ou final (padrão). */
  quality: z.enum(["preview", "final"]).optional(),
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
  /** Ausente = este processo não renderiza vídeo (ex.: testes só de imagem). */
  motionRenderer?: MotionRenderer;
  kits?: MediaKitRepository;
  /** PDF/PPTX a partir das páginas renderizadas. */
  exporter?: DocumentExporter;
  /** Web/PDF/módulos do Case Builder. */
  caseExporter?: CaseExporter;
}

export interface RenderUnit {
  projectId: ProjectId;
  artboard: Artboard;
  tokens: StyleTokens;
  label: string;
  metadata: OutputMetadata;
}

/** Resolve um alvo de render em artboard + tokens + rótulo, a partir do estado persistido. */
async function resolveTarget(deps: RenderDeps, target: Exclude<RenderJobPayload["target"], { kind: "kit" }>): Promise<RenderUnit[]> {
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
  const { style, formatId } = revision.content;
  const profile = style.profileRevision ? await deps.visualProfiles.getRevision(document.projectId, style.profileRevision) : null;
  const tokens = resolveTokens(profile, style.mode, style.primary ? { primary: style.primary } : {});
  const pages = contentPages(revision.content);
  const multi = isSequence(revision.content);
  // Carrossel: uma peça por página, na ordem (page = índice, rótulo com n/total).
  return pages.map((page, index) => ({
    projectId: document.projectId,
    artboard: page.artboard,
    tokens,
    label: multi ? `${document.name} · ${String(index + 1).padStart(2, "0")}/${String(pages.length).padStart(2, "0")}${page.title ? ` ${page.title}` : ""} · rev ${revision.revision}` : `${document.name} · rev ${revision.revision}`,
    metadata: {
      origin: "render" as const,
      documentId: document.id,
      documentRevision: revision.revision,
      ...(multi ? { page: index } : {}),
      ...(formatId ? { formatId } : {}),
      styleMode: style.mode,
      ...(document.source.compositionId ? { compositionId: document.source.compositionId } : {}),
    },
  }));
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

async function loadAssetBytes(deps: RenderDeps, cache: Map<string, { bytes: Uint8Array; mimeType: string } | null>, id: string) {
  if (!cache.has(id)) {
    const parsed = AssetIdSchema.safeParse(id);
    const asset = parsed.success ? await deps.assets.getById(parsed.data) : null;
    cache.set(id, asset ? { bytes: await deps.storage.get(asset.storageKey), mimeType: asset.mimeType } : null);
  }
  return cache.get(id) ?? null;
}

/**
 * Vídeo de uma revisão concreta de um documento de motion: um Output por formato
 * (MP4/WebM), com duração, dimensões e qualidade no metadata.
 */
async function renderVideos(deps: RenderDeps, ctx: JobContext, target: RenderJobPayload["target"], formats: VideoFormat[], quality: VideoQuality, extra: Partial<OutputMetadata> = {}): Promise<Output[]> {
  if (!deps.motionRenderer) throw new DomainError("VALIDATION", "Este processo não tem renderer de vídeo configurado.");
  if (target.kind !== "document") throw new DomainError("VALIDATION", "Vídeo só sai de documentos de motion.");
  const document = await deps.documents.getById(target.documentId);
  if (!document) throw new DomainError("NOT_FOUND", "Documento não encontrado.");
  const revision = await deps.documents.getRevision(document.id, target.revision);
  if (!revision) throw new DomainError("NOT_FOUND", `Revisão ${target.revision} do documento não existe.`);
  if (!isMotion(revision.content)) throw new DomainError("VALIDATION", "Este documento não é um vídeo — use Animar para criar um.");
  const content = revision.content;
  const profile = content.style.profileRevision ? await deps.visualProfiles.getRevision(document.projectId, content.style.profileRevision) : null;
  const tokens = resolveTokens(profile, content.style.mode, content.style.primary ? { primary: content.style.primary } : {});

  const assetIds = contentAssetIds(content);
  const videoAssetIds: string[] = [];
  for (const id of assetIds) {
    const parsed = AssetIdSchema.safeParse(id);
    const asset = parsed.success ? await deps.assets.getById(parsed.data) : null;
    if (asset?.mimeType.startsWith("video/")) videoAssetIds.push(asset.id);
  }
  let audio: { bytes: Uint8Array; mimeType: string; volume: number; fadeOutMs: number } | null = null;
  if (content.audio) {
    const parsed = AssetIdSchema.safeParse(content.audio.assetId);
    const asset = parsed.success ? await deps.assets.getById(parsed.data) : null;
    if (!asset || asset.projectId !== document.projectId || !asset.mimeType.startsWith("audio/")) throw new DomainError("VALIDATION", "A trilha do vídeo não é um áudio deste projeto.");
    audio = { bytes: await deps.storage.get(asset.storageKey), mimeType: asset.mimeType, volume: content.audio.volume, fadeOutMs: content.audio.fadeOutMs };
  }

  const cache = new Map<string, { bytes: Uint8Array; mimeType: string } | null>();
  const rendered = [];
  for (const [index, format] of formats.entries()) {
    const base = 20 + (index * 75) / formats.length;
    const span = 75 / formats.length;
    rendered.push(
      await deps.motionRenderer.render(
        { content, tokens, format, quality, videoAssetIds, audio },
        {
          signal: ctx.signal,
          loadAsset: (id) => loadAssetBytes(deps, cache, id),
          onProgress: (ratio) => ctx.progress(Math.min(95, Math.round(base + ratio * span)), `Gerando ${format.toUpperCase()}… ${Math.round(ratio * 100)}%`),
        }
      )
    );
    ctx.throwIfAborted();
  }

  const staging = await deps.storage.beginStaging();
  const staged = rendered.map((video) => {
    const sha256 = createHash("sha256").update(video.bytes).digest("hex");
    return { video, sha256, key: contentStorageKey("renders", sha256, video.extension) };
  });
  try {
    for (const s of staged) await staging.put(s.key, s.video.bytes);
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
          projectId: document.projectId,
          jobId: JobIdSchema.parse(ctx.job.id),
          format: s.video.format,
          mimeType: s.video.mimeType,
          storageKey: s.key,
          sha256: s.sha256,
          byteSize: s.video.bytes.byteLength,
          width: s.video.width,
          height: s.video.height,
          durationMs: s.video.durationMs,
          label: `${document.name} · ${quality === "preview" ? "preview" : "vídeo"} · rev ${revision.revision}`.slice(0, 200),
          sourceAssetIds: assetIds.map((id) => AssetIdSchema.parse(id)),
          metadata: {
            origin: "render",
            documentId: document.id,
            documentRevision: revision.revision,
            ...(content.formatId ? { formatId: content.formatId } : {}),
            styleMode: content.style.mode,
            quality,
            ...extra,
          },
        })
      )
    );
  }
  return outputs;
}

/**
 * Render em lote de um Media Kit: todas as peças estáticas num único navegador,
 * depois os vídeos. Documentos rendem na revisão atual, que é fixada. Sem vídeo
 * pedido, os itens de vídeo saem como pôsteres por cena.
 */
async function renderKit(deps: RenderDeps, ctx: JobContext, kitId: MediaKitId, raster: RasterFormat[], video: VideoFormat[], quality: VideoQuality): Promise<Output[]> {
  if (!deps.kits) throw new DomainError("VALIDATION", "Este processo não conhece Media Kits.");
  const kit = await deps.kits.getById(kitId);
  if (!kit) throw new DomainError("NOT_FOUND", "Media Kit não encontrado.");
  try {
    const units: RenderUnit[] = [];
    const videoTargets: { target: RenderJobPayload["target"]; item: string }[] = [];
    for (const item of kit.items) {
      const tag = (u: RenderUnit): RenderUnit => ({ ...u, metadata: { ...u.metadata, mediaKitId: kit.id, kitItemId: item.id } });
      if (item.instanceId) {
        units.push(...(await resolveTarget(deps, { kind: "composition", instanceId: CompositionInstanceIdSchema.parse(item.instanceId) })).map(tag));
      } else if (item.documentId) {
        const document = await deps.documents.getById(CreativeDocumentIdSchema.parse(item.documentId));
        if (!document) continue; // item apagado pelo usuário depois de gerado
        await deps.documents.pin(document.id, document.headRevision);
        const target = { kind: "document" as const, documentId: document.id, revision: document.headRevision };
        if (document.kind === "motion" && video.length > 0) videoTargets.push({ target, item: item.id });
        else units.push(...(await resolveDocument(deps, document.id, document.headRevision)).map(tag));
      }
    }
    await ctx.progress(10, `Renderizando ${units.length} peça(s)${videoTargets.length ? ` e ${videoTargets.length} vídeo(s)` : ""}…`);
    const outputs = units.length > 0 && raster.length > 0 ? await renderUnits(deps, ctx, units, raster) : [];
    for (const v of videoTargets) outputs.push(...(await renderVideos(deps, ctx, v.target, video, quality, { mediaKitId: kit.id, kitItemId: v.item })));
    await deps.kits.update({ ...kit, status: "rendered", lastRenderJobId: ctx.job.id });
    return outputs;
  } catch (err) {
    await deps.kits.update({ ...kit, status: "failed", lastRenderJobId: ctx.job.id }).catch(() => undefined);
    throw err;
  }
}

/**
 * PDF/PPTX de uma revisão concreta: as páginas saem do MESMO renderer estático
 * (JPEG de alta qualidade) e o exportador monta o arquivo. Slides levam notas.
 */
async function renderExports(deps: RenderDeps, ctx: JobContext, target: RenderJobPayload["target"], formats: ExportFormat[]): Promise<Output[]> {
  if (!deps.exporter) throw new DomainError("VALIDATION", "Este processo não tem exportador de PDF/PPTX configurado.");
  if (target.kind !== "document") throw new DomainError("VALIDATION", "PDF e PPTX saem de documentos (canvas, carrossel, apresentação).");
  const document = await deps.documents.getById(target.documentId);
  if (!document) throw new DomainError("NOT_FOUND", "Documento não encontrado.");
  const revision = await deps.documents.getRevision(document.id, target.revision);
  if (!revision) throw new DomainError("NOT_FOUND", `Revisão ${target.revision} do documento não existe.`);
  const units = await resolveDocument(deps, document.id, revision.revision);
  const cache = new Map<string, { bytes: Uint8Array; mimeType: string } | null>();
  await ctx.progress(30, `Renderizando ${units.length} página(s) para ${formats.map((f) => f.toUpperCase()).join(" e ")}…`);
  const images = await deps.renderer.renderBatch(
    units.map((u) => ({ artboard: u.artboard, tokens: u.tokens, formats: ["jpg"] as const })),
    { signal: ctx.signal, loadAsset: (id) => loadAssetBytes(deps, cache, id) }
  );
  ctx.throwIfAborted();
  const notes = isPresentation(revision.content) ? revision.content.slides.map((s) => s.notes) : [];
  const titles = contentPages(revision.content).map((p) => p.title);
  const pages = images.map(([image], i) => ({ bytes: image.bytes, mimeType: "image/jpeg" as const, width: image.width, height: image.height, title: titles[i], notes: notes[i] }));
  const meta = { title: document.name, author: "Coded by M", subject: "Coded Atlas" };
  await ctx.progress(80, "Montando o arquivo…");
  const files: { format: ExportFormat; bytes: Uint8Array }[] = [];
  for (const format of formats) files.push({ format, bytes: format === "pdf" ? await deps.exporter.toPdf(pages, meta) : await deps.exporter.toPptx(pages, meta) });

  const staging = await deps.storage.beginStaging();
  const staged = files.map((f) => {
    const sha256 = createHash("sha256").update(f.bytes).digest("hex");
    return { ...f, sha256, key: contentStorageKey("renders", sha256, f.format) };
  });
  try {
    for (const s of staged) await staging.put(s.key, s.bytes);
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
          projectId: document.projectId,
          jobId: JobIdSchema.parse(ctx.job.id),
          format: s.format,
          mimeType: EXPORT_MIME[s.format],
          storageKey: s.key,
          sha256: s.sha256,
          byteSize: s.bytes.byteLength,
          width: pages[0]?.width ?? null,
          height: pages[0]?.height ?? null,
          label: `${document.name} · ${pages.length} página(s) · rev ${revision.revision}`.slice(0, 200),
          sourceAssetIds: contentAssetIds(revision.content).map((id) => AssetIdSchema.parse(id)),
          metadata: {
            origin: "render",
            documentId: document.id,
            documentRevision: revision.revision,
            ...(revision.content.formatId ? { formatId: revision.content.formatId } : {}),
            styleMode: revision.content.style.mode,
          },
        })
      )
    );
  }
  return outputs;
}

/**
 * Saídas do case: página web (ZIP), PDF paginado e módulos PNG de 1400 px — todas
 * do MESMO CaseView. Peças do Atlas dentro do case precisam ser do próprio projeto.
 */
async function renderCase(deps: RenderDeps, ctx: JobContext, documentId: CreativeDocumentId, revisionNumber: number, formats: RenderFormat[]): Promise<Output[]> {
  if (!deps.caseExporter) throw new DomainError("VALIDATION", "Este processo não tem exportador de case configurado.");
  const document = await deps.documents.getById(documentId);
  if (!document) throw new DomainError("NOT_FOUND", "Documento não encontrado.");
  const revision = await deps.documents.getRevision(document.id, revisionNumber);
  if (!revision || !isCase(revision.content)) throw new DomainError("VALIDATION", "Este documento não é um case.");
  const content = revision.content;
  const kinds = [...new Set(formats.map((f) => (f === "zip" ? "web" : f === "pdf" ? "pdf" : f === "png" ? "modules" : null)).filter((k): k is CaseOutputKind => k !== null))];
  if (kinds.length === 0) throw new DomainError("VALIDATION", "Case sai como página web (zip), PDF ou módulos PNG.");
  const profile = content.style.profileRevision ? await deps.visualProfiles.getRevision(document.projectId, content.style.profileRevision) : null;
  const tokens = resolveTokens(profile, content.style.mode, content.style.primary ? { primary: content.style.primary } : {});
  const cache = new Map<string, { bytes: Uint8Array; mimeType: string } | null>();
  await ctx.progress(20, "Montando o case…");
  const result = await deps.caseExporter.export({ content, tokens, title: content.case.title }, kinds, {
    signal: ctx.signal,
    loadAsset: (id) => loadAssetBytes(deps, cache, id),
    loadOutput: async (id) => {
      const parsed = OutputIdSchema.safeParse(id);
      const output = parsed.success ? await deps.outputs.getById(parsed.data) : null;
      return output && output.projectId === document.projectId && output.mimeType.startsWith("image/") ? { bytes: await deps.storage.get(output.storageKey), mimeType: output.mimeType } : null;
    },
  });
  ctx.throwIfAborted();
  await ctx.progress(85, "Guardando os arquivos…");

  const files: { format: "zip" | "pdf" | "png"; bytes: Uint8Array; mimeType: string; width: number | null; height: number | null; label: string; module: string; page?: number }[] = [];
  const base = `Case · ${content.case.title} · rev ${revision.revision}`;
  if (result.web) files.push({ format: "zip", bytes: result.web, mimeType: "application/zip", width: null, height: null, label: `${base} · página web`, module: "web" });
  if (result.pdf) files.push({ format: "pdf", bytes: result.pdf, mimeType: "application/pdf", width: null, height: null, label: `${base} · PDF`, module: "pdf" });
  result.modules?.forEach((m, i) => files.push({ format: "png", bytes: m.bytes, mimeType: "image/png", width: m.width, height: m.height, label: `${base} · módulo ${String(i + 1).padStart(2, "0")}`, module: m.id, page: i }));

  const staging = await deps.storage.beginStaging();
  const staged = files.map((f) => {
    const sha256 = createHash("sha256").update(f.bytes).digest("hex");
    return { ...f, sha256, key: contentStorageKey("renders", sha256, f.format) };
  });
  try {
    for (const s of staged) await staging.put(s.key, s.bytes);
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
          projectId: document.projectId,
          jobId: JobIdSchema.parse(ctx.job.id),
          format: s.format,
          mimeType: s.mimeType,
          storageKey: s.key,
          sha256: s.sha256,
          byteSize: s.bytes.byteLength,
          width: s.width,
          height: s.height,
          label: s.label.slice(0, 200),
          sourceAssetIds: caseAssetIds(content).map((id) => AssetIdSchema.parse(id)),
          metadata: { origin: "render", documentId: document.id, documentRevision: revision.revision, styleMode: content.style.mode, caseModule: s.module.slice(0, 64), ...(s.page !== undefined ? { page: s.page } : {}) },
        })
      )
    );
  }
  return outputs;
}

export function createRenderJobHandler(deps: RenderDeps): JobHandler {
  return {
    timeoutMs: 30 * 60_000,
    run: async (ctx) => {
      const payload = parseOrThrow(RenderJobPayloadSchema, ctx.job.payload, "Payload do render");
      const raster = payload.formats.filter((f): f is RasterFormat => !isVideoFormat(f) && !isExportFormat(f) && f !== "zip");
      const video = payload.formats.filter(isVideoFormat);
      const exports = payload.formats.filter(isExportFormat);
      if (payload.target.kind === "document") {
        const document = await deps.documents.getById(payload.target.documentId);
        if (document?.kind === "case") {
          const outputs = await renderCase(deps, ctx, document.id, payload.target.revision, payload.formats);
          return { outputIds: outputs.map((o) => o.id), count: outputs.length };
        }
      }
      if (payload.target.kind === "kit") {
        const outputs = await renderKit(deps, ctx, payload.target.kitId, raster, video, payload.quality ?? "final");
        return { outputIds: outputs.map((o) => o.id), count: outputs.length, kitId: payload.target.kitId };
      }
      await ctx.progress(5, "Montando a peça…");
      const outputs: Output[] = [];
      if (raster.length > 0) {
        const units = await resolveTarget(deps, payload.target);
        await ctx.progress(video.length ? 10 : 20, "Renderizando…");
        outputs.push(...(await renderUnits(deps, ctx, units, raster)));
      }
      if (video.length > 0) outputs.push(...(await renderVideos(deps, ctx, payload.target, video, payload.quality ?? "final")));
      if (exports.length > 0) outputs.push(...(await renderExports(deps, ctx, payload.target, exports)));
      return { outputIds: outputs.map((o) => o.id), count: outputs.length };
    },
  };
}

import { createHash } from "node:crypto";
import { z } from "zod";
import { createAsset } from "../../core/assets/asset";
import type { AssetStorage } from "../../core/assets/asset-storage";
import { createCapture, type Capture } from "../../core/assets/capture";
import type { AssetRepository, CaptureRepository } from "../../core/assets/repositories";
import type { ProjectRepository, SourceRepository } from "../../core/projects/repositories";
import { contentStorageKey } from "../../core/assets/storage-key";
import { DomainError, isDomainError } from "../../shared/errors";
import { JobIdSchema, SourceIdSchema } from "../../shared/id";
import { nowIso, parseOrThrow } from "../../shared/validation";
import type { JobContext, JobHandler } from "../../workers/job-worker";
import type { CaptureEngine, ViewportSpec } from "./capture-engine";

export const CaptureJobPayloadSchema = z.strictObject({ sourceId: SourceIdSchema });
export type CaptureJobPayload = z.infer<typeof CaptureJobPayloadSchema>;

export interface CaptureJobDeps {
  projects: ProjectRepository;
  sources: SourceRepository;
  captures: CaptureRepository;
  assets: AssetRepository;
  storage: AssetStorage;
  engine: CaptureEngine;
  viewport: ViewportSpec;
  timeoutMs: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Handler do job `capture` — a primeira fatia migrada (2.1.F): foto do viewport
 * desktop de uma Source URL, pela engine atual.
 *
 * Transacional: bytes vão para a staging do AssetStorage, são validados e só
 * então publicados; os registros (Asset, Capture concluída, capa) vêm depois.
 * Cancelamento, timeout ou erro descartam a staging — nenhum byte ou Asset parcial.
 */
export function createCaptureJobHandler(deps: CaptureJobDeps): JobHandler {
  return {
    timeoutMs: deps.timeoutMs,
    run: async (ctx) => {
      const payload = parseOrThrow(CaptureJobPayloadSchema, ctx.job.payload, "Payload do job de captura");
      const source = await deps.sources.getById(payload.sourceId);
      if (!source) throw new DomainError("NOT_FOUND", `Source ${payload.sourceId} não existe.`);
      if (source.type !== "url") throw new DomainError("VALIDATION", "A captura exige uma Source do tipo url.");
      const project = await deps.projects.getById(source.projectId);
      if (!project) throw new DomainError("NOT_FOUND", `Projeto ${source.projectId} não existe.`);

      let capture = await deps.captures.create(
        createCapture({
          projectId: project.id,
          sourceId: source.id,
          jobId: JobIdSchema.parse(ctx.job.id),
          type: "device",
          params: { url: source.locator, viewport: deps.viewport, fullPage: false },
        })
      );
      capture = await deps.captures.update({ ...capture, status: "running", startedAt: nowIso() });

      const staging = await deps.storage.beginStaging();
      try {
        await ctx.progress(10, `Capturando ${deps.viewport.label} (${deps.viewport.width}×${deps.viewport.height})…`);
        const shot = await deps.engine.captureViewport({ url: source.locator, viewport: deps.viewport, signal: ctx.signal });
        ctx.throwIfAborted();

        await ctx.progress(70, "Validando e guardando…");
        if (!PNG_SIGNATURE.every((byte, i) => shot.png[i] === byte)) {
          throw new DomainError("VALIDATION", "A engine devolveu bytes que não são PNG.");
        }
        const sha256 = createHash("sha256").update(shot.png).digest("hex");
        const stored = await staging.put(contentStorageKey("captures", sha256, "png"), shot.png);
        ctx.throwIfAborted(); // última chance de desistir antes de publicar
        await staging.commit();

        const asset = await deps.assets.create(
          createAsset({
            projectId: project.id,
            captureId: capture.id,
            kind: "screenshot",
            storageKey: stored.key,
            sha256: stored.sha256,
            mimeType: "image/png",
            byteSize: stored.byteSize,
            width: shot.width,
            height: shot.height,
            label: `${deps.viewport.label} ${deps.viewport.width}×${deps.viewport.height}`,
          })
        );
        capture = await deps.captures.update({ ...capture, status: "completed", completedAt: nowIso() });
        if (project.coverAssetId === null) await deps.projects.update({ ...project, coverAssetId: asset.id });

        return { captureId: capture.id, assetIds: [asset.id], finalUrl: shot.finalUrl };
      } catch (err) {
        await staging.discard();
        // Registrar a falha não pode mascarar o erro original.
        await finishCapture(deps.captures, capture, ctx, err).catch((recordErr: unknown) =>
          ctx.logger.error("falha ao registrar o fim da captura", { error: recordErr })
        );
        throw err;
      }
    },
  };
}

async function finishCapture(captures: CaptureRepository, capture: Capture, ctx: JobContext, err: unknown): Promise<void> {
  const cancelled = ctx.signal.aborted && isDomainError(ctx.signal.reason, "CANCELLED");
  const error = isDomainError(err)
    ? { code: err.code, message: err.message.slice(0, 2000) }
    : { code: "CAPTURE_FAILED", message: (err instanceof Error ? err.message : String(err)).slice(0, 2000) };
  await captures.update({
    ...capture,
    status: cancelled ? "cancelled" : "failed",
    error,
    completedAt: nowIso(),
  });
}

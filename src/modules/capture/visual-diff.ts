import { createHash } from "node:crypto";
import { z } from "zod";
import { createAsset, type Asset } from "../../core/assets/asset";
import type { AssetStorage } from "../../core/assets/asset-storage";
import type { AssetRepository } from "../../core/assets/repositories";
import { contentStorageKey } from "../../core/assets/storage-key";
import { createJob, type Job } from "../../core/jobs/job";
import type { JobRepository } from "../../core/jobs/repository";
import { DomainError } from "../../shared/errors";
import { AssetIdSchema, type AssetId } from "../../shared/id";
import { parseOrThrow } from "../../shared/validation";
import type { JobHandler } from "../../workers/job-worker";

/**
 * Diff visual (substitui o monitoramento do v1): compara duas capturas do mesmo
 * projeto pixel a pixel. O resultado é um Asset derivado (imagem de diferença,
 * percentual alterado, linhagem para as duas capturas) — imutável como qualquer
 * Asset; comparar o mesmo par de novo reaproveita o resultado.
 */
export interface ImageDiffResult {
  png: Uint8Array;
  width: number;
  height: number;
  changedPixels: number;
  totalPixels: number;
}

export interface ImageDiffer {
  diff(before: Uint8Array, after: Uint8Array): Promise<ImageDiffResult>;
}

export interface VisualDiffDeps {
  assets: AssetRepository;
  jobs: JobRepository;
  storage: AssetStorage;
  differ: ImageDiffer;
}

export const DiffJobPayloadSchema = z.strictObject({ beforeAssetId: AssetIdSchema, afterAssetId: AssetIdSchema });

/** Só fotos de página (viewport, página inteira, página extra, estado, seção) entram no diff. */
export const DIFFABLE_ROLES = ["viewport", "fullpage", "page", "state", "section"] as const;

export function isDiffable(asset: Pick<Asset, "kind" | "mimeType" | "metadata">): boolean {
  return (asset.kind === "screenshot" || asset.kind === "section") && asset.mimeType.startsWith("image/") && (DIFFABLE_ROLES as readonly string[]).includes(asset.metadata.role ?? "");
}

/** Percentual com 2 casas (o mesmo arredondamento do v1). */
export const changedPercent = (changed: number, total: number): number => (total > 0 ? Math.round((changed / total) * 10_000) / 100 : 0);

async function requirePair(deps: Pick<VisualDiffDeps, "assets">, beforeId: AssetId, afterId: AssetId): Promise<[Asset, Asset]> {
  if (beforeId === afterId) throw new DomainError("VALIDATION", "Escolha duas capturas diferentes.");
  const [before, after] = await Promise.all([deps.assets.getById(beforeId), deps.assets.getById(afterId)]);
  if (!before || !after) throw new DomainError("NOT_FOUND", "Captura não encontrada.");
  if (before.projectId !== after.projectId) throw new DomainError("VALIDATION", "As capturas precisam ser do mesmo projeto.");
  if (!isDiffable(before) || !isDiffable(after)) throw new DomainError("VALIDATION", "Só dá para comparar fotos de página (viewport, página inteira, seções, páginas extras, estados).");
  if (before.metadata.device && after.metadata.device && before.metadata.device !== after.metadata.device) {
    throw new DomainError("VALIDATION", "Compare capturas do mesmo device (desktop com desktop, mobile com mobile).");
  }
  return [before, after];
}

async function existingDiff(deps: Pick<VisualDiffDeps, "assets">, before: Asset, after: Asset): Promise<Asset | null> {
  return (await deps.assets.listByProject(after.projectId)).find((a) => a.metadata.role === "diff" && a.parentAssetId === after.id && a.metadata.comparedTo === before.id) ?? null;
}

/** Pede o diff: valida o par e enfileira o job `diff` (rápido, mas pesado demais para a request). */
export async function requestVisualDiff(deps: Pick<VisualDiffDeps, "assets" | "jobs">, beforeId: AssetId, afterId: AssetId): Promise<Job> {
  const [before, after] = await requirePair(deps, beforeId, afterId);
  return deps.jobs.create(createJob({ type: "diff", projectId: after.projectId, payload: { beforeAssetId: before.id, afterAssetId: after.id } }));
}

export function createVisualDiffJobHandler(deps: VisualDiffDeps): JobHandler {
  return {
    timeoutMs: 5 * 60_000,
    run: async (ctx) => {
      const { beforeAssetId, afterAssetId } = parseOrThrow(DiffJobPayloadSchema, ctx.job.payload, "Payload do diff");
      const [before, after] = await requirePair(deps, beforeAssetId, afterAssetId);
      const reused = await existingDiff(deps, before, after);
      if (reused) return { assetId: reused.id, percent: reused.metadata.changedPercent ?? 0, reused: true };

      await ctx.progress(20, "Comparando pixel a pixel…");
      const result = await deps.differ.diff(await deps.storage.get(before.storageKey), await deps.storage.get(after.storageKey));
      ctx.throwIfAborted();
      const percent = changedPercent(result.changedPixels, result.totalPixels);

      await ctx.progress(80, "Guardando a imagem de diferença…");
      const sha256 = createHash("sha256").update(result.png).digest("hex");
      const key = contentStorageKey("derived", sha256, "png");
      const staging = await deps.storage.beginStaging();
      try {
        await staging.put(key, result.png);
        ctx.throwIfAborted();
        await staging.commit();
      } catch (err) {
        await staging.discard();
        throw err;
      }
      const where = [after.metadata.device, after.metadata.role === "fullpage" ? "página inteira" : after.metadata.role].filter(Boolean).join(" · ");
      const asset = await deps.assets.create(
        createAsset({
          projectId: after.projectId,
          kind: "image",
          storageKey: key,
          sha256,
          mimeType: "image/png",
          byteSize: result.png.byteLength,
          width: result.width,
          height: result.height,
          parentAssetId: after.id,
          captureId: after.captureId,
          label: `Diferença ${percent.toLocaleString("pt-BR")}%${where ? ` · ${where}` : ""}`.slice(0, 200),
          metadata: {
            origin: "derived",
            role: "diff",
            comparedTo: before.id,
            changedPercent: percent,
            ...(after.metadata.device ? { device: after.metadata.device } : {}),
            ...(after.metadata.viewport ? { viewport: after.metadata.viewport } : {}),
          },
        })
      );
      return { assetId: asset.id, percent, changedPixels: result.changedPixels, reused: false };
    },
  };
}

import { createHash } from "node:crypto";
import { createAsset, type Asset, type AssetKind } from "../../core/assets/asset";
import type { AssetStorage } from "../../core/assets/asset-storage";
import type { AssetRepository } from "../../core/assets/repositories";
import { contentStorageKey } from "../../core/assets/storage-key";
import type { ProjectRepository, SourceRepository } from "../../core/projects/repositories";
import { createSource } from "../../core/projects/source";
import { DomainError } from "../../shared/errors";
import type { ProjectId } from "../../shared/id";
import type { MediaProbe } from "./media-probe";

export const UPLOAD_LIMITS = {
  maxFiles: 30,
  maxBytesPerFile: 50 * 1024 * 1024,
} as const;

export const UPLOADABLE_KINDS = ["screenshot", "image", "logo", "icon", "background", "illustration", "video"] as const satisfies readonly AssetKind[];
export type UploadableKind = (typeof UPLOADABLE_KINDS)[number];

export interface UploadDeps {
  projects: ProjectRepository;
  sources: SourceRepository;
  assets: AssetRepository;
  storage: AssetStorage;
  probe: MediaProbe;
}

export interface UploadFile {
  name: string;
  bytes: Uint8Array;
}

export interface UploadResult {
  created: Asset[];
  duplicates: Asset[];
  rejected: { name: string; reason: string }[];
}

/**
 * Importação manual de arquivos como Assets do projeto. O formato é decidido
 * pelos bytes (MediaProbe), nunca pela extensão. Arquivos iguais aos já
 * existentes no projeto não duplicam. Tudo passa pela staging: ou o lote aceito
 * inteiro é publicado, ou nada.
 */
export async function importUploads(
  deps: UploadDeps,
  projectId: ProjectId,
  files: UploadFile[],
  kind: UploadableKind
): Promise<UploadResult> {
  const project = await deps.projects.getById(projectId);
  if (!project) throw new DomainError("NOT_FOUND", "Projeto não encontrado.");
  if (files.length === 0) throw new DomainError("VALIDATION", "Nenhum arquivo enviado.");
  if (files.length > UPLOAD_LIMITS.maxFiles) {
    throw new DomainError("VALIDATION", `Envie no máximo ${UPLOAD_LIMITS.maxFiles} arquivos por vez.`);
  }

  const result: UploadResult = { created: [], duplicates: [], rejected: [] };
  const accepted: { file: UploadFile; sha256: string; mimeType: string; extension: string; width: number | null; height: number | null }[] = [];

  for (const file of files) {
    if (file.bytes.byteLength === 0) {
      result.rejected.push({ name: file.name, reason: "arquivo vazio" });
      continue;
    }
    if (file.bytes.byteLength > UPLOAD_LIMITS.maxBytesPerFile) {
      result.rejected.push({ name: file.name, reason: `maior que ${UPLOAD_LIMITS.maxBytesPerFile / 1024 / 1024} MB` });
      continue;
    }
    const probed = await deps.probe.probe(file.bytes);
    if (!probed) {
      result.rejected.push({ name: file.name, reason: "formato não reconhecido (aceitos: PNG, JPG, WebP, AVIF, GIF, SVG, MP4, WebM)" });
      continue;
    }
    if ((kind === "video") !== (probed.kind === "video")) {
      result.rejected.push({ name: file.name, reason: kind === "video" ? "não é um vídeo" : "vídeo enviado como imagem" });
      continue;
    }
    const sha256 = createHash("sha256").update(file.bytes).digest("hex");
    const existing = await deps.assets.findBySha256(projectId, sha256);
    if (existing.length > 0) {
      result.duplicates.push(existing[0]);
      continue;
    }
    if (accepted.some((a) => a.sha256 === sha256)) continue; // mesmo arquivo duas vezes no lote
    accepted.push({ file, sha256, mimeType: probed.mimeType, extension: probed.extension, width: probed.width, height: probed.height });
  }
  if (accepted.length === 0) return result;

  const staging = await deps.storage.beginStaging();
  let published: { key: string; sha256: string; byteSize: number }[];
  try {
    for (const item of accepted) {
      await staging.put(contentStorageKey("uploads", item.sha256, item.extension), item.file.bytes);
    }
    published = await staging.commit();
  } catch (err) {
    await staging.discard();
    throw err;
  }

  // A source "Uploads" registra que o projeto tem material enviado à mão.
  if (!(await deps.sources.listByProject(projectId)).some((s) => s.type === "upload")) {
    await deps.sources.create(createSource({ projectId, type: "upload", locator: "manual", label: "Uploads" }));
  }

  for (const item of accepted) {
    const stored = published.find((p) => p.sha256 === item.sha256);
    if (!stored) throw new DomainError("STORAGE_FAILED", `Arquivo ${item.file.name} não foi publicado.`);
    const asset = await deps.assets.create(
      createAsset({
        projectId,
        kind,
        storageKey: contentStorageKey("uploads", item.sha256, item.extension),
        sha256: item.sha256,
        mimeType: item.mimeType,
        byteSize: stored.byteSize,
        width: item.width,
        height: item.height,
        label: item.file.name.replace(/\.[^.]+$/, "").slice(0, 200) || null,
        metadata: { origin: "upload", role: "upload", originalName: item.file.name.slice(0, 255) },
      })
    );
    result.created.push(asset);
  }
  return result;
}

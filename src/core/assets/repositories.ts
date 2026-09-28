import type { AssetId, CaptureId, OutputId, ProjectId } from "../../shared/id";
import type { Sha256 } from "../../shared/validation";
import type { Asset, AssetKind, AssetRelation } from "./asset";
import type { StorageKey } from "./storage-key";
import type { Capture } from "./capture";
import type { Output } from "./output";

export interface AssetFilter {
  kinds?: readonly AssetKind[];
  role?: string;
  device?: "desktop" | "mobile";
}

export interface AssetSearch extends AssetFilter {
  projectId?: ProjectId;
  /** Busca no rótulo e no nome da seção. */
  text?: string;
  limit?: number;
  offset?: number;
}

/** Asset é imutável: sem update (remoção só explícita, ex.: descartar upload). */
export interface AssetRepository {
  /** Biblioteca global: mais recentes primeiro, com total para paginação. */
  search(query: AssetSearch): Promise<{ items: Asset[]; total: number }>;
  create(asset: Asset): Promise<Asset>;
  getById(id: AssetId): Promise<Asset | null>;
  listByProject(projectId: ProjectId, filter?: AssetFilter): Promise<Asset[]>;
  countByProject(projectId: ProjectId): Promise<Partial<Record<AssetKind, number>>>;
  /** Quantos registros (de qualquer projeto) apontam para estes bytes — base do GC de storage. */
  countByStorageKey(key: StorageKey): Promise<number>;
  delete(id: AssetId): Promise<void>;
  listByCapture(captureId: CaptureId): Promise<Asset[]>;
  findBySha256(projectId: ProjectId, sha256: Sha256): Promise<Asset[]>;
  addRelation(relation: AssetRelation): Promise<AssetRelation>;
  listRelations(assetId: AssetId): Promise<AssetRelation[]>;
}

/** Capture é stateful: `update` grava status/erro/timestamps. */
export interface CaptureRepository {
  create(capture: Capture): Promise<Capture>;
  getById(id: CaptureId): Promise<Capture | null>;
  listByProject(projectId: ProjectId): Promise<Capture[]>;
  update(capture: Capture): Promise<Capture>;
}

/** Output é imutável: sem update. */
export interface OutputRepository {
  create(output: Output): Promise<Output>;
  getById(id: OutputId): Promise<Output | null>;
  listByProject(projectId: ProjectId): Promise<Output[]>;
  countByStorageKey(key: StorageKey): Promise<number>;
}

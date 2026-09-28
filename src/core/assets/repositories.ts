import type { AssetId, CaptureId, OutputId, ProjectId } from "../../shared/id";
import type { Sha256 } from "../../shared/validation";
import type { Asset, AssetRelation } from "./asset";
import type { Capture } from "./capture";
import type { Output } from "./output";

/** Asset é imutável: sem update. */
export interface AssetRepository {
  create(asset: Asset): Promise<Asset>;
  getById(id: AssetId): Promise<Asset | null>;
  listByProject(projectId: ProjectId): Promise<Asset[]>;
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
}

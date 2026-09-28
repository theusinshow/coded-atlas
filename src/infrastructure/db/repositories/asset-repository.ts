import { and, asc, eq, or } from "drizzle-orm";
import { AssetRelationSchema, AssetSchema, type Asset, type AssetRelation } from "../../../core/assets/asset";
import type { AssetRepository } from "../../../core/assets/repositories";
import type { AssetId, CaptureId, ProjectId } from "../../../shared/id";
import { parseOrThrow, type Sha256 } from "../../../shared/validation";
import type { AtlasDb } from "../client";
import { assetRelations, assets } from "../schema";
import { run, toDomain } from "./support";

export class SqliteAssetRepository implements AssetRepository {
  constructor(private readonly db: AtlasDb) {}

  async create(asset: Asset): Promise<Asset> {
    const value = parseOrThrow(AssetSchema, asset, "Asset");
    run("Asset", () => this.db.insert(assets).values(value).run());
    return value;
  }

  async getById(id: AssetId): Promise<Asset | null> {
    const row = run("Asset", () => this.db.select().from(assets).where(eq(assets.id, id)).get());
    return row ? toDomain(AssetSchema, row, "Asset") : null;
  }

  async listByProject(projectId: ProjectId): Promise<Asset[]> {
    return this.list(eq(assets.projectId, projectId));
  }

  async listByCapture(captureId: CaptureId): Promise<Asset[]> {
    return this.list(eq(assets.captureId, captureId));
  }

  async findBySha256(projectId: ProjectId, sha256: Sha256): Promise<Asset[]> {
    return this.list(and(eq(assets.projectId, projectId), eq(assets.sha256, sha256)));
  }

  async addRelation(relation: AssetRelation): Promise<AssetRelation> {
    const value = parseOrThrow(AssetRelationSchema, relation, "Relação de asset");
    run("Relação de asset", () => this.db.insert(assetRelations).values(value).run());
    return value;
  }

  async listRelations(assetId: AssetId): Promise<AssetRelation[]> {
    const rows = run("Relação de asset", () =>
      this.db
        .select()
        .from(assetRelations)
        .where(or(eq(assetRelations.fromAssetId, assetId), eq(assetRelations.toAssetId, assetId)))
        .orderBy(asc(assetRelations.createdAt))
        .all()
    );
    return rows.map((row) => toDomain(AssetRelationSchema, row, "Relação de asset"));
  }

  private list(where: ReturnType<typeof eq> | undefined): Asset[] {
    const rows = run("Asset", () => this.db.select().from(assets).where(where).orderBy(asc(assets.id)).all());
    return rows.map((row) => toDomain(AssetSchema, row, "Asset"));
  }
}

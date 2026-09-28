import { and, asc, count, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { AssetRelationSchema, AssetSchema, type Asset, type AssetKind, type AssetRelation } from "../../../core/assets/asset";
import type { AssetFilter, AssetRepository } from "../../../core/assets/repositories";
import type { StorageKey } from "../../../core/assets/storage-key";
import { DomainError } from "../../../shared/errors";
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

  async listByProject(projectId: ProjectId, filter: AssetFilter = {}): Promise<Asset[]> {
    const conditions: SQL[] = [eq(assets.projectId, projectId)];
    if (filter.kinds?.length) conditions.push(inArray(assets.kind, [...filter.kinds]));
    if (filter.role) conditions.push(sql`json_extract(${assets.metadata}, '$.role') = ${filter.role}`);
    if (filter.device) conditions.push(sql`json_extract(${assets.metadata}, '$.device') = ${filter.device}`);
    return this.list(and(...conditions));
  }

  async countByProject(projectId: ProjectId): Promise<Partial<Record<AssetKind, number>>> {
    const rows = run("Asset", () =>
      this.db
        .select({ kind: assets.kind, n: count() })
        .from(assets)
        .where(eq(assets.projectId, projectId))
        .groupBy(assets.kind)
        .all()
    );
    return Object.fromEntries(rows.map((r) => [r.kind, r.n])) as Partial<Record<AssetKind, number>>;
  }

  async countByStorageKey(key: StorageKey): Promise<number> {
    const row = run("Asset", () => this.db.select({ n: count() }).from(assets).where(eq(assets.storageKey, key)).get());
    return row?.n ?? 0;
  }

  async delete(id: AssetId): Promise<void> {
    const result = run("Asset", () => this.db.delete(assets).where(eq(assets.id, id)).run());
    if (result.changes === 0) throw new DomainError("NOT_FOUND", `Asset ${id} não existe.`, { id });
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

  private list(where: SQL | undefined): Asset[] {
    const rows = run("Asset", () => this.db.select().from(assets).where(where).orderBy(asc(assets.id)).all());
    return rows.map((row) => toDomain(AssetSchema, row, "Asset"));
  }
}

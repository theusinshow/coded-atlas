import { desc, eq, gte, sql } from "drizzle-orm";
import {
  CreativePlanSchema,
  type CreativePlan,
  type CreativePlanId,
  type CreativePlanRepository,
} from "../../../core/brain/plan";
import { AiUsageSchema, type AiUsage, type AiUsageRepository, type AiUsageSummary } from "../../../core/brain/usage";
import { DomainError } from "../../../shared/errors";
import type { ProjectId } from "../../../shared/id";
import { nowIso, parseOrThrow } from "../../../shared/validation";
import type { AtlasDb } from "../client";
import { aiUsage, creativePlans } from "../schema";
import { run, toDomain } from "./support";

export class SqliteCreativePlanRepository implements CreativePlanRepository {
  constructor(private readonly db: AtlasDb) {}

  async create(plan: CreativePlan): Promise<CreativePlan> {
    const value = parseOrThrow(CreativePlanSchema, plan, "Plano criativo");
    run("Plano criativo", () => this.db.insert(creativePlans).values(value).run());
    return value;
  }

  async getById(id: CreativePlanId): Promise<CreativePlan | null> {
    const row = run("Plano criativo", () => this.db.select().from(creativePlans).where(eq(creativePlans.id, id)).get());
    return row ? toDomain(CreativePlanSchema, row, "Plano criativo") : null;
  }

  async listByProject(projectId: ProjectId): Promise<CreativePlan[]> {
    const rows = run("Plano criativo", () => this.db.select().from(creativePlans).where(eq(creativePlans.projectId, projectId)).orderBy(desc(creativePlans.createdAt)).all());
    return rows.map((row) => toDomain(CreativePlanSchema, row, "Plano criativo"));
  }

  async setStatus(id: CreativePlanId, status: CreativePlan["status"], appliedInstanceIds?: string[]): Promise<CreativePlan> {
    const current = await this.getById(id);
    if (!current) throw new DomainError("NOT_FOUND", "Plano não encontrado.", { id });
    const next = parseOrThrow(CreativePlanSchema, { ...current, status, appliedInstanceIds: appliedInstanceIds ?? current.appliedInstanceIds, updatedAt: nowIso() }, "Plano criativo");
    run("Plano criativo", () =>
      this.db.update(creativePlans).set({ status: next.status, appliedInstanceIds: next.appliedInstanceIds, updatedAt: next.updatedAt }).where(eq(creativePlans.id, id)).run()
    );
    return next;
  }
}

export class SqliteAiUsageRepository implements AiUsageRepository {
  constructor(private readonly db: AtlasDb) {}

  async record(usage: AiUsage): Promise<AiUsage> {
    const value = parseOrThrow(AiUsageSchema, usage, "Uso de IA");
    run("Uso de IA", () => this.db.insert(aiUsage).values(value).run());
    return value;
  }

  async summarizeSince(since: string): Promise<AiUsageSummary> {
    const row = run("Uso de IA", () =>
      this.db
        .select({
          calls: sql<number>`count(*)`,
          inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)`,
          cachedTokens: sql<number>`coalesce(sum(${aiUsage.cachedTokens}), 0)`,
          outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)`,
          estimatedCostUsd: sql<number>`coalesce(sum(${aiUsage.estimatedCostUsd}), 0)`,
          unpricedCalls: sql<number>`coalesce(sum(case when ${aiUsage.estimatedCostUsd} is null then 1 else 0 end), 0)`,
        })
        .from(aiUsage)
        .where(gte(aiUsage.createdAt, since))
        .get()
    );
    return {
      calls: Number(row?.calls ?? 0),
      inputTokens: Number(row?.inputTokens ?? 0),
      cachedTokens: Number(row?.cachedTokens ?? 0),
      outputTokens: Number(row?.outputTokens ?? 0),
      estimatedCostUsd: Number(row?.estimatedCostUsd ?? 0),
      unpricedCalls: Number(row?.unpricedCalls ?? 0),
    };
  }

  async listRecent(limit: number): Promise<AiUsage[]> {
    const rows = run("Uso de IA", () => this.db.select().from(aiUsage).orderBy(desc(aiUsage.createdAt)).limit(Math.min(Math.max(limit, 1), 200)).all());
    return rows.map((row) => toDomain(AiUsageSchema, row, "Uso de IA"));
  }
}

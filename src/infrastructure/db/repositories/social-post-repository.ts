import { asc, eq } from "drizzle-orm";
import { SocialPostSchema, type SocialPost, type SocialPostId, type SocialPostRepository } from "../../../core/social/social-post";
import { DomainError } from "../../../shared/errors";
import { nowIso, parseOrThrow } from "../../../shared/validation";
import type { AtlasDb } from "../client";
import { socialPosts } from "../schema";
import { run, toDomain } from "./support";

export class SqliteSocialPostRepository implements SocialPostRepository {
  constructor(private readonly db: AtlasDb) {}

  async create(post: SocialPost): Promise<SocialPost> {
    const value = parseOrThrow(SocialPostSchema, post, "Post social");
    run("Post social", () => this.db.insert(socialPosts).values(value).run());
    return value;
  }

  async getById(id: SocialPostId): Promise<SocialPost | null> {
    const row = run("Post social", () => this.db.select().from(socialPosts).where(eq(socialPosts.id, id)).get());
    return row ? toDomain(SocialPostSchema, row, "Post social") : null;
  }

  async list(): Promise<SocialPost[]> {
    const rows = run("Post social", () => this.db.select().from(socialPosts).orderBy(asc(socialPosts.feedOrder), asc(socialPosts.createdAt)).all());
    return rows.map((row) => toDomain(SocialPostSchema, row, "Post social"));
  }

  async update(post: SocialPost): Promise<SocialPost> {
    const value = parseOrThrow(SocialPostSchema, { ...post, updatedAt: nowIso() }, "Post social");
    const result = run("Post social", () => this.db.update(socialPosts).set({ ...value, id: undefined, createdAt: undefined }).where(eq(socialPosts.id, value.id)).run());
    if (result.changes === 0) throw new DomainError("NOT_FOUND", "Post não encontrado.", { id: value.id });
    return value;
  }

  async delete(id: SocialPostId): Promise<void> {
    run("Post social", () => this.db.delete(socialPosts).where(eq(socialPosts.id, id)).run());
  }
}

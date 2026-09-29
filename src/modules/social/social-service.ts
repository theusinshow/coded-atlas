import type { Output } from "../../core/assets/output";
import type { OutputRepository } from "../../core/assets/repositories";
import type { Project } from "../../core/projects/project";
import type { ProjectRepository } from "../../core/projects/repositories";
import {
  captionIssues,
  checkPieces,
  composeCaption,
  createSocialPost,
  normalizeHashtags,
  suggestHashtags,
  type PieceFacts,
  type PostCheck,
  type SocialPost,
  type SocialPostId,
  type SocialPostKind,
  type SocialPostRepository,
  type SocialPostStatus,
} from "../../core/social/social-post";
import { DomainError } from "../../shared/errors";
import { OutputIdSchema } from "../../shared/id";

/**
 * Planejador do Instagram (3.2.D). Monta posts a partir de peças já renderizadas,
 * checa as regras do Instagram e organiza o grid. Não publica nada: "publicado" é
 * uma marcação feita pelo Matheus depois de postar.
 */
export interface SocialDeps {
  socialPosts: SocialPostRepository;
  outputs: OutputRepository;
  projects: ProjectRepository;
}

export const KIND_LABEL: Record<SocialPostKind, string> = { post: "Post", carousel: "Carrossel", reel: "Reel", story: "Story" };

export function pieceFacts(o: Pick<Output, "id" | "mimeType" | "width" | "height" | "durationMs">): PieceFacts {
  return { id: o.id, kind: o.mimeType.startsWith("image/") ? "image" : o.mimeType.startsWith("video/") ? "video" : "other", width: o.width, height: o.height, durationMs: o.durationMs };
}

export interface PlannedPost {
  post: SocialPost;
  pieces: Output[];
  missing: number;
  check: PostCheck;
  captionIssues: string[];
  /** Nomes dos projetos das peças (para o card). */
  projects: string[];
  /** Texto pronto para colar no Instagram. */
  finalCaption: string;
}

async function resolve(deps: SocialDeps, post: SocialPost, projectCache: Map<string, Project | null>): Promise<PlannedPost> {
  const pieces: Output[] = [];
  let missing = 0;
  for (const id of post.outputIds) {
    const parsed = OutputIdSchema.safeParse(id);
    const output = parsed.success ? await deps.outputs.getById(parsed.data) : null;
    if (output) pieces.push(output);
    else missing++;
  }
  const names: string[] = [];
  for (const p of pieces) {
    if (!projectCache.has(p.projectId)) projectCache.set(p.projectId, await deps.projects.getById(p.projectId));
    const name = projectCache.get(p.projectId)?.name;
    if (name && !names.includes(name)) names.push(name);
  }
  return {
    post,
    pieces,
    missing,
    check: checkPieces(post.kind, pieces.map(pieceFacts), missing),
    captionIssues: captionIssues(post.caption, post.hashtags),
    projects: names,
    finalCaption: composeCaption(post.caption, post.hashtags),
  };
}

/** Tudo que o planejador mostra: grid do feed (sem stories) em ordem e stories. */
export async function listPlanner(deps: SocialDeps): Promise<{ feed: PlannedPost[]; stories: PlannedPost[] }> {
  const cache = new Map<string, Project | null>();
  const all = await Promise.all((await deps.socialPosts.list()).map((p) => resolve(deps, p, cache)));
  return { feed: all.filter((p) => p.post.kind !== "story"), stories: all.filter((p) => p.post.kind === "story") };
}

export async function getPlannedPost(deps: SocialDeps, id: SocialPostId): Promise<PlannedPost> {
  const post = await deps.socialPosts.getById(id);
  if (!post) throw new DomainError("NOT_FOUND", "Post não encontrado.");
  return resolve(deps, post, new Map());
}

async function loadOutputs(deps: SocialDeps, ids: readonly string[]): Promise<Output[]> {
  if (ids.length === 0) throw new DomainError("VALIDATION", "Escolha ao menos uma peça.");
  const outputs: Output[] = [];
  for (const id of ids) {
    const parsed = OutputIdSchema.safeParse(id);
    const output = parsed.success ? await deps.outputs.getById(parsed.data) : null;
    if (!output) throw new DomainError("NOT_FOUND", "Uma das peças escolhidas não existe.");
    outputs.push(output);
  }
  return outputs;
}

/** Novo rascunho. Posts do feed entram no topo do grid (como no Instagram). */
export async function createPost(deps: SocialDeps, input: { kind: SocialPostKind; outputIds: readonly string[]; title?: string }): Promise<SocialPost> {
  const ids = [...new Set(input.outputIds)];
  const outputs = await loadOutputs(deps, ids);
  const projects = await Promise.all([...new Set(outputs.map((o) => o.projectId))].map((id) => deps.projects.getById(id)));
  const names = projects.flatMap((p) => (p ? [p.name] : []));
  const existing = await deps.socialPosts.list();
  const feedOrder = input.kind === "story" ? 0 : Math.min(0, ...existing.filter((p) => p.kind !== "story").map((p) => p.feedOrder)) - 1;
  return deps.socialPosts.create(
    createSocialPost({
      kind: input.kind,
      title: (input.title?.trim() || `${names[0] ?? "Coded by M"} · ${KIND_LABEL[input.kind]}`).slice(0, 120),
      outputIds: ids,
      feedOrder,
      hashtags: suggestHashtags(projects.flatMap((p) => (p ? [p.category] : []))),
    })
  );
}

async function require(deps: SocialDeps, id: SocialPostId): Promise<SocialPost> {
  const post = await deps.socialPosts.getById(id);
  if (!post) throw new DomainError("NOT_FOUND", "Post não encontrado.");
  return post;
}

export async function updatePost(
  deps: SocialDeps,
  id: SocialPostId,
  patch: { title?: string; caption?: string; hashtags?: string | readonly string[]; plannedFor?: string | null; outputIds?: readonly string[] }
): Promise<SocialPost> {
  const post = await require(deps, id);
  const next: SocialPost = { ...post };
  if (patch.title !== undefined) next.title = patch.title.trim() || post.title;
  if (patch.caption !== undefined) next.caption = patch.caption;
  if (patch.hashtags !== undefined) next.hashtags = normalizeHashtags(patch.hashtags);
  if (patch.plannedFor !== undefined) next.plannedFor = patch.plannedFor || null;
  if (patch.outputIds !== undefined) {
    await loadOutputs(deps, patch.outputIds);
    next.outputIds = [...new Set(patch.outputIds)];
  }
  const issues = captionIssues(next.caption, next.hashtags);
  if (issues.length > 0) throw new DomainError("VALIDATION", issues[0]);
  // Mudou o conteúdo de um post "pronto": volta a rascunho até ser conferido de novo.
  if (post.status === "ready" && patch.outputIds !== undefined) next.status = "draft";
  return deps.socialPosts.update(next);
}

/** Pronto exige peças válidas para o Instagram; publicado registra a data (marcação manual). */
export async function setPostStatus(deps: SocialDeps, id: SocialPostId, status: SocialPostStatus): Promise<SocialPost> {
  const planned = await getPlannedPost(deps, id);
  if (status !== "draft") {
    const blocking = [...planned.check.errors, ...planned.captionIssues];
    if (blocking.length > 0) throw new DomainError("VALIDATION", blocking[0]);
  }
  return deps.socialPosts.update({ ...planned.post, status, postedAt: status === "posted" ? (planned.post.postedAt ?? new Date().toISOString()) : null });
}

/** Move no grid do feed: troca de lugar com o vizinho e regrava a ordem como 0..n. */
export async function movePost(deps: SocialDeps, id: SocialPostId, direction: "earlier" | "later"): Promise<void> {
  const feed = (await deps.socialPosts.list()).filter((p) => p.kind !== "story");
  const index = feed.findIndex((p) => p.id === id);
  if (index < 0) throw new DomainError("NOT_FOUND", "Post não está no feed.");
  const target = direction === "earlier" ? index - 1 : index + 1;
  if (target < 0 || target >= feed.length) return;
  [feed[index], feed[target]] = [feed[target], feed[index]];
  for (const [position, post] of feed.entries()) {
    if (post.feedOrder !== position) await deps.socialPosts.update({ ...post, feedOrder: position });
  }
}

export async function deletePost(deps: SocialDeps, id: SocialPostId): Promise<void> {
  await require(deps, id);
  await deps.socialPosts.delete(id);
}

/** Peças que servem para cada tipo — o seletor do "Novo post" usa isto. */
export function fitsKind(kind: SocialPostKind, o: Pick<Output, "mimeType" | "width" | "height">): boolean {
  const r = o.width && o.height ? o.width / o.height : null;
  const image = o.mimeType.startsWith("image/");
  const video = o.mimeType.startsWith("video/");
  if (kind === "post") return image && r !== null && r >= 0.79 && r <= 1.92;
  if (kind === "carousel") return (image || video) && r !== null && r >= 0.79 && r <= 1.92;
  if (kind === "reel") return video;
  return (image || video) && r !== null && r < 0.79; // story: vertical
}

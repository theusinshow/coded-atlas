import type { MediaKit } from "./media-kit";

/**
 * Objetivos (Atlas 3.3 — "começar pelo objetivo"): o que o Matheus quer fazer com
 * um projeto, em linguagem dele. Cada objetivo de mídia é um preset de Media Kit;
 * o Case leva ao editor de case, que já é guiado.
 */
export type GoalId = "portfolio" | "instagram" | "lancamento" | "case";

export interface Goal {
  id: GoalId;
  title: string;
  description: string;
  /** Preset do Media Kit (objetivos de mídia) ou null (Case: editor próprio). */
  presetId: string | null;
}

export const GOALS: readonly Goal[] = [
  { id: "portfolio", title: "Portfólio / site", description: "Imagens 16:9 e vídeo vitrine para o site e o portfólio.", presetId: "portfolio-kit" },
  { id: "instagram", title: "Instagram", description: "Posts 1:1 e 4:5, story, carrossel e reel.", presetId: "social-kit" },
  { id: "lancamento", title: "Lançamento", description: "Anunciar o projeto: post, carrossel, story, capa de link e reel.", presetId: "launch-kit" },
  { id: "case", title: "Case / apresentação", description: "Página editorial do projeto, PDF e apresentação.", presetId: null },
];

export function getGoal(id: string): Goal | undefined {
  return GOALS.find((g) => g.id === id);
}

export function goalOfPreset(presetId: string): Goal | undefined {
  return GOALS.find((g) => g.presetId === presetId);
}

/** O kit que o objetivo mostra: o mais recente daquele preset (pronto ou não). */
export function currentKitFor(kits: readonly MediaKit[], presetId: string): MediaKit | null {
  return kits.filter((k) => k.presetId === presetId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

/** Rótulo do cartão: começar, continuar de onde parou ou ver o que já foi gerado. */
export function goalAction(kit: MediaKit | null): "start" | "resume" | "done" {
  if (!kit) return "start";
  return kit.status === "rendered" ? "done" : "resume";
}

/** Arquivos que representam o kit agora: os do último render dele. */
export function kitFiles<T extends { jobId: string | null; metadata: { mediaKitId?: string } }>(outputs: readonly T[], kit: Pick<MediaKit, "id" | "lastRenderJobId">): T[] {
  if (!kit.lastRenderJobId) return [];
  return outputs.filter((o) => o.metadata.mediaKitId === kit.id && o.jobId === kit.lastRenderJobId);
}

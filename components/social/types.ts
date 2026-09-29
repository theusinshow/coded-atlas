import type { SocialPostKind, SocialPostStatus } from "@/src/core/social/social-post";

/** Dados serializados que o planejador (client) recebe do servidor. */
export interface PieceView {
  id: string;
  label: string;
  isVideo: boolean;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  thumbUrl: string;
  fileUrl: string;
}

export interface PostView {
  id: string;
  kind: SocialPostKind;
  status: SocialPostStatus;
  title: string;
  caption: string;
  hashtags: string[];
  plannedFor: string | null;
  postedAt: string | null;
  pieces: PieceView[];
  missing: number;
  errors: string[];
  warnings: string[];
  captionIssues: string[];
  projects: string[];
  finalCaption: string;
}

export interface CandidateGroup {
  project: string;
  pieces: (PieceView & { fits: SocialPostKind[] })[];
}

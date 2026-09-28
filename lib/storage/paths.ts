import path from "node:path";
import { config } from "../config";
import { AtlasError } from "../errors";
import { SlugSchema } from "../../src/core/projects/project";
import { resolveWithin } from "../../src/infrastructure/storage/confine";

/**
 * Ponto único de onde sai todo caminho de projeto no v1 (2.1.G): o slug é
 * validado com o schema do domínio e o caminho confinado a `outputDir`. Todos
 * os outros helpers derivam daqui, então nenhum slug cru vira caminho.
 */
export function projectDir(slug: string): string {
  if (!SlugSchema.safeParse(slug).success) {
    throw new AtlasError("VALIDATION", "Slug inválido.", `Invalid slug for path: ${JSON.stringify(slug)}`);
  }
  return resolveWithin(config.outputDir, slug);
}

export const screenshotDir = (slug: string) =>
  path.join(projectDir(slug), "screenshots");

export const thumbnailDir = (slug: string) =>
  path.join(projectDir(slug), "thumbnails");

export const catalogPath = (slug: string) =>
  path.join(projectDir(slug), "catalog.json");

/** Screenshot de viewport de um device (ex.: screenshots/desktop-1440x900.png). */
export const viewportShotPath = (
  slug: string,
  vp: { label: string; width: number; height: number }
) => path.join(screenshotDir(slug), `${vp.label}-${vp.width}x${vp.height}.png`);

// Backups de reprocessamento em andamento. Começa com "." e não tem
// catalog.json na raiz, então nunca aparece na listagem de projetos.
export const trashDir = () => path.join(config.outputDir, ".trash");

// v0.2 — seções e vídeos
export const sectionDir = (slug: string, device: string) =>
  path.join(screenshotDir(slug), `sections-${device}`);

export const videoDir = (slug: string) =>
  path.join(projectDir(slug), "videos");

export const videoFilePath = (slug: string, label: string) =>
  path.join(videoDir(slug), `${label}-scroll.webm`);

export const coverPath = (slug: string) =>
  path.join(thumbnailDir(slug), "cover.webp");

// v1.4 — composições para redes
export const compositionDir = (slug: string) =>
  path.join(projectDir(slug), "compositions");

// v1.4 — mockups com moldura
export const mockupDir = (slug: string) =>
  path.join(projectDir(slug), "mockups");

// v1.5 — páginas extras (screenshots por página)
export const pageScreenshotDir = (slug: string, pageSlug: string) =>
  path.join(screenshotDir(slug), "pages", pageSlug);

// v1.5 — estados de interação
export const stateScreenshotDir = (slug: string) =>
  path.join(screenshotDir(slug), "states");

// v1.7 — diff visual de recaptura
export const diffDir = (slug: string) =>
  path.join(projectDir(slug), "diffs");

export const caseDraftPath = (slug: string) =>
  path.join(projectDir(slug), "case-draft.mdx");

export const publicPath = (slug: string, ...parts: string[]) =>
  "/" + path.posix.join("generated", slug, ...parts);

// Sessão autenticada — vive FORA de public/ (contém cookies de login ativos,
// que jamais podem ser servidos na web).
export const authStateDir = () => path.join(process.cwd(), "auth");

export function authStatePath(slug: string): string {
  if (!SlugSchema.safeParse(slug).success) {
    throw new AtlasError("VALIDATION", "Slug inválido.", `Invalid slug for auth state: ${JSON.stringify(slug)}`);
  }
  return resolveWithin(authStateDir(), `${slug}.json`);
}

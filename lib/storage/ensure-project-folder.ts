import { promises as fs } from "node:fs";
import { AtlasError } from "../errors";
import { config } from "../config";
import { projectDir, screenshotDir, thumbnailDir } from "./paths";

export async function ensureProjectFolder(slug: string): Promise<void> {
  const dir = projectDir(slug);

  let folderExists = false;
  try {
    await fs.access(dir);
    folderExists = true;
  } catch {
    folderExists = false;
  }

  if (folderExists) {
    if (config.onSlugConflict === "fail") {
      throw new AtlasError(
        "SLUG_CONFLICT",
        "Já existe um projeto com este slug.",
        `Project folder already exists: ${dir}`
      );
    }
    console.warn(
      `[atlas:${slug}] Pasta já existe — removendo para recriar (onSlugConflict=overwrite).`
    );
    await fs.rm(dir, { recursive: true, force: true });
  }

  await fs.mkdir(screenshotDir(slug), { recursive: true });
  await fs.mkdir(thumbnailDir(slug), { recursive: true });
}

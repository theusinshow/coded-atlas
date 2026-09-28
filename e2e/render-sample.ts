/**
 * Renderiza TODAS as composições curadas para um projeto (auto-binding), para
 * revisão visual. Lê o banco/arquivos de ATLAS_HOME; grava PNGs na pasta pedida.
 * Uso: ATLAS_HOME=... npx tsx e2e/render-sample.ts <slug> <pasta> [formato] [modo]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { autoBind } from "../src/core/creative/auto-bind";
import { COMPOSITIONS } from "../src/core/creative/compositions";
import { FormatIdSchema } from "../src/core/creative/formats";
import { buildArtboard } from "../src/core/creative/instance-artboard";
import { resolveTokens, StyleModeSchema } from "../src/core/creative/tokens";
import { resolveAtlasHome } from "../src/infrastructure/atlas-home";
import { openDatabase } from "../src/infrastructure/db/client";
import { createRepositories } from "../src/infrastructure/db/repositories";
import { PlaywrightStaticRenderer } from "../src/infrastructure/render/playwright-static-renderer";
import { LocalAssetStorage } from "../src/infrastructure/storage/local-asset-storage";

async function main(): Promise<void> {
  const [slug, out, format = "post-1x1", mode = "hybrid"] = process.argv.slice(2);
  if (!slug || !out) throw new Error("uso: npx tsx e2e/render-sample.ts <slug> <pasta> [formato] [modo]");
  const home = resolveAtlasHome();
  const database = openDatabase({ file: home.databaseFile });
  const repos = createRepositories(database.db);
  const storage = await LocalAssetStorage.open(home.storageRoot);
  const project = await repos.projects.getBySlug(slug);
  if (!project) throw new Error(`projeto ${slug} não encontrado em ${home.root}`);
  const assets = await repos.assets.listByProject(project.id);
  const profile = await repos.visualProfiles.latest(project.id);
  const url = (await repos.sources.listByProject(project.id)).find((s) => s.type === "url")?.locator ?? null;
  const byId = new Map<string, (typeof assets)[number]>(assets.map((a) => [a.id, a]));
  const tokens = resolveTokens(profile, StyleModeSchema.parse(mode));
  const formatId = FormatIdSchema.parse(format);

  const items = COMPOSITIONS.flatMap((def) =>
    def.variants.slice(0, 1).map((variant) => ({
      name: `${def.id}-${variant.id}`,
      item: {
        artboard: buildArtboard(def, { formatId, variant: variant.id, bindings: autoBind(def, { project, assets, url }) }, byId, profile),
        tokens,
        formats: ["png"] as const,
      },
    }))
  );
  const results = await new PlaywrightStaticRenderer().renderBatch(
    items.map((i) => i.item),
    {
      loadAsset: async (id) => {
        const asset = byId.get(id);
        return asset ? { bytes: await storage.get(asset.storageKey), mimeType: asset.mimeType } : null;
      },
      signal: new AbortController().signal,
    }
  );
  mkdirSync(out, { recursive: true });
  results.forEach(([png], i) => {
    const file = path.join(out, `${items[i].name}.png`);
    writeFileSync(file, png.bytes);
    console.log(file);
  });
  database.close();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});

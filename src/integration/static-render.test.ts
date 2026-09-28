import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { autoBind } from "../core/creative/auto-bind";
import { COMPOSITIONS, getComposition } from "../core/creative/compositions";
import { FORMAT_IDS, FORMATS } from "../core/creative/formats";
import { buildArtboard } from "../core/creative/instance-artboard";
import { ATLAS_TOKENS, resolveTokens } from "../core/creative/tokens";
import { createVisualProfile } from "../core/creative/visual-profile";
import { createAsset, type Asset } from "../core/assets/asset";
import { parseStorageKey } from "../core/assets/storage-key";
import { PlaywrightStaticRenderer } from "../infrastructure/render/playwright-static-renderer";
import { newId, ProjectIdSchema } from "../shared/id";

const projectId = ProjectIdSchema.parse(newId());

async function fakeAsset(role: string, device: "desktop" | "mobile", width: number, height: number, color: string, kind: "screenshot" | "section" = "screenshot") {
  const bytes = new Uint8Array(await sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer());
  const asset = createAsset({
    projectId,
    kind,
    storageKey: parseStorageKey(`captures/aa/${"a".repeat(62)}${Math.floor(Math.random() * 90 + 10)}.png`),
    sha256: "a".repeat(64),
    mimeType: "image/png",
    byteSize: bytes.byteLength,
    width,
    height,
    metadata: { role, device },
  });
  return { asset, bytes };
}

describe("composições curadas (build puro)", () => {
  it("todas as 10 constroem Artboards válidos em todos os formatos, sem layers fora de um limite razoável", () => {
    const profile = createVisualProfile({ projectId, revision: 1, palette: ["#0b2a36", "#fbfcfd", "#e63946"], fonts: ["Montserrat"], techStack: [], source: "inspection" });
    expect(COMPOSITIONS).toHaveLength(10);
    for (const def of COMPOSITIONS) {
      for (const formatId of FORMAT_IDS) {
        for (const variant of def.variants) {
          const artboard = buildArtboard(def, { formatId, variant: variant.id, bindings: {} }, new Map(), profile);
          expect(artboard.width).toBe(FORMATS[formatId].width);
          for (const layer of artboard.layers) {
            expect(layer.x + layer.width, `${def.id}/${formatId}/${variant.id}/${layer.id}`).toBeGreaterThan(-artboard.width * 0.2);
            expect(layer.y, `${def.id}/${formatId}/${variant.id}/${layer.id}`).toBeLessThan(artboard.height);
          }
        }
      }
    }
  });

  it("Brand Adapter: atlas é Coded by M puro; hybrid mantém neutros e usa a cor de marca; project garante contraste", () => {
    const profile = createVisualProfile({ projectId, revision: 1, palette: ["#fbfcfd", "#0b2a36", "#e63946"], fonts: ["Playfair Display", "Lato"], techStack: [], source: "inspection" });
    expect(resolveTokens(profile, "atlas")).toEqual(ATLAS_TOKENS);
    const hybrid = resolveTokens(profile, "hybrid");
    expect(hybrid.colors.background).toBe(ATLAS_TOKENS.colors.background);
    expect(hybrid.colors.primary).toBe("#e63946");
    expect(hybrid.fonts.display).toBe("playfair-display");
    const project = resolveTokens(profile, "project");
    expect(project.colors.background).toBe("#fbfcfd");
    expect(project.colors.text).toBe("#0b2a36");
    expect(resolveTokens(null, "project")).toEqual(ATLAS_TOKENS); // sem perfil: cai no Atlas
    expect(resolveTokens(profile, "hybrid", { primary: "#00ff88" }).colors.primary).toBe("#00ff88");
  });
});

describe("render estático (Chromium real)", () => {
  it("renderiza Desktop + Mobile em PNG/JPG/WebP nas dimensões exatas, com as imagens do projeto", async () => {
    const desktop = await fakeAsset("viewport", "desktop", 1440, 900, "#e63946");
    const mobile = await fakeAsset("viewport", "mobile", 390, 844, "#2a9d8f");
    const assets: Asset[] = [desktop.asset, mobile.asset];
    const bytes = new Map<string, Uint8Array>([
      [desktop.asset.id, desktop.bytes],
      [mobile.asset.id, mobile.bytes],
    ]);
    const def = getComposition("desktop-mobile")!;
    const bindings = autoBind(def, { project: { name: "Fixture", category: "Site", client: null, description: null }, assets, url: "https://fixture.example" });
    expect(bindings.desktop).toEqual({ assetId: desktop.asset.id });
    expect(bindings.mobile).toEqual({ assetId: mobile.asset.id });

    const artboard = buildArtboard(def, { formatId: "post-4x5", variant: "right", bindings }, new Map(assets.map((a) => [a.id, a])), null);
    const [images] = await new PlaywrightStaticRenderer().renderBatch([{ artboard, tokens: ATLAS_TOKENS, formats: ["png", "jpg", "webp"] }], {
      loadAsset: async (id) => (bytes.has(id) ? { bytes: bytes.get(id)!, mimeType: "image/png" } : null),
      signal: new AbortController().signal,
    });
    expect(images.map((i) => i.format)).toEqual(["png", "jpg", "webp"]);
    for (const img of images) {
      const meta = await sharp(img.bytes).metadata();
      expect([meta.width, meta.height]).toEqual([1080, 1350]);
    }
    // o vermelho do screenshot desktop aparece no render (a imagem foi carregada de verdade)
    const { data, info } = await sharp(images[0].bytes).raw().toBuffer({ resolveWithObject: true });
    let red = 0;
    for (let i = 0; i < data.length; i += info.channels) if (data[i] > 200 && data[i + 1] < 90 && data[i + 2] < 100) red++;
    expect(red / (info.width * info.height)).toBeGreaterThan(0.1);
  }, 60_000);
});

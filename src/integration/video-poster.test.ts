import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { contentStorageKey } from "../core/assets/storage-key";
import { ffmpegPath } from "../infrastructure/ffmpeg/ffmpeg";
import { ThumbnailService, thumbKey } from "../infrastructure/sharp/thumbnails";
import { LocalAssetStorage } from "../infrastructure/storage/local-asset-storage";

let dir: string;
let storage: LocalAssetStorage;
beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "atlas-poster-test-"));
  storage = await LocalAssetStorage.open(path.join(dir, "storage"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("pôster de vídeo", () => {
  it("vídeo ganha miniatura WebP (quadro via FFmpeg), cacheada como as de imagem", async () => {
    const file = path.join(dir, "clip.mp4");
    execFileSync(ffmpegPath(), ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0xfb3640:s=320x568:d=2", "-pix_fmt", "yuv420p", file]);
    const bytes = new Uint8Array(readFileSync(file));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const storageKey = contentStorageKey("videos", sha256, "mp4");
    await storage.put(storageKey, bytes);
    const service = new ThumbnailService(storage);
    const thumb = await service.get({ mimeType: "video/mp4", sha256, storageKey, width: 320, height: 568 }, 320, "whole");
    expect(thumb).not.toBeNull();
    const meta = await sharp(Buffer.from(thumb!)).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 320 });
    const { data } = await sharp(Buffer.from(thumb!)).extract({ left: 10, top: 10, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(200); // o vermelho do vídeo
    expect(await storage.exists(thumbKey(sha256, 320, "whole"))).toBe(true);
  }, 60_000);
});

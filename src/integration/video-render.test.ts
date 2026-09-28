import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createVisualProfile } from "../core/creative/visual-profile";
import type { Layer } from "../core/documents/layer";
import type { MotionContent } from "../core/motion/motion";
import { openDatabase, type AtlasDatabase } from "../infrastructure/db/client";
import { createRepositories, type Repositories } from "../infrastructure/db/repositories";
import { encoderArgs, ffmpegVersion } from "../infrastructure/ffmpeg/ffmpeg";
import { ChromiumFfmpegMotionRenderer } from "../infrastructure/render/chromium-ffmpeg-motion-renderer";
import { PlaywrightStaticRenderer } from "../infrastructure/render/playwright-static-renderer";
import { SharpMediaProbe } from "../infrastructure/sharp/media-probe";
import { LocalAssetStorage } from "../infrastructure/storage/local-asset-storage";
import { createBlankCanvas, createWebsiteScroll, enqueueDocumentRender, saveCanvas } from "../modules/create/document-service";
import { importUploads } from "../modules/import/upload";
import { createNewProject } from "../modules/projects/project-service";
import { videoPlan } from "../modules/render/motion-renderer";
import { createRenderJobHandler } from "../modules/render/render-job";
import { isDomainError } from "../shared/errors";
import { JobWorker } from "../workers/job-worker";

let dir: string;
let database: AtlasDatabase;
let repos: Repositories;
let storage: LocalAssetStorage;

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "atlas-video-"));
  database = openDatabase({ file: path.join(dir, "atlas.db") });
  repos = createRepositories(database.db);
  storage = await LocalAssetStorage.open(path.join(dir, "storage"));
});
afterEach(() => {
  database.close();
  rmSync(dir, { recursive: true, force: true });
});

/** Gera mídia de teste com o próprio FFmpeg (tom de 440 Hz; barras de teste). */
function ffmpegMake(args: string[], name: string): Uint8Array {
  const out = path.join(dir, name);
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args, out]);
  return new Uint8Array(readFileSync(out));
}

function probe(bytes: Uint8Array, name: string): { streams: { codec_type: string; codec_name: string; width?: number; height?: number }[]; format: { duration: string } } {
  const file = path.join(dir, name);
  writeFileSync(file, bytes);
  return JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]).toString());
}

describe("plano de quadros e argumentos do FFmpeg", () => {
  it("preview reduz fps e resolução; final segue o documento; áudio com apad/fade e duração exata", () => {
    const content = { fps: 30 as const, scenes: [{ durationMs: 2500 }, { durationMs: 1500 }] } as unknown as MotionContent;
    expect(videoPlan(content, "final")).toEqual({ fps: 30, frames: 120, scale: 1, durationMs: 4000 });
    expect(videoPlan(content, "preview")).toEqual({ fps: 15, frames: 60, scale: 0.5, durationMs: 4000 });
    const args = encoderArgs({ format: "mp4", fps: 30, durationMs: 4000, output: "out.mp4", quality: "final", audio: { file: "a.mp3", volume: 0.8, fadeOutMs: 1000 } });
    expect(args).toEqual(expect.arrayContaining(["libx264", "yuv420p", "+faststart", "aac"]));
    expect(args[args.indexOf("-af") + 1]).toBe("apad,volume=0.80,afade=t=out:st=3.000:d=1.000");
    expect(args.slice(-3)).toEqual(["-t", "4.000", "out.mp4"]);
    expect(encoderArgs({ format: "webm", fps: 15, durationMs: 1000, output: "o.webm", quality: "preview", audio: null })).toEqual(expect.arrayContaining(["libvpx-vp9", "realtime"]));
  });
});

describe("render de vídeo real (Chromium + FFmpeg)", () => {
  it("Website Scroll com vídeo capturado e trilha → MP4 H.264 + AAC na duração exata; WebM preview", async () => {
    expect(await ffmpegVersion()).not.toBeNull();
    const { project } = await createNewProject({ ...repos, storage }, { name: "Estúdio Norte", category: "Site", url: "https://norte.example" });
    await repos.visualProfiles.create(createVisualProfile({ projectId: project.id, revision: 1, palette: ["#0f1014", "#e63946"], fonts: [], techStack: [], source: "manual" }));
    const deps = { ...repos, storage, probe: new SharpMediaProbe() };
    const fullpage = (await importUploads(deps, project.id, [{ name: "page.png", bytes: await sharp({ create: { width: 800, height: 4000, channels: 3, background: "#1d3557" } }).png().toBuffer() }], "screenshot")).created[0];
    const wav = ffmpegMake(["-f", "lavfi", "-i", "sine=frequency=440:duration=1"], "tone.wav");
    const track = await importUploads(deps, project.id, [{ name: "tone.wav", bytes: wav }], "audio");
    expect(track.created[0]).toMatchObject({ kind: "audio", mimeType: "audio/wav" });
    const clip = ffmpegMake(["-f", "lavfi", "-i", "testsrc=size=320x200:rate=15:duration=1", "-c:v", "libvpx-vp9", "-b:v", "200k"], "clip.webm");
    const video = (await importUploads(deps, project.id, [{ name: "clip.webm", bytes: clip }], "video")).created[0];

    // Website Scroll 1.91:1, encurtado para o teste, com trilha e um celular mostrando o vídeo capturado.
    const { document } = await createWebsiteScroll({ ...repos, sources: repos.sources }, project.id, { assetId: fullpage.id, formatId: "og-1.91x1" });
    const content = (await repos.documents.getRevision(document.id, 1))!.content as MotionContent;
    const phone: Layer = { id: "cel", type: "device", device: "phone", frame: "dark", assetId: video.id, focusY: 0, x: 980, y: 300, width: 160, height: 320, rotation: 0, opacity: 1, visible: true, locked: false, radius: 0, shadow: "device", blur: 0 } as Layer;
    const scene = { ...content.scenes[0], durationMs: 1600, animations: content.scenes[0].animations.map((a) => ({ ...a, delayMs: 0, durationMs: 1500 })), artboard: { ...content.scenes[0].artboard, layers: [...content.scenes[0].artboard.layers, phone] } };
    const edited: MotionContent = { ...content, fps: 24, scenes: [scene], audio: { assetId: track.created[0].id, volume: 0.7, fadeOutMs: 400 } };
    await saveCanvas(repos, document.id, 1, edited);

    const worker = new JobWorker({ jobs: repos.jobs, handlers: { render: createRenderJobHandler({ ...repos, storage, renderer: new PlaywrightStaticRenderer(), motionRenderer: new ChromiumFfmpegMotionRenderer() }) } });
    const job = await enqueueDocumentRender(repos, document.id, 2, ["mp4"]);
    expect(await worker.runOnce()).toMatchObject({ id: job.id, status: "completed", result: { count: 1 } });
    const [mp4] = await repos.outputs.listByProject(project.id);
    expect(mp4).toMatchObject({ format: "mp4", mimeType: "video/mp4", width: 1200, height: 630, durationMs: 1600, metadata: { documentId: document.id, documentRevision: 2, quality: "final" } });
    const info = probe(await storage.get(mp4.storageKey), "out.mp4");
    expect(info.streams.find((s) => s.codec_type === "video")).toMatchObject({ codec_name: "h264", width: 1200, height: 630 });
    expect(info.streams.find((s) => s.codec_type === "audio")).toMatchObject({ codec_name: "aac" });
    expect(Number(info.format.duration)).toBeCloseTo(1.6, 1);

    const previewJob = await enqueueDocumentRender(repos, document.id, 2, ["webm"], "preview");
    expect(await worker.runOnce()).toMatchObject({ id: previewJob.id, status: "completed" });
    const webm = (await repos.outputs.listByProject(project.id)).find((o) => o.format === "webm")!;
    expect(webm).toMatchObject({ width: 600, height: 314, metadata: { quality: "preview" } });
    expect(probe(await storage.get(webm.storageKey), "out.webm").streams.find((s) => s.codec_type === "video")).toMatchObject({ codec_name: "vp9" });
  }, 180_000);

  it("vídeo só sai de documento de motion", async () => {
    const { project } = await createNewProject({ ...repos, storage }, { name: "Estúdio Sul", category: "Site" });
    const { document } = await createBlankCanvas(repos, project.id, { formatId: "post-1x1" });
    await expect(enqueueDocumentRender(repos, document.id, 1, ["mp4"])).rejects.toSatisfy((e: unknown) => isDomainError(e, "VALIDATION"));
  });
});

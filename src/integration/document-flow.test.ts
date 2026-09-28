import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createVisualProfile } from "../core/creative/visual-profile";
import { COALESCE_WINDOW_MS, shouldCoalesce, type CanvasContent } from "../core/documents/creative-document";
import { openDatabase, type AtlasDatabase } from "../infrastructure/db/client";
import { createRepositories, type Repositories } from "../infrastructure/db/repositories";
import { PlaywrightStaticRenderer } from "../infrastructure/render/playwright-static-renderer";
import { SharpMediaProbe } from "../infrastructure/sharp/media-probe";
import { LocalAssetStorage } from "../infrastructure/storage/local-asset-storage";
import { createInstance } from "../modules/create/composition-service";
import {
  createBlankCanvas,
  deleteDocument,
  enqueueDocumentRender,
  materializeInstance,
  restoreRevision,
  saveCanvas,
} from "../modules/create/document-service";
import { importUploads } from "../modules/import/upload";
import { createNewProject } from "../modules/projects/project-service";
import { createRenderJobHandler } from "../modules/render/render-job";
import { isDomainError } from "../shared/errors";
import { JobWorker } from "../workers/job-worker";

let dir: string;
let database: AtlasDatabase;
let repos: Repositories;
let storage: LocalAssetStorage;

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "atlas-docs-"));
  database = openDatabase({ file: path.join(dir, "atlas.db") });
  repos = createRepositories(database.db);
  storage = await LocalAssetStorage.open(path.join(dir, "storage"));
});
afterEach(() => {
  database.close();
  rmSync(dir, { recursive: true, force: true });
});

async function setup(name = "Estúdio Norte") {
  const { project } = await createNewProject({ ...repos, storage }, { name, category: "Site", url: "https://norte.example" });
  const png = await sharp({ create: { width: 1440, height: 900, channels: 3, background: "#1d3557" } }).png().toBuffer();
  const up = await importUploads({ ...repos, storage, probe: new SharpMediaProbe() }, project.id, [{ name: "home.png", bytes: png }], "screenshot");
  await repos.visualProfiles.create(createVisualProfile({ projectId: project.id, revision: 1, palette: ["#fbfcfd", "#1d3557", "#e63946"], fonts: ["Inter"], techStack: [], source: "manual" }));
  return { project, upload: up.created[0] };
}

const withTitle = (content: CanvasContent, text: string): CanvasContent => ({
  ...content,
  artboard: {
    ...content.artboard,
    layers: [
      ...content.artboard.layers.filter((l) => l.id !== "t"),
      { id: "t", type: "text", x: 80, y: 80, width: 800, height: 120, rotation: 0, opacity: 1, visible: true, locked: false, radius: 0, shadow: "none", blur: 0, text, font: "display", size: 72, weight: 700, color: "primary", align: "left", lineHeight: 1.1, letterSpacing: 0, uppercase: false },
    ],
  },
});

describe("coalescência de autosave", () => {
  const now = new Date("2026-09-28T12:00:00.000Z");
  const recent = new Date(now.getTime() - 5_000).toISOString();
  it("só reescreve edição recente e não fixada", () => {
    expect(shouldCoalesce({ origin: "edit", pinned: false, createdAt: recent }, "edit", now)).toBe(true);
    expect(shouldCoalesce({ origin: "edit", pinned: true, createdAt: recent }, "edit", now)).toBe(false);
    expect(shouldCoalesce({ origin: "create", pinned: false, createdAt: recent }, "edit", now)).toBe(false);
    expect(shouldCoalesce({ origin: "edit", pinned: false, createdAt: recent }, "restore", now)).toBe(false);
    expect(shouldCoalesce({ origin: "edit", pinned: false, createdAt: new Date(now.getTime() - COALESCE_WINDOW_MS - 1).toISOString() }, "edit", now)).toBe(false);
  });
});

describe("CanvasDocument: criar, editar, revisões, render", () => {
  it("em branco: formato, identidade atual e revisão 1", async () => {
    const { project } = await setup();
    const { document, revision } = await createBlankCanvas(repos, project.id, { formatId: "story-9x16" });
    expect(document).toMatchObject({ kind: "canvas", name: "Canvas Story 9:16", headRevision: 1 });
    expect(revision).toMatchObject({ revision: 1, origin: "create", pinned: false });
    const stored = await repos.documents.getRevision(document.id, 1);
    expect(stored?.content).toMatchObject({ artboard: { width: 1080, height: 1920, layers: [] }, style: { mode: "hybrid", profileRevision: 1 }, formatId: "story-9x16" });
  });

  it("composição → canvas congela o artboard da receita e guarda a origem", async () => {
    const { project, upload } = await setup();
    const instance = await createInstance(repos, project.id, { compositionId: "desktop-hero", formatId: "post-4x5", overrides: { primary: "#ff5500" } });
    const { document } = await materializeInstance(repos, instance.id);
    expect(document.source).toEqual({ instanceId: instance.id, compositionId: "desktop-hero", compositionVersion: 1 });
    const content = (await repos.documents.getRevision(document.id, 1))!.content as CanvasContent;
    expect(content.artboard).toMatchObject({ width: 1080, height: 1350 });
    expect(content.style).toEqual({ mode: "hybrid", primary: "#ff5500", profileRevision: 1 });
    expect(JSON.stringify(content.artboard)).toContain(upload.id);
  });

  it("autosave coalesce, conflito entre abas, fixação por render, restauração e render de revisão concreta", async () => {
    const { project, upload } = await setup();
    const { document } = await createBlankCanvas(repos, project.id, { formatId: "post-1x1" });
    const base = (await repos.documents.getRevision(document.id, 1))!.content as CanvasContent;

    // 1ª edição abre a revisão 2; a seguinte (recente) reescreve a mesma.
    const a = await saveCanvas(repos, document.id, 1, withTitle(base, "Primeira"));
    expect(a.revision).toMatchObject({ revision: 2, origin: "edit" });
    const b = await saveCanvas(repos, document.id, 2, withTitle(base, "Segunda"));
    expect(b.revision.revision).toBe(2);
    expect(JSON.stringify((await repos.documents.getRevision(document.id, 2))!.content)).toContain("Segunda");

    // Outra aba com base velha → CONFLICT.
    await expect(saveCanvas(repos, document.id, 1, base)).rejects.toSatisfy((e: unknown) => isDomainError(e, "CONFLICT"));

    // Imagem de outro projeto é recusada.
    const other = await setup("Outro Projeto");
    const foreign: CanvasContent = {
      ...base,
      artboard: { ...base.artboard, layers: [{ id: "img", type: "asset", assetId: other.upload.id, x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1, visible: true, locked: false, radius: 0, shadow: "none", blur: 0, fit: "cover", focusY: 0 }] },
    };
    await expect(saveCanvas(repos, document.id, 2, foreign)).rejects.toSatisfy((e: unknown) => isDomainError(e, "VALIDATION"));

    // Render fixa a revisão 2: a próxima edição abre a revisão 3 em vez de reescrever.
    const withImage: CanvasContent = withTitle(
      { ...base, artboard: { ...base.artboard, layers: [{ id: "img", type: "asset", assetId: upload.id, x: 0, y: 540, width: 1080, height: 540, rotation: 0, opacity: 1, visible: true, locked: false, radius: 0, shadow: "none", blur: 0, fit: "cover", focusY: 0 }] } },
      "Com imagem"
    );
    await saveCanvas(repos, document.id, 2, withImage);
    const job = await enqueueDocumentRender(repos, document.id, 2, ["png"]);
    expect((await repos.documents.getRevision(document.id, 2))!.pinned).toBe(true);
    const c = await saveCanvas(repos, document.id, 2, withTitle(base, "Depois do render"));
    expect(c.revision.revision).toBe(3);

    const worker = new JobWorker({ jobs: repos.jobs, handlers: { render: createRenderJobHandler({ ...repos, storage, renderer: new PlaywrightStaticRenderer() }) } });
    expect(await worker.runOnce()).toMatchObject({ id: job.id, status: "completed", result: { count: 1 } });
    const [output] = await repos.outputs.listByProject(project.id);
    expect(output).toMatchObject({ width: 1080, height: 1080, sourceAssetIds: [upload.id], metadata: { origin: "render", documentId: document.id, documentRevision: 2, formatId: "post-1x1" } });
    expect(output.label).toBe("Canvas Post 1:1 · rev 2");

    // Restaurar a 1 cria a revisão 4 com o conteúdo da 1; a 2 (renderizada) segue intacta.
    const restored = await restoreRevision(repos, document.id, 1);
    expect(restored.revision).toMatchObject({ revision: 4, origin: "restore" });
    expect((await repos.documents.getRevision(document.id, 4))!.content).toEqual(base);
    expect(JSON.stringify((await repos.documents.getRevision(document.id, 2))!.content)).toContain("Com imagem");
    expect((await repos.documents.listRevisions(document.id)).map((r) => r.revision)).toEqual([4, 3, 2, 1]);

    // Excluir documento remove revisões mas não as peças finais.
    await deleteDocument(repos, document.id);
    expect(await repos.documents.getById(document.id)).toBeNull();
    expect(await repos.documents.getRevision(document.id, 1)).toBeNull();
    expect(await repos.outputs.listByProject(project.id)).toHaveLength(1);
  }, 60_000);
});

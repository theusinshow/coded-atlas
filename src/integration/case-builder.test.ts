import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Asset } from "../core/assets/asset";
import { createOutput } from "../core/assets/output";
import { contentStorageKey } from "../core/assets/storage-key";
import { buildCaseOutline, isPublishable, type CaseContent } from "../core/case/case-document";
import type { ModelGateway, StructuredRequest, StructuredResponse } from "../core/brain/model-gateway";
import { ATLAS_TOKENS } from "../core/creative/tokens";
import { createVisualProfile } from "../core/creative/visual-profile";
import { openDatabase, type AtlasDatabase } from "../infrastructure/db/client";
import { createRepositories, type Repositories } from "../infrastructure/db/repositories";
import { ChromiumCaseExporter } from "../infrastructure/render/chromium-case-exporter";
import { PlaywrightStaticRenderer } from "../infrastructure/render/playwright-static-renderer";
import { SharpMediaProbe } from "../infrastructure/sharp/media-probe";
import { LocalAssetStorage } from "../infrastructure/storage/local-asset-storage";
import { createCaseCopyJobHandler, inventedFigures, requestCaseCopy } from "../modules/brain/case-copy";
import { createCase, enqueueDocumentRender, saveCanvas } from "../modules/create/document-service";
import { importUploads } from "../modules/import/upload";
import { createNewProject } from "../modules/projects/project-service";
import { createRenderJobHandler } from "../modules/render/render-job";
import { CaseView } from "../render/case-view";
import { isDomainError } from "../shared/errors";
import { newId } from "../shared/id";
import { JobWorker } from "../workers/job-worker";
import { createHash } from "node:crypto";

let dir: string;
let database: AtlasDatabase;
let repos: Repositories;
let storage: LocalAssetStorage;

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "atlas-case-"));
  database = openDatabase({ file: path.join(dir, "atlas.db") });
  repos = createRepositories(database.db);
  storage = await LocalAssetStorage.open(path.join(dir, "storage"));
});
afterEach(() => {
  database.close();
  rmSync(dir, { recursive: true, force: true });
});

const png = (w: number, h: number, c: string) => sharp({ create: { width: w, height: h, channels: 3, background: c } }).png().toBuffer();

async function setup(name = "Estúdio Norte") {
  const { project } = await createNewProject({ ...repos, storage }, { name, category: "Site Institucional", client: "Norte Engenharia", description: "Site para aprovar projetos de engenharia com menos idas e vindas.", url: "https://www.norte.example/" });
  const deps = { ...repos, storage, probe: new SharpMediaProbe() };
  const tag = async (bytes: Buffer, metadata: Asset["metadata"], kind: Asset["kind"] = "screenshot") => {
    const up = (await importUploads(deps, project.id, [{ name: "x.png", bytes }], "screenshot")).created[0];
    const created = await repos.assets.create({ ...up, kind, id: newId() as Asset["id"], metadata: { ...up.metadata, ...metadata } });
    await repos.assets.delete(up.id);
    return created;
  };
  await tag(await png(1440, 900, "#1d3557"), { role: "viewport", device: "desktop" });
  await tag(await png(390, 844, "#e63946"), { role: "viewport", device: "mobile" });
  await tag(await png(1440, 700, "#457b9d"), { role: "section", device: "desktop", sectionIndex: 1 }, "section");
  await repos.visualProfiles.create(createVisualProfile({ projectId: project.id, revision: 1, palette: ["#0f1014", "#e63946"], fonts: ["Sora"], techStack: ["Next.js"], source: "manual" }));
  return project;
}

describe("esqueleto do case", () => {
  it("segue o gerador do v1 em seções: contexto, desktop, desafio, mobile, solução, galeria, identidade, ficha", async () => {
    const project = await setup();
    const assets = await repos.assets.listByProject(project.id);
    const profile = await repos.visualProfiles.latest(project.id);
    const content = buildCaseOutline({ project, assets, url: "https://www.norte.example/", profile, coverAssetId: null, style: { mode: "hybrid", profileRevision: 1 }, year: "2026" });
    expect(content.sections.map((s) => s.type)).toEqual(["text", "image", "text", "image", "text", "gallery", "identity", "facts"]);
    expect(content.sections.filter((s) => s.type === "text").map((s) => (s as { body: string }).body.length > 0)).toEqual([true, false, false]);
    const facts = content.sections.at(-1) as Extract<CaseContent["sections"][number], { type: "facts" }>;
    expect(facts.items).toEqual([
      { label: "Cliente", value: "Norte Engenharia" },
      { label: "Categoria", value: "Site Institucional" },
      { label: "Site", value: "norte.example" },
      { label: "Tecnologia", value: "Next.js" },
      { label: "Desenvolvimento", value: "Coded by M" },
    ]);
    expect(content.case.coverAssetId).not.toBeNull();
  });

  it("CaseView publica só texto preenchido; no editor o vazio aparece como lembrete", async () => {
    const project = await setup();
    const content = buildCaseOutline({ project, assets: await repos.assets.listByProject(project.id), url: null, profile: null, coverAssetId: null, style: { mode: "atlas", profileRevision: null }, year: "2026" });
    const props = { content, tokens: ATLAS_TOKENS, resolveAsset: () => "data:,", resolveOutput: () => "data:," };
    const published = renderToStaticMarkup(createElement(CaseView, { ...props, mode: "publish" }));
    const edit = renderToStaticMarkup(createElement(CaseView, { ...props, mode: "edit" }));
    expect(content.sections.filter(isPublishable)).toHaveLength(content.sections.length - 2);
    expect(published).not.toContain("Desafio");
    expect(edit).toContain("Desafio");
    expect(edit).toContain("vazio não é publicado");
    expect(published).toContain("Desenvolvido por Coded by M");
  });
});

describe("guardrails de redação", () => {
  it("números/métricas fora do contexto são invenção", () => {
    const context = "Site para 12 obras em 2024. Tráfego: 30% via busca.";
    expect(inventedFigures("Atendeu 12 obras e aumentou 40% as conversões.", context)).toEqual(["40%"]);
    expect(inventedFigures("Faturamento de R$ 2 milhões.", context).length).toBeGreaterThan(0);
    expect(inventedFigures("30% via busca, como o cliente relatou.", context)).toEqual([]);
    expect(inventedFigures("Um site mais claro e rápido.", context)).toEqual([]);
  });
});

class FakeGateway implements ModelGateway {
  readonly provider = "fake";
  readonly model = "fake-luna";
  calls: StructuredRequest[] = [];
  constructor(private readonly reply: (req: StructuredRequest) => unknown) {}
  async generateStructured(request: StructuredRequest): Promise<StructuredResponse> {
    this.calls.push(request);
    return { output: this.reply(request), model: this.model, effort: "medium", usage: { inputTokens: 500, cachedTokens: 0, outputTokens: 200 }, latencyMs: 10 };
  }
}

describe("case com banco", () => {
  it("cria, valida peças do próprio projeto e o Brain escreve só trechos vazios sem inventar números", async () => {
    const project = await setup();
    const { document } = await createCase({ ...repos, sources: repos.sources, directions: repos.directions }, project.id);
    expect(document).toMatchObject({ kind: "case", name: "Case · Estúdio Norte" });
    const content = (await repos.documents.getRevision(document.id, 1))!.content as CaseContent;

    // Peça de OUTRO projeto é recusada.
    const other = await setup("Outro Projeto");
    const bytes = await png(400, 300, "#ffffff");
    const sha = createHash("sha256").update(bytes).digest("hex");
    const key = contentStorageKey("renders", sha, "png");
    await storage.put(key, new Uint8Array(bytes)).catch(() => undefined);
    const foreign = await repos.outputs.create(createOutput({ projectId: other.id, format: "png", mimeType: "image/png", storageKey: key, sha256: sha, byteSize: bytes.byteLength, width: 400, height: 300 }));
    await expect(saveCanvas(repos, document.id, 1, { ...content, sections: [...content.sections, { id: "p", type: "piece", outputId: foreign.id, caption: "" }] })).rejects.toSatisfy((e: unknown) => isDomainError(e, "VALIDATION"));

    // Matheus já escreveu o "Desafio"; o Brain deve preencher só a "Solução".
    const desafio = content.sections.find((s) => s.type === "text" && s.heading === "Desafio")!;
    const solucao = content.sections.find((s) => s.type === "text" && s.heading === "Solução")!;
    const written: CaseContent = { ...content, sections: content.sections.map((s) => (s.id === desafio.id ? { ...s, body: "Texto do Matheus." } : s)) };
    await saveCanvas(repos, document.id, 1, written);

    const gateway = new FakeGateway(() => ({
      sections: [
        { sectionId: solucao.id, heading: "Solução", body: "Uma página direta ao ponto, com o portfólio de obras em destaque." },
        { sectionId: desafio.id, heading: "Desafio", body: "Tentativa de sobrescrever." },
      ],
    }));
    const deps = { ...repos, brain: { gateway, pricing: null, budget: { monthlyLimitUsd: null, mode: "warn" as const }, imageCount: 0 } };
    await requestCaseCopy(deps, document.id);
    const worker = new JobWorker({ jobs: repos.jobs, handlers: { copy: createCaseCopyJobHandler(deps) } });
    expect(await worker.runOnce()).toMatchObject({ status: "completed", result: { filled: 1 } });
    const after = (await repos.documents.getRevision(document.id, (await repos.documents.getById(document.id))!.headRevision))!.content as CaseContent;
    expect(after.sections.find((s) => s.id === desafio.id)).toMatchObject({ body: "Texto do Matheus." });
    expect(after.sections.find((s) => s.id === solucao.id)).toMatchObject({ body: "Uma página direta ao ponto, com o portfólio de obras em destaque." });
    expect(JSON.stringify(gateway.calls[0].messages)).toContain("Norte Engenharia");

    // Resposta com métrica inventada é recusada inteira (nada muda).
    const liar = new FakeGateway(() => ({ sections: [{ sectionId: after.sections.find((s) => s.type === "text" && !("body" in s && s.body))?.id ?? "x", heading: "X", body: "Aumentou 300% as vendas." }] }));
    const empty = after.sections.find((s) => s.type === "text" && !(s as { body: string }).body.trim());
    if (empty) {
      const liarDeps = { ...deps, brain: { ...deps.brain, gateway: liar } };
      await requestCaseCopy(liarDeps, document.id);
      const w2 = new JobWorker({ jobs: repos.jobs, handlers: { copy: createCaseCopyJobHandler(liarDeps) } });
      expect(await w2.runOnce()).toMatchObject({ status: "failed" });
    }
    // Sem IA: pedir redação é erro claro.
    await expect(requestCaseCopy({ ...deps, brain: { ...deps.brain, gateway: null } }, document.id)).rejects.toSatisfy((e: unknown) => isDomainError(e, "VALIDATION"));
  });

  it("exportação real: página web (ZIP), PDF paginado e módulos PNG de 1400 px", async () => {
    const project = await setup();
    const { document } = await createCase({ ...repos, sources: repos.sources, directions: repos.directions }, project.id);
    const content = (await repos.documents.getRevision(document.id, 1))!.content as CaseContent;
    await saveCanvas(repos, document.id, 1, { ...content, sections: content.sections.map((s) => (s.type === "text" && !s.body ? { ...s, body: "Texto real do case." } : s)) });

    const worker = new JobWorker({ jobs: repos.jobs, handlers: { render: createRenderJobHandler({ ...repos, storage, renderer: new PlaywrightStaticRenderer(), caseExporter: new ChromiumCaseExporter() }) } });
    const job = await enqueueDocumentRender(repos, document.id, 2, ["zip", "pdf", "png"]);
    const done = await worker.runOnce();
    expect(done).toMatchObject({ id: job.id, status: "completed" });
    const outputs = await repos.outputs.listByProject(project.id);

    const zip = outputs.find((o) => o.format === "zip")!;
    expect(zip).toMatchObject({ mimeType: "application/zip", metadata: { caseModule: "web", documentId: document.id } });
    const zipBytes = Buffer.from(await storage.get(zip.storageKey));
    expect(zipBytes.includes(Buffer.from("index.html")) && zipBytes.includes(Buffer.from("assets/")) && zipBytes.includes(Buffer.from("fonts/"))).toBe(true);
    expect(zipBytes.includes(Buffer.from("atlas.render"))).toBe(false);

    const pdf = await PDFDocument.load(await storage.get(outputs.find((o) => o.format === "pdf")!.storageKey));
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);

    const modules = outputs.filter((o) => o.format === "png").sort((a, b) => (a.metadata.page ?? 0) - (b.metadata.page ?? 0));
    expect(modules.length).toBe(content.sections.length + 2); // capa + seções + rodapé
    expect(modules.every((m) => m.width === 1400)).toBe(true);
    expect(modules[0].metadata.caseModule).toBe("hero");
  }, 120_000);
});

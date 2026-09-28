import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildShortlist } from "../core/brain/context";
import { ModelGatewayError, type ModelGateway, type StructuredRequest, type StructuredResponse } from "../core/brain/model-gateway";
import type { PlanOutput } from "../core/brain/plan";
import { budgetState, estimateCost, monthStart } from "../core/brain/usage";
import { createVisualProfile } from "../core/creative/visual-profile";
import { OpenAIResponsesGateway } from "../infrastructure/ai/openai/openai-responses-gateway";
import { resolveBudget, resolvePricing } from "../infrastructure/ai/brain-config";
import { openDatabase, type AtlasDatabase } from "../infrastructure/db/client";
import { createRepositories, type Repositories } from "../infrastructure/db/repositories";
import { SharpMediaProbe } from "../infrastructure/sharp/media-probe";
import { LocalAssetStorage } from "../infrastructure/storage/local-asset-storage";
import { applyPlan, createPlanJobHandler, discardPlan, generatePlan, requestPlan, type BrainDeps, type BrainSettings } from "../modules/brain/plan-service";
import { planJsonSchema } from "../modules/brain/prompts";
import { importUploads } from "../modules/import/upload";
import { createNewProject } from "../modules/projects/project-service";
import { isDomainError } from "../shared/errors";
import { newId } from "../shared/id";
import { JobWorker } from "../workers/job-worker";

let dir: string;
let database: AtlasDatabase;
let repos: Repositories;
let storage: LocalAssetStorage;

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "atlas-brain-"));
  database = openDatabase({ file: path.join(dir, "atlas.db") });
  repos = createRepositories(database.db);
  storage = await LocalAssetStorage.open(path.join(dir, "storage"));
});
afterEach(() => {
  database.close();
  rmSync(dir, { recursive: true, force: true });
});

const png = (w: number, h: number, c: string) => sharp({ create: { width: w, height: h, channels: 3, background: c } }).png().toBuffer();

async function setup() {
  const { project } = await createNewProject({ ...repos, storage }, { name: "Estúdio Norte", category: "Site Institucional", url: "https://norte.example" });
  const deps = { ...repos, storage, probe: new SharpMediaProbe() };
  const desktop = (await importUploads(deps, project.id, [{ name: "home.png", bytes: await png(1440, 900, "#1d3557") }], "screenshot")).created[0];
  const uploaded = (await importUploads(deps, project.id, [{ name: "mobile.png", bytes: await png(390, 844, "#e63946") }], "screenshot")).created[0];
  const tiny = (await importUploads(deps, project.id, [{ name: "icon.png", bytes: await png(64, 64, "#000000") }], "logo")).created[0];
  // Asset é imutável: o "screenshot mobile" é um registro novo sobre os mesmos bytes.
  const mobile = await repos.assets.create({ ...uploaded, id: newId() as typeof uploaded.id, metadata: { ...uploaded.metadata, device: "mobile" } });
  await repos.assets.delete(uploaded.id);
  await repos.visualProfiles.create(createVisualProfile({ projectId: project.id, revision: 1, palette: ["#fbfcfd", "#1d3557", "#e63946"], fonts: ["Inter"], techStack: ["Next.js"], source: "manual" }));
  return { project, desktop, mobile, tiny };
}

class FakeGateway implements ModelGateway {
  readonly provider = "fake";
  readonly model = "fake-luna";
  calls: StructuredRequest[] = [];
  constructor(private readonly replies: (unknown | Error)[]) {}
  async generateStructured(request: StructuredRequest): Promise<StructuredResponse> {
    this.calls.push(request);
    const reply = this.replies.shift();
    if (reply instanceof Error) throw reply;
    return { output: reply, model: this.model, effort: request.level === "complex" ? "high" : "medium", usage: { inputTokens: 1200, cachedTokens: 200, outputTokens: 300 }, latencyMs: 42 };
  }
}

function brainDeps(settings: Partial<BrainSettings>): BrainDeps {
  return { ...repos, brain: { gateway: null, pricing: { inputPerMTok: 2, cachedInputPerMTok: 0.5, outputPerMTok: 8 }, budget: { monthlyLimitUsd: null, mode: "warn" }, imageCount: 2, ...settings } };
}

function goodOutput(desktopId: string, mobileId: string): PlanOutput {
  return {
    summary: "Lançamento focado no site real, desktop e mobile juntos.",
    direction: { tone: "Técnico e confiante", emphasis: "Responsividade", styleMode: "hybrid", accent: "#e63946" },
    assetRanking: [
      { assetId: desktopId, score: 0.95, reason: "Primeira dobra forte." },
      { assetId: mobileId, score: 0.8, reason: "Mostra o mobile." },
    ],
    items: [
      {
        compositionId: "desktop-mobile",
        formatId: "post-4x5",
        variant: "right",
        assets: [
          { slotId: "desktop", assetId: desktopId },
          { slotId: "mobile", assetId: mobileId },
        ],
        texts: [{ slotId: "title", text: "Novo site no ar" }],
        rationale: "Desktop e mobile juntos provam a responsividade.",
      },
    ],
  };
}

const run = new AbortController().signal;

describe("Context Builder: lista curta determinística", () => {
  it("tira duplicatas por conteúdo, imagens pequenas e derivadas; prioriza a primeira dobra", async () => {
    const { project, desktop, tiny } = await setup();
    const assets = await repos.assets.listByProject(project.id);
    const duplicate = { ...desktop, id: "01M3K0H1GXRCVV5MRNY75J0T4V" as typeof desktop.id, createdAt: "2020-01-01T00:00:00.000Z" };
    const derived = { ...desktop, id: "01M3K0H1GXRCVV5MRNY75J0T4W" as typeof desktop.id, sha256: "f".repeat(64), metadata: { origin: "derived" as const, role: "cover" } };
    const list = buildShortlist([...assets, duplicate, derived]);
    const ids = list.map((s) => s.id);
    expect(ids).not.toContain(tiny.id);
    expect(ids).not.toContain(duplicate.id);
    expect(ids).not.toContain(derived.id);
    expect(ids).toHaveLength(2);
    expect(list[0].describe).toContain("primeira dobra");

    // Seção com os MESMOS bytes do screenshot principal (hero do v1), criada depois: o screenshot vence.
    const hero = { ...desktop, id: "01M3K0H1GXRCVV5MRNY75J0T4X" as typeof desktop.id, kind: "section" as const, createdAt: "2099-01-01T00:00:00.000Z", metadata: { origin: "legacy" as const, role: "section", device: "desktop" as const } };
    const viewport = { ...desktop, metadata: { ...desktop.metadata, role: "viewport", device: "desktop" as const } };
    const withHero = buildShortlist([viewport, hero]);
    expect(withHero.map((s) => s.id)).toEqual([desktop.id]);
  });
});

describe("custo e orçamento", () => {
  it("estima custo só com preço configurado e classifica o orçamento", () => {
    expect(estimateCost({ inputTokens: 1_000_000, cachedTokens: 200_000, outputTokens: 100_000 }, { inputPerMTok: 2, cachedInputPerMTok: 0.5, outputPerMTok: 8 })).toBe(2.5);
    expect(estimateCost({ inputTokens: 10, cachedTokens: 0, outputTokens: 10 }, null)).toBeNull();
    expect(budgetState(5, { monthlyLimitUsd: null, mode: "warn" })).toBe("ok");
    expect(budgetState(8.5, { monthlyLimitUsd: 10, mode: "warn" })).toBe("warning");
    expect(budgetState(10, { monthlyLimitUsd: 10, mode: "block" })).toBe("exceeded");
    expect(resolvePricing({})).toBeNull();
    expect(resolvePricing({ ATLAS_AI_PRICE_INPUT: "2", ATLAS_AI_PRICE_OUTPUT: "8" })).toEqual({ inputPerMTok: 2, cachedInputPerMTok: 2, outputPerMTok: 8 });
    expect(resolveBudget({ ATLAS_AI_BUDGET_USD: "20", ATLAS_AI_BUDGET_MODE: "block" })).toEqual({ monthlyLimitUsd: 20, mode: "block" });
  });

  it("o JSON Schema do plano é estrito (sem campos extras, tudo obrigatório)", () => {
    const schema = planJsonSchema() as { additionalProperties: boolean; required: string[]; $schema?: string };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["summary", "direction", "assetRanking", "items"]);
    expect(schema.$schema).toBeUndefined();
    expect(JSON.stringify(schema)).not.toContain("maxLength");
  });
});

describe("Atlas Brain: plano criativo", () => {
  it("sem IA: plano determinístico, nenhuma chamada registrada", async () => {
    const { project } = await setup();
    const plan = await generatePlan(brainDeps({ gateway: null }), project.id, { request: { goal: "launch-post", notes: "", formats: [] }, parentId: null }, run);
    expect(plan).toMatchObject({ source: "fallback", model: null, status: "draft", visualProfileRevision: 1 });
    expect(plan.items.length).toBeGreaterThan(0);
    expect(plan.items.every((i) => i.formatId === "post-4x5")).toBe(true);
    expect((await repos.aiUsage.summarizeSince(monthStart())).calls).toBe(0);
  });

  it("com IA: saída válida vira plano 'brain', slots omitidos são registrados, uso e custo gravados", async () => {
    const { project, desktop, mobile } = await setup();
    const gateway = new FakeGateway([goodOutput(desktop.id, mobile.id)]);
    const plan = await generatePlan(brainDeps({ gateway }), project.id, { request: { goal: "launch-post", notes: "foco em mobile", formats: [], maxItems: 2 }, parentId: null }, run);
    expect(plan).toMatchObject({ source: "brain", model: "fake-luna", direction: { accent: "#e63946", styleMode: "hybrid" } });
    expect(plan.items[0]).toMatchObject({ compositionId: "desktop-mobile", variant: "right", bindings: { desktop: { assetId: desktop.id }, mobile: { assetId: mobile.id }, title: { text: "Novo site no ar" } } });
    expect(plan.warnings.some((w) => w.includes("preenchido(s) automaticamente"))).toBe(true);
    // Prompt: regras estáveis primeiro, imagens da lista curta, pedido com as observações.
    const request = gateway.calls[0];
    expect(request.messages[0].role).toBe("developer");
    expect(request.messages[1].content.filter((p) => p.type === "image")).toHaveLength(2);
    expect(JSON.stringify(request.messages)).toContain("foco em mobile");
    expect(request.level).toBe("creative");
    const usage = await repos.aiUsage.listRecent(10);
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ task: "creative-plan", status: "ok", inputTokens: 1200, cachedTokens: 200, outputTokens: 300, estimatedCostUsd: 0.0045 });
  });

  it("saída inválida → 1 reparo com os erros → plano válido", async () => {
    const { project, desktop, mobile } = await setup();
    const bad = goodOutput(desktop.id, mobile.id);
    bad.items[0] = { ...bad.items[0], compositionId: "inventada", formatId: "post-4x5" };
    const gateway = new FakeGateway([bad, goodOutput(desktop.id, mobile.id)]);
    const plan = await generatePlan(brainDeps({ gateway }), project.id, { request: { goal: "launch-post", notes: "", formats: [] }, parentId: null }, run);
    expect(plan.source).toBe("brain");
    expect(gateway.calls).toHaveLength(2);
    expect(JSON.stringify(gateway.calls[1].messages.at(-1))).toContain('composição \\"inventada\\" não existe');
    expect((await repos.aiUsage.listRecent(10)).map((u) => `${u.task}:${u.status}`).sort()).toEqual(["creative-plan-repair:ok", "creative-plan:invalid"]);
  });

  it("IDs inventados, formato sem suporte e texto longo nunca passam: dois erros → regras do Atlas, com aviso", async () => {
    const { project, desktop, mobile } = await setup();
    const bad = goodOutput(desktop.id, mobile.id);
    bad.items[0] = { ...bad.items[0], formatId: "banner-3x1", assets: [{ slotId: "desktop", assetId: "01ZZZZZZZZZZZZZZZZZZZZZZZZ" }], texts: [{ slotId: "title", text: "x".repeat(500) }] };
    const gateway = new FakeGateway([bad, bad]);
    const plan = await generatePlan(brainDeps({ gateway }), project.id, { request: { goal: "launch-post", notes: "", formats: [] }, parentId: null }, run);
    expect(plan.source).toBe("fallback");
    expect(plan.warnings.some((w) => w.includes("não passou na validação"))).toBe(true);
    const errors = JSON.stringify(gateway.calls[1].messages.at(-1));
    expect(errors).toContain("não está na lista curta");
    expect(errors).toContain("não é suportado");
    expect(errors).toContain("máximo");
  });

  it("falha do provedor → regras do Atlas; orçamento estourado em modo block nem chama o modelo", async () => {
    const { project } = await setup();
    const failing = new FakeGateway([new ModelGatewayError("rate limit")]);
    const plan = await generatePlan(brainDeps({ gateway: failing }), project.id, { request: { goal: "story", notes: "", formats: [] }, parentId: null }, run);
    expect(plan.source).toBe("fallback");
    expect(plan.warnings[0]).toContain("rate limit");
    expect((await repos.aiUsage.listRecent(5))[0]).toMatchObject({ status: "error" });

    const blocked = new FakeGateway([]);
    const deps = brainDeps({ gateway: blocked, budget: { monthlyLimitUsd: 0, mode: "block" } });
    const second = await generatePlan(deps, project.id, { request: { goal: "cover", notes: "", formats: [] }, parentId: null }, run);
    expect(blocked.calls).toHaveLength(0);
    expect(second.warnings[0]).toContain("Orçamento");
  });

  it("job de plano, revisão com o plano anterior, aplicar vira rascunhos, descartar", async () => {
    const { project, desktop, mobile } = await setup();
    const gateway = new FakeGateway([goodOutput(desktop.id, mobile.id), goodOutput(desktop.id, mobile.id)]);
    const deps = brainDeps({ gateway });
    const worker = new JobWorker({ jobs: repos.jobs, handlers: { plan: createPlanJobHandler(deps) } });

    const job = await requestPlan(deps, project.id, { goal: "launch-post" });
    const done = await worker.runOnce();
    expect(done).toMatchObject({ id: job.id, status: "completed", result: { source: "brain", items: 1 } });
    const planId = (done!.result as { planId: string }).planId;

    await requestPlan(deps, project.id, { goal: "launch-post", feedback: "mais minimalista" }, planId);
    const revised = await worker.runOnce();
    const revision = await repos.plans.getById((revised!.result as { planId: string }).planId as never);
    expect(revision).toMatchObject({ parentId: planId, request: { feedback: "mais minimalista" } });
    expect(gateway.calls[1].level).toBe("complex");
    expect(JSON.stringify(gateway.calls[1].messages)).toContain("mais minimalista");

    const applied = await applyPlan({ plans: repos.plans, composition: repos }, planId as never);
    expect(applied.status).toBe("applied");
    const instances = await repos.compositionInstances.listByProject(project.id);
    expect(instances).toHaveLength(1);
    expect(instances[0]).toMatchObject({ compositionId: "desktop-mobile", variant: "right", overrides: { primary: "#e63946" }, bindings: { title: { text: "Novo site no ar" } } });

    const discarded = await discardPlan(deps, revision!.id);
    expect(discarded.status).toBe("discarded");
    await expect(applyPlan({ plans: repos.plans, composition: repos }, revision!.id)).rejects.toSatisfy((e: unknown) => isDomainError(e, "INVALID_TRANSITION"));
  });
});

describe("OpenAIResponsesGateway (fetch simulado)", () => {
  function fakeFetch(body: unknown, capture: { request?: Record<string, unknown> }): typeof fetch {
    return (async (_url: string | URL | Request, init?: RequestInit) => {
      capture.request = JSON.parse(String(init?.body));
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
  }
  const reply = (status: string, text: string) => ({
    id: "resp_1",
    object: "response",
    created_at: 0,
    status,
    model: "gpt-6-luna-2026",
    output: [{ type: "message", id: "m1", status: "completed", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] }],
    usage: { input_tokens: 900, input_tokens_details: { cached_tokens: 100, cache_write_tokens: 0 }, output_tokens: 150, output_tokens_details: { reasoning_tokens: 50 }, total_tokens: 1050 },
  });

  it("monta Structured Outputs estrito com esforço e imagem, e lê uso/modelo", async () => {
    const capture: { request?: Record<string, unknown> } = {};
    const gateway = new OpenAIResponsesGateway({
      apiKey: "sk-test",
      model: "gpt-6-luna",
      fetch: fakeFetch(reply("completed", '{"ok":true}'), capture),
      loadImage: async () => ({ mimeType: "image/webp", bytes: new Uint8Array([1, 2, 3]) }),
    });
    const res = await gateway.generateStructured(
      {
        task: "t",
        level: "complex",
        messages: [
          { role: "developer", content: [{ type: "text", text: "regras" }] },
          { role: "user", content: [{ type: "image", assetId: "a", detail: "low" }] },
        ],
        schema: { name: "creative_plan", jsonSchema: { type: "object" } },
      },
      new AbortController().signal
    );
    expect(res).toMatchObject({ output: { ok: true }, model: "gpt-6-luna-2026", effort: "high", usage: { inputTokens: 900, cachedTokens: 100, outputTokens: 150 } });
    expect(capture.request).toMatchObject({
      model: "gpt-6-luna",
      reasoning: { effort: "high" },
      store: false,
      text: { format: { type: "json_schema", name: "creative_plan", strict: true } },
    });
    expect(JSON.stringify(capture.request)).toContain("data:image/webp;base64,AQID");
  });

  it("resposta incompleta ou não-JSON vira ModelGatewayError (com uso)", async () => {
    const incomplete = new OpenAIResponsesGateway({ apiKey: "k", model: "m", fetch: fakeFetch(reply("incomplete", "{"), {}) });
    const req = { task: "t", level: "routine" as const, messages: [], schema: { name: "s", jsonSchema: {} } };
    await expect(incomplete.generateStructured(req, new AbortController().signal)).rejects.toSatisfy((e: unknown) => e instanceof ModelGatewayError && e.usage?.inputTokens === 900);
    const notJson = new OpenAIResponsesGateway({ apiKey: "k", model: "m", fetch: fakeFetch(reply("completed", "texto solto"), {}) });
    await expect(notJson.generateStructured(req, new AbortController().signal)).rejects.toBeInstanceOf(ModelGatewayError);
  });
});

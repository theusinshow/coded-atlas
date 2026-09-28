import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildShortlist } from "../core/brain/context";
import { deterministicPlan, validatePlanOutput, type CreativeRequest } from "../core/brain/plan";
import { autoBind } from "../core/creative/auto-bind";
import { COMPOSITIONS } from "../core/creative/compositions";
import { FORMAT_IDS } from "../core/creative/formats";
import { estimateTextLines, lintArtboard } from "../core/creative/guardrails";
import { buildArtboard } from "../core/creative/instance-artboard";
import { createMemory, resolvePreferences } from "../core/creative/memory";
import { ATLAS_TOKENS, resolveTokens } from "../core/creative/tokens";
import { createVisualProfile } from "../core/creative/visual-profile";
import { ArtboardSchema } from "../core/documents/artboard";
import { openDatabase, type AtlasDatabase } from "../infrastructure/db/client";
import { createRepositories, type Repositories } from "../infrastructure/db/repositories";
import { SharpMediaProbe } from "../infrastructure/sharp/media-probe";
import { LocalAssetStorage } from "../infrastructure/storage/local-asset-storage";
import { applyPlan, discardPlan, generatePlan, type BrainDeps } from "../modules/brain/plan-service";
import { addMemory, reviseVisualProfile, saveDirectionFromPlan } from "../modules/creative/creative-service";
import { importUploads } from "../modules/import/upload";
import { createNewProject } from "../modules/projects/project-service";
import { isDomainError } from "../shared/errors";
import { newId } from "../shared/id";

let dir: string;
let database: AtlasDatabase;
let repos: Repositories;
let storage: LocalAssetStorage;

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "atlas-creative-"));
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
  const { project } = await createNewProject({ ...repos, storage }, { name: "Estúdio Norte", category: "Site", url: "https://norte.example" });
  const deps = { ...repos, storage, probe: new SharpMediaProbe() };
  await importUploads(deps, project.id, [{ name: "home.png", bytes: await png(1440, 900, "#1d3557") }], "screenshot");
  const up = (await importUploads(deps, project.id, [{ name: "m.png", bytes: await png(390, 844, "#e63946") }], "screenshot")).created[0];
  await repos.assets.create({ ...up, id: newId() as typeof up.id, metadata: { ...up.metadata, device: "mobile" } });
  await repos.assets.delete(up.id);
  await repos.visualProfiles.create(createVisualProfile({ projectId: project.id, revision: 1, palette: ["#fbfcfd", "#1d3557", "#e63946"], fonts: ["Inter"], techStack: ["Next.js"], source: "inspection" }));
  return project;
}

const brainDeps = (): BrainDeps => ({ ...repos, brain: { gateway: null, pricing: null, budget: { monthlyLimitUsd: null, mode: "warn" }, imageCount: 0 } });
const request = (r: Partial<CreativeRequest> = {}): CreativeRequest => ({ goal: "launch-post", notes: "", formats: [], ...r });
const signal = new AbortController().signal;

describe("memória criativa: precedência", () => {
  it("projeto vence workspace, manual vence sinal, e o peso decide entre sinais", () => {
    const projectId = newId() as never;
    const prefs = resolvePreferences([
      createMemory({ scope: "workspace", projectId: null, polarity: "prefer", subject: "composition", value: "desktop-hero" }),
      createMemory({ scope: "project", projectId, polarity: "avoid", subject: "composition", value: "desktop-hero" }),
      createMemory({ scope: "project", projectId, polarity: "prefer", subject: "composition", value: "mobile-stack", source: "signal", weight: 2 }),
      createMemory({ scope: "project", projectId, polarity: "avoid", subject: "composition", value: "mobile-stack", source: "signal", weight: 5 }),
      createMemory({ scope: "workspace", projectId: null, polarity: "prefer", subject: "style", value: "atlas" }),
      createMemory({ scope: "project", projectId, polarity: "prefer", subject: "style", value: "project" }),
      createMemory({ scope: "workspace", projectId: null, polarity: "avoid", subject: "tone", value: "linguagem de startup" }),
    ]);
    expect([...prefs.avoidCompositions].sort()).toEqual(["desktop-hero", "mobile-stack"]);
    expect(prefs.styleMode).toBe("project");
    expect(prefs.notes).toEqual(["Coded by M — evitar: linguagem de startup"]);
  });

  it("o plano determinístico respeita evitar/preferir e a direção; o modelo não pode usar composição evitada", async () => {
    const project = await setup();
    const assets = await repos.assets.listByProject(project.id);
    const bindingContext = { project, assets, url: null };
    const shortlist = buildShortlist(assets);
    const prefs = resolvePreferences([
      createMemory({ scope: "project", projectId: project.id, polarity: "avoid", subject: "composition", value: "desktop-mobile" }),
      createMemory({ scope: "project", projectId: project.id, polarity: "prefer", subject: "composition", value: "editorial-split" }),
    ]);
    const direction = { tone: "Sóbrio", emphasis: "Engenharia", styleMode: "atlas" as const, accent: "#ff5500" };
    const plan = deterministicPlan({ request: request(), compositions: COMPOSITIONS, bindingContext, shortlist, hasPalette: true, category: "Site", preferences: prefs, direction });
    const ids = plan.items.map((i) => i.compositionId);
    expect(ids).not.toContain("desktop-mobile");
    expect(ids[0]).toBe("editorial-split");
    expect(plan.direction).toEqual(direction);

    const result = validatePlanOutput(
      {
        summary: "s",
        direction: { tone: "t", emphasis: "e", styleMode: "hybrid", accent: null },
        assetRanking: [],
        items: [{ compositionId: "desktop-mobile", formatId: "post-4x5", variant: "right", assets: [], texts: [], rationale: "r" }],
      },
      { compositions: COMPOSITIONS, shortlist, bindingContext, request: request(), avoidCompositions: prefs.avoidCompositions }
    );
    expect(result.plan).toBeNull();
    expect(result.errors[0]).toContain("evitar desktop-mobile");
  });
});

describe("sistema criativo com banco", () => {
  it("memória manual (workspace e projeto), sinais de aplicar/descartar e listagem por escopo", async () => {
    const project = await setup();
    await addMemory(repos, { projectId: null, polarity: "note", subject: "general", value: "Sempre creditar a Coded by M" });
    await addMemory(repos, { projectId: project.id, polarity: "prefer", subject: "style", value: "hybrid" });
    await expect(addMemory(repos, { projectId: project.id, polarity: "prefer", subject: "composition", value: "nao-existe" })).rejects.toSatisfy((e: unknown) => isDomainError(e, "VALIDATION"));

    const plan = await generatePlan(brainDeps(), project.id, { request: request({ maxItems: 2 }), parentId: null }, signal);
    await applyPlan({ plans: repos.plans, memory: repos.memory, composition: repos }, plan.id, [0]);
    await applyPlan({ plans: repos.plans, memory: repos.memory, composition: repos }, plan.id, [0]);
    const signals = (await repos.memory.listFor(project.id)).filter((m) => m.source === "signal");
    expect(signals).toEqual([expect.objectContaining({ polarity: "prefer", subject: "composition", value: plan.items[0].compositionId, weight: 2, scope: "project" })]);

    const rejected = await generatePlan(brainDeps(), project.id, { request: request({ goal: "cover" }), parentId: null }, signal);
    await discardPlan({ plans: repos.plans, memory: repos.memory }, rejected.id);
    const avoid = (await repos.memory.listFor(project.id)).filter((m) => m.polarity === "avoid");
    expect(avoid.map((m) => m.value).sort()).toEqual([...new Set(rejected.items.map((i) => i.compositionId))].sort());

    expect((await repos.memory.listWorkspace()).map((m) => m.value)).toEqual(["Sempre creditar a Coded by M"]);
    expect((await repos.memory.listFor(project.id)).length).toBeGreaterThan(2);
  });

  it("direção salva a partir de um plano guia um plano novo", async () => {
    const project = await setup();
    const plan = await generatePlan(brainDeps(), project.id, { request: request({ notes: "foco técnico" }), parentId: null }, signal);
    const direction = await saveDirectionFromPlan(repos, plan.id, "Lançamento técnico");
    expect(direction).toMatchObject({ name: "Lançamento técnico", planId: plan.id, notes: "foco técnico", styleMode: plan.direction.styleMode });
    const next = await generatePlan(brainDeps(), project.id, { request: request({ goal: "story", directionId: direction.id }), parentId: null }, signal);
    expect(next.direction).toEqual({ tone: direction.tone, emphasis: direction.emphasis, styleMode: direction.styleMode, accent: direction.accent });
    expect(next.warnings).toContain('Seguindo a direção "Lançamento técnico".');
  });

  it("corrigir a identidade cria revisão manual nova; a anterior fica intacta", async () => {
    const project = await setup();
    const revised = await reviseVisualProfile(repos, project.id, { palette: ["#0B1F33", "#F2A900", "nada"], fonts: ["Sora", "system-ui"] });
    expect(revised).toMatchObject({ revision: 2, source: "manual", palette: ["#0b1f33", "#f2a900"], fonts: ["Sora"], techStack: ["Next.js"] });
    expect((await repos.visualProfiles.getRevision(project.id, 1))?.palette).toEqual(["#fbfcfd", "#1d3557", "#e63946"]);
    await expect(reviseVisualProfile(repos, project.id, { palette: ["azul"], fonts: [] })).rejects.toSatisfy((e: unknown) => isDomainError(e, "VALIDATION"));
  });
});

describe("guardrails criativos", () => {
  const base = { rotation: 0, opacity: 1, visible: true, locked: false, radius: 0, shadow: "none", blur: 0 };

  it("aponta contraste baixo, texto que não cabe, imagem vazia, elemento fora e excesso de destaque", () => {
    const artboard = ArtboardSchema.parse({
      width: 1080,
      height: 1080,
      background: { fill: "#ffffff", pattern: "none" },
      layers: [
        { ...base, id: "bg", type: "shape", x: 0, y: 0, width: 1080, height: 700, fill: "primary" },
        { ...base, id: "t1", type: "text", x: 40, y: 800, width: 400, height: 60, text: "Texto claro demais sobre branco", size: 40, color: "#f4f4f4" },
        { ...base, id: "t2", type: "text", x: 40, y: 900, width: 200, height: 40, text: "Um título comprido que certamente não cabe em duas linhas nesta caixa", size: 36, color: "#111111" },
        { ...base, id: "img", type: "asset", x: 600, y: 760, width: 300, height: 200, assetId: null },
        { ...base, id: "out", type: "shape", x: 1070, y: 1070, width: 200, height: 200, fill: "text" },
      ],
    });
    const codes = lintArtboard(artboard, ATLAS_TOKENS).map((i) => `${i.code}:${i.layerId ?? "-"}`);
    expect(codes).toEqual(expect.arrayContaining(["low-contrast:t1", "text-overflow:t2", "empty-image:img", "out-of-bounds:out", "accent-overuse:-"]));
    expect(codes).not.toContain("low-contrast:t2");
    expect(estimateTextLines("abc def", 20, 1000)).toBe(1);
  });

  it("as 10 composições curadas saem sem avisos com material completo, em todos os formatos", async () => {
    const project = await setup();
    const assets = await repos.assets.listByProject(project.id);
    const profile = await repos.visualProfiles.latest(project.id);
    const map = new Map(assets.map((a) => [a.id as string, a]));
    const problems: string[] = [];
    for (const definition of COMPOSITIONS) {
      const bindings = autoBind(definition, { project, assets, url: "https://norte.example" });
      for (const formatId of FORMAT_IDS) {
        for (const variant of definition.variants) {
          const artboard = buildArtboard(definition, { formatId, variant: variant.id, bindings }, map, profile);
          for (const mode of ["hybrid", "atlas", "project"] as const) {
            const warnings = lintArtboard(artboard, resolveTokens(profile, mode)).filter((i) => i.severity === "warning" && i.code !== "empty-image");
            for (const w of warnings) problems.push(`${definition.id}/${formatId}/${variant.id}/${mode}: ${w.message}`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

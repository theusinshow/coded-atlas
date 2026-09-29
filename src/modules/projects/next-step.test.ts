import { describe, expect, it } from "vitest";
import { nextStep, stepStatuses, type ProjectProgress } from "./next-step";

const base: ProjectProgress = { hasSiteSource: true, assets: 0, kits: 0, renderedKits: 0, pendingKitId: null, cases: 0, documents: 0, outputs: 0, exports: 0 };

describe("próximo passo do projeto", () => {
  it("segue o fluxo Material → Criar → Entregar, uma ação por vez", () => {
    expect(nextStep({ ...base, hasSiteSource: false })).toMatchObject({ step: "material", href: "#origens" });
    expect(nextStep(base)).toMatchObject({ step: "material", href: "capture", cta: "Capturar agora" });
    expect(nextStep({ ...base, assets: 40 })).toMatchObject({ step: "create", href: "kits", cta: "Gerar Media Kit" });
    expect(nextStep({ ...base, assets: 40, kits: 1, pendingKitId: "K1" })).toMatchObject({ href: "kits/K1" });
    expect(nextStep({ ...base, assets: 40, kits: 1, renderedKits: 1, outputs: 5 })).toMatchObject({ href: "cases" });
    expect(nextStep({ ...base, assets: 40, kits: 1, renderedKits: 1, outputs: 5, cases: 1 })).toMatchObject({ step: "deliver", href: "publish" });
    expect(nextStep({ ...base, assets: 40, kits: 1, renderedKits: 1, outputs: 5, cases: 1, exports: 2 })).toMatchObject({ step: "done" });
  });

  it("estado dos 3 passos com resumo legível", () => {
    const [material, create, deliver] = stepStatuses({ ...base, assets: 40, kits: 1, renderedKits: 1, cases: 1, outputs: 12 });
    expect(material).toMatchObject({ done: true, summary: "40 imagens", href: "assets" });
    expect(create).toMatchObject({ done: true, summary: "1 kit · 1 case" });
    expect(deliver).toMatchObject({ done: false, summary: "12 peças" });
    expect(stepStatuses(base).map((s) => s.done)).toEqual([false, false, false]);
  });
});

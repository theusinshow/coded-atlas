import { describe, expect, it } from "vitest";
import { currentKitFor, getGoal, goalAction, goalOfPreset, GOALS } from "./goals";
import { getKitPreset, type MediaKit } from "./media-kit";

const kit = (presetId: string, createdAt: string, status: MediaKit["status"] = "ready") => ({ presetId, createdAt, status }) as MediaKit;

describe("objetivos", () => {
  it("cada objetivo de mídia aponta para um preset existente; o Case não tem preset", () => {
    for (const g of GOALS) {
      if (g.id === "case") expect(g.presetId).toBeNull();
      else expect(getKitPreset(g.presetId!)).toBeDefined();
    }
    expect(new Set(GOALS.map((g) => g.id)).size).toBe(GOALS.length);
    expect(getGoal("portfolio")?.presetId).toBe("portfolio-kit");
    expect(goalOfPreset("social-kit")?.id).toBe("instagram");
    expect(getGoal("x")).toBeUndefined();
  });

  it("kit atual: o mais recente do preset", () => {
    const kits = [kit("social-kit", "2026-10-01T10:00:00Z"), kit("portfolio-kit", "2026-09-30T10:00:00Z"), kit("portfolio-kit", "2026-10-01T09:00:00Z")];
    expect(currentKitFor(kits, "portfolio-kit")?.createdAt).toBe("2026-10-01T09:00:00Z");
    expect(currentKitFor(kits, "launch-kit")).toBeNull();
  });

  it("ação do cartão: começar, continuar ou pronto", () => {
    expect(goalAction(null)).toBe("start");
    expect(goalAction(kit("portfolio-kit", "x", "ready"))).toBe("resume");
    expect(goalAction(kit("portfolio-kit", "x", "rendering"))).toBe("resume");
    expect(goalAction(kit("portfolio-kit", "x", "failed"))).toBe("resume");
    expect(goalAction(kit("portfolio-kit", "x", "rendered"))).toBe("done");
  });
});

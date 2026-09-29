import { describe, expect, it } from "vitest";
import { assetDetail, assetTitle, formatDuration, plural, relativeTime } from "./format";

describe("texto de interface", () => {
  it("plural, duração e tempo relativo", () => {
    expect(plural(1, "peça", "peças")).toBe("1 peça");
    expect(plural(1200, "peça", "peças")).toBe("1.200 peças");
    expect(formatDuration(10_400)).toBe("0:10");
    expect(formatDuration(75_000)).toBe("1:15");
    const now = new Date("2026-09-29T12:00:00Z");
    expect(relativeTime("2026-09-29T11:59:50Z", now)).toBe("agora");
    expect(relativeTime("2026-09-29T11:50:00Z", now)).toBe("há 10 min");
    expect(relativeTime("2026-09-29T09:00:00Z", now)).toBe("há 3 h");
    expect(relativeTime("2026-09-28T09:00:00Z", now)).toBe("ontem");
  });
  it("título e detalhe de asset sem metadado cru", () => {
    expect(assetTitle({ kind: "section", label: "section-002", metadata: { role: "section", device: "desktop", sectionName: "Serviços" } })).toBe("Serviços");
    expect(assetTitle({ kind: "screenshot", label: "desktop 1440×900", metadata: { role: "viewport", device: "mobile" } })).toBe("Tela · Celular");
    expect(assetTitle({ kind: "image", label: "smart-crop", metadata: { role: "cover" } })).toBe("Capa");
    expect(assetDetail({ kind: "section", metadata: { device: "desktop" } })).toBe("Seção · Desktop");
  });
});

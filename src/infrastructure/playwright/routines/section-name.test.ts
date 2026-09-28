import { describe, expect, it } from "vitest";
import { deriveSectionName, disambiguate, type SectionHints } from "./section-name";

const h = (p: Partial<SectionHints>): SectionHints => ({ tag: "section", ...p });

describe("nomes de seção", () => {
  it.each([
    ["class hero-section → Hero", h({ className: "hero-section dark" }), "Hero"],
    ["id about → Sobre", h({ id: "about" }), "Sobre"],
    ["class our-services → Serviços", h({ className: "our-services" }), "Serviços"],
    ["class services (plural) → Serviços", h({ className: "services" }), "Serviços"],
    ["class pricing-table → Planos", h({ className: "pricing-table" }), "Planos"],
    ["class testimonials → Depoimentos", h({ className: "testimonials" }), "Depoimentos"],
    ["aria-label Contato → Contato", h({ ariaLabel: "Seção de contato" }), "Contato"],
    ["data-section sobre-nos → Sobre", h({ dataSection: "sobre-nos", id: "sobre-nos" }), "Sobre"],
    ["sem keyword, usa heading", h({ className: "block-xyz", heading: "Nossa equipe de elite" }), "Nossa equipe de elite"],
    ["footer sem pistas → Rodapé", h({ tag: "footer" }), "Rodapé"],
    ["header sem pistas → Cabeçalho", h({ tag: "header" }), "Cabeçalho"],
    ["id significativo → title case", h({ id: "nossa-historia" }), "Nossa Historia"],
    ["section-3 → undefined", h({ id: "section-3" }), undefined],
    ["hash → undefined", h({ id: "a1b2c3d4" }), undefined],
    ["plain section sem nada → undefined", h({}), undefined],
    ["keyword vence heading", h({ className: "pricing", heading: "Escolha seu plano" }), "Planos"],
  ])("%s", (_label, hints, expected) => {
    expect(deriveSectionName(hints)).toBe(expected);
  });

  it("desambigua repetidos e preserva únicos/indefinidos", () => {
    expect(disambiguate(["Serviços", "Hero", "Serviços", "Serviços", undefined])).toEqual(["Serviços", "Hero", "Serviços 2", "Serviços 3", undefined]);
  });
});

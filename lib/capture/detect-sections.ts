import type { Page } from "playwright";

export interface SectionCandidate {
  tag: string;
  id?: string;
  y: number;            // scroll Y absoluto para capturar esta seção
  elementHeight: number;
  suggestedName?: string;
  heading?: string;
}

/**
 * Detecta seções semânticas da página via análise do DOM.
 *
 * Estratégia:
 * 1. Busca elementos com tags estruturais: header, section, footer, article,
 *    e atributos de marcação: [data-section], [data-block].
 * 2. Filtra elementos com altura < minHeight ou sem largura (invisíveis).
 * 3. Aplica regra de "folha": descarta um elemento se ele contém outro
 *    candidato — evita capturar container + conteúdo duas vezes.
 * 4. Deriva nome sugerido: data-section/id > primeiro heading > tag semântica.
 * 5. Retorna ordenado por Y crescente.
 *
 * Retorna array vazio se a página não tiver estrutura semântica suficiente;
 * o chamador decide o fallback (scroll-step fixo).
 */
export async function detectPageSections(
  page: Page,
  minHeight: number
): Promise<SectionCandidate[]> {
  const raw = await page.evaluate((minH: number) => {
    const SELECTOR = "header, section, footer, article, [data-section], [data-block]";
    const all: Element[] = Array.from(document.querySelectorAll(SELECTOR));

    // 1. Filtra: renderizado com dimensões suficientes
    const candidates = all.filter((el) => {
      const he = el as HTMLElement;
      return he.offsetHeight >= minH && he.offsetWidth > 0;
    });

    // 2. Prefere folhas: descarta container que contém outro candidato
    const leaves = candidates.filter(
      (el) => !candidates.some((other) => other !== el && el.contains(other))
    );

    const scrollY = window.scrollY;

    const SEMANTIC_NAMES: Record<string, string> = {
      header: "Cabeçalho",
      footer: "Rodapé",
      nav: "Navegação",
      article: "Artigo",
    };

    return leaves
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const absTop = Math.max(0, Math.round(rect.top + scrollY));
        const tag = el.tagName.toLowerCase();

        // id: prefere data-section > data-block > id do elemento
        const rawId =
          el.getAttribute("data-section") ||
          el.getAttribute("data-block") ||
          (el as HTMLElement).id ||
          "";
        const id: string | undefined = rawId || undefined;

        // Primeiro heading dentro do elemento
        const hEl = el.querySelector("h1, h2, h3");
        const heading: string | undefined = hEl
          ? (hEl.textContent ?? "").trim().slice(0, 100) || undefined
          : undefined;

        // Nome sugerido: id convertido em título > heading > tag semântica
        let suggestedName: string | undefined;
        if (id) {
          suggestedName = id
            .replace(/[-_]/g, " ")
            .replace(/\b\w/g, (c: string) => c.toUpperCase());
        } else if (heading) {
          suggestedName = heading.slice(0, 40);
        } else {
          suggestedName = SEMANTIC_NAMES[tag];
        }

        return {
          tag,
          id,
          y: absTop,
          elementHeight: (el as HTMLElement).offsetHeight,
          suggestedName,
          heading,
        };
      })
      .sort((a: { y: number }, b: { y: number }) => a.y - b.y);
  }, minHeight);

  return raw as SectionCandidate[];
}

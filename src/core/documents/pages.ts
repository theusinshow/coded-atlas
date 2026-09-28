import type { Artboard } from "./artboard";
import { MAX_PAGES, type CarouselContent, type DocumentPage } from "./creative-document";
import type { Layer } from "./layer";

/** Operações puras sobre as páginas de um carrossel (sempre devolvem conteúdo novo). */

function reid(layers: readonly Layer[], makeId: () => string): Layer[] {
  return layers.map((l) => (l.type === "group" ? { ...l, id: makeId(), children: reid(l.children, makeId) } : ({ ...l, id: makeId() } as Layer)));
}

export function blankArtboard(like: Pick<Artboard, "width" | "height" | "background">): Artboard {
  return { width: like.width, height: like.height, background: { ...like.background }, layers: [] };
}

/** Insere uma página depois de `afterIndex` (ou no fim). Respeita o limite de páginas. */
export function addPage(content: CarouselContent, page: DocumentPage, afterIndex = content.pages.length - 1): CarouselContent {
  if (content.pages.length >= MAX_PAGES) return content;
  const at = Math.min(Math.max(afterIndex + 1, 0), content.pages.length);
  return { ...content, pages: [...content.pages.slice(0, at), page, ...content.pages.slice(at)] };
}

/** Cópia da página (ids novos de página e de camadas), logo depois dela. */
export function duplicatePage(content: CarouselContent, index: number, makeId: () => string): CarouselContent {
  const source = content.pages[index];
  if (!source) return content;
  const copy: DocumentPage = { id: makeId(), ...(source.title ? { title: `${source.title} (cópia)`.slice(0, 80) } : {}), artboard: { ...source.artboard, layers: reid(source.artboard.layers, makeId) } };
  return addPage(content, copy, index);
}

export function movePage(content: CarouselContent, from: number, to: number): CarouselContent {
  if (from === to || !content.pages[from] || to < 0 || to >= content.pages.length) return content;
  const pages = [...content.pages];
  const [page] = pages.splice(from, 1);
  pages.splice(to, 0, page);
  return { ...content, pages };
}

/** Remove a página (um carrossel nunca fica sem páginas). */
export function removePage(content: CarouselContent, index: number): CarouselContent {
  if (content.pages.length <= 1 || !content.pages[index]) return content;
  return { ...content, pages: content.pages.filter((_, i) => i !== index) };
}

export function renamePage(content: CarouselContent, index: number, title: string): CarouselContent {
  if (!content.pages[index]) return content;
  const clean = title.trim().slice(0, 80);
  return { ...content, pages: content.pages.map((p, i) => (i === index ? { ...p, ...(clean ? { title: clean } : { title: undefined }) } : p)) };
}

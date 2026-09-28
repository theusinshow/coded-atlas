import type { Artboard } from "./artboard";
import { MAX_PAGES, isCarousel, type CarouselContent, type DocumentPage, type SequenceContent } from "./creative-document";
import type { Layer } from "./layer";
import { MAX_SCENES, type Scene } from "../motion/motion";

/**
 * Operações puras sobre sequências — páginas de carrossel e cenas de motion
 * (sempre devolvem conteúdo novo). Um item é { id, title?, artboard, … }.
 */
type Item<C extends SequenceContent> = C extends CarouselContent ? DocumentPage : Scene;

export function sequenceItems<C extends SequenceContent>(content: C): Item<C>[] {
  return (isCarousel(content) ? content.pages : content.scenes) as Item<C>[];
}

function withItems<C extends SequenceContent>(content: C, items: Item<C>[]): C {
  return (isCarousel(content) ? { ...content, pages: items } : { ...content, scenes: items }) as C;
}

const limitOf = (content: SequenceContent) => (isCarousel(content) ? MAX_PAGES : MAX_SCENES);

function reid(layers: readonly Layer[], makeId: () => string, map: Map<string, string>): Layer[] {
  return layers.map((l) => {
    const id = makeId();
    map.set(l.id, id);
    return l.type === "group" ? { ...l, id, children: reid(l.children, makeId, map) } : ({ ...l, id } as Layer);
  });
}

export function blankArtboard(like: Pick<Artboard, "width" | "height" | "background">): Artboard {
  return { width: like.width, height: like.height, background: { ...like.background }, layers: [] };
}

/** Insere um item depois de `afterIndex` (ou no fim). Respeita o limite. */
export function addPage<C extends SequenceContent>(content: C, item: Item<C>, afterIndex = sequenceItems(content).length - 1): C {
  const items = sequenceItems(content);
  if (items.length >= limitOf(content)) return content;
  const at = Math.min(Math.max(afterIndex + 1, 0), items.length);
  return withItems(content, [...items.slice(0, at), item, ...items.slice(at)]);
}

/** Cópia do item (ids novos de item e de camadas; animações seguem as camadas copiadas), logo depois dele. */
export function duplicatePage<C extends SequenceContent>(content: C, index: number, makeId: () => string): C {
  const source = sequenceItems(content)[index];
  if (!source) return content;
  const id = makeId();
  const map = new Map<string, string>();
  const layers = reid(source.artboard.layers, makeId, map);
  const copy = {
    ...source,
    id,
    ...(source.title ? { title: `${source.title} (cópia)`.slice(0, 80) } : {}),
    artboard: { ...source.artboard, layers },
    ...("animations" in source ? { animations: source.animations.map((a) => ({ ...a, id: makeId(), layerId: map.get(a.layerId) ?? a.layerId })) } : {}),
  } as Item<C>;
  return addPage(content, copy, index);
}

export function movePage<C extends SequenceContent>(content: C, from: number, to: number): C {
  const items = [...sequenceItems(content)];
  if (from === to || !items[from] || to < 0 || to >= items.length) return content;
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
  return withItems(content, items);
}

/** Remove o item (uma sequência nunca fica vazia). */
export function removePage<C extends SequenceContent>(content: C, index: number): C {
  const items = sequenceItems(content);
  if (items.length <= 1 || !items[index]) return content;
  return withItems(content, items.filter((_, i) => i !== index));
}

export function renamePage<C extends SequenceContent>(content: C, index: number, title: string): C {
  const items = sequenceItems(content);
  if (!items[index]) return content;
  const clean = title.trim().slice(0, 80);
  return withItems(content, items.map((p, i) => (i === index ? ({ ...p, title: clean || undefined } as Item<C>) : p)));
}

/** Atualiza um item (ex.: duração/transição da cena). */
export function updatePage<C extends SequenceContent>(content: C, index: number, change: (item: Item<C>) => Item<C>): C {
  const items = sequenceItems(content);
  if (!items[index]) return content;
  return withItems(content, items.map((p, i) => (i === index ? change(p) : p)));
}

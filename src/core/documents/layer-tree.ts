import type { Layer } from "./layer";

/**
 * Operações puras sobre a árvore de layers (Canvas agora, cenas de Motion depois).
 * Toda função devolve uma árvore NOVA — o histórico de undo guarda referências.
 * Filhos de grupo usam coordenadas relativas ao grupo.
 */

export interface LayerLocation {
  layer: Layer;
  /** Deslocamento acumulado dos grupos ancestrais (espaço do artboard). */
  offset: { x: number; y: number };
  parentId: string | null;
  index: number;
  depth: number;
}

export function findLayer(layers: readonly Layer[], id: string, offset = { x: 0, y: 0 }, parentId: string | null = null, depth = 0): LayerLocation | null {
  for (let index = 0; index < layers.length; index++) {
    const layer = layers[index];
    if (layer.id === id) return { layer, offset, parentId, index, depth };
    if (layer.type === "group") {
      const found = findLayer(layer.children, id, { x: offset.x + layer.x, y: offset.y + layer.y }, layer.id, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** Lista plana em ordem de desenho (pais antes dos filhos) com profundidade — para o painel de camadas. */
export function flattenLayers(layers: readonly Layer[], depth = 0, parentId: string | null = null): { layer: Layer; depth: number; parentId: string | null }[] {
  return layers.flatMap((layer) => [{ layer, depth, parentId }, ...(layer.type === "group" ? flattenLayers(layer.children, depth + 1, layer.id) : [])]);
}

function mapTree(layers: readonly Layer[], fn: (list: readonly Layer[], parentId: string | null) => Layer[], parentId: string | null = null): Layer[] {
  return fn(layers, parentId).map((layer) => (layer.type === "group" ? { ...layer, children: mapTree(layer.children, fn, layer.id) } : layer));
}

// `Partial<Layer>` sobre uma união perde campos por tipo: o patch é aplicado ao tipo do próprio layer.
export type LayerPatch = { [K in keyof Layer]?: Layer[K] } & Record<string, unknown>;

export function updateLayer(layers: readonly Layer[], id: string, patch: LayerPatch): Layer[] {
  return mapTree(layers, (list) => list.map((layer) => (layer.id === id ? ({ ...layer, ...patch, id: layer.id, type: layer.type } as Layer) : layer)));
}

export function removeLayer(layers: readonly Layer[], id: string): Layer[] {
  return mapTree(layers, (list) => list.filter((layer) => layer.id !== id));
}

/** Insere no topo do artboard (ou acima de `aboveId`, no mesmo nível dele). */
export function insertLayer(layers: readonly Layer[], layer: Layer, aboveId?: string | null): Layer[] {
  if (!aboveId || !findLayer(layers, aboveId)) return [...layers, layer];
  return mapTree(layers, (list) => {
    const i = list.findIndex((l) => l.id === aboveId);
    return i === -1 ? [...list] : [...list.slice(0, i + 1), layer, ...list.slice(i + 1)];
  });
}

export type Reorder = "forward" | "backward" | "front" | "back";

/** Reordena entre irmãos (a ordem da lista é a ordem de desenho: último = por cima). */
export function reorderLayer(layers: readonly Layer[], id: string, move: Reorder): Layer[] {
  return mapTree(layers, (list) => {
    const i = list.findIndex((l) => l.id === id);
    if (i === -1) return [...list];
    const next = [...list];
    const [layer] = next.splice(i, 1);
    const target = move === "front" ? next.length : move === "back" ? 0 : move === "forward" ? Math.min(next.length, i + 1) : Math.max(0, i - 1);
    next.splice(target, 0, layer);
    return next;
  });
}

function reid(layer: Layer, makeId: () => string): Layer {
  const copy = { ...layer, id: makeId() } as Layer;
  return copy.type === "group" ? { ...copy, children: copy.children.map((c) => reid(c, makeId)) } : copy;
}

/** Duplica (com ids novos, inclusive dos filhos) logo acima do original, deslocado. */
export function duplicateLayer(layers: readonly Layer[], id: string, makeId: () => string, nudge = 24): { layers: Layer[]; newId: string | null } {
  const found = findLayer(layers, id);
  if (!found) return { layers: [...layers], newId: null };
  const copy = reid({ ...found.layer, x: found.layer.x + nudge, y: found.layer.y + nudge, locked: false } as Layer, makeId);
  if (copy.name) copy.name = `${copy.name} (cópia)`.slice(0, 80);
  return { layers: insertLayer(layers, copy, id), newId: copy.id };
}

/**
 * Desagrupa: os filhos sobem para o nível do grupo, no lugar dele, com a posição
 * convertida para o espaço do pai. Grupo girado não desagrupa (perderia a rotação).
 */
export function ungroupLayer(layers: readonly Layer[], id: string): Layer[] {
  const found = findLayer(layers, id);
  if (!found || found.layer.type !== "group" || found.layer.rotation !== 0) return [...layers];
  const group = found.layer;
  const lifted = group.children.map((c) => ({ ...c, x: c.x + group.x, y: c.y + group.y, opacity: c.opacity * group.opacity }) as Layer);
  return mapTree(layers, (list) => list.flatMap((l) => (l.id === id ? lifted : [l])));
}

/** Caixa de um layer no espaço do artboard (sem rotação). */
export function absoluteBox(location: LayerLocation): { x: number; y: number; width: number; height: number } {
  const { layer, offset } = location;
  return { x: offset.x + layer.x, y: offset.y + layer.y, width: layer.width, height: layer.height };
}

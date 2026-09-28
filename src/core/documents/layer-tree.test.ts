import { describe, expect, it } from "vitest";
import { LayerSchema, type Layer, type LayerInput } from "./layer";
import { absoluteBox, duplicateLayer, findLayer, flattenLayers, insertLayer, removeLayer, reorderLayer, ungroupLayer, updateLayer } from "./layer-tree";

const shape = (id: string, x = 0, y = 0): LayerInput => ({ id, type: "shape", x, y, width: 100, height: 50 });
const tree = (): Layer[] =>
  [shape("a"), { id: "g", type: "group", x: 100, y: 200, width: 400, height: 300, opacity: 0.5, children: [shape("c1", 10, 20), shape("c2", 30, 40)] } satisfies LayerInput, shape("b")].map((l) =>
    LayerSchema.parse(l)
  );

describe("árvore de layers", () => {
  it("encontra filhos com o deslocamento do grupo e achata em ordem de desenho", () => {
    const found = findLayer(tree(), "c2")!;
    expect(found).toMatchObject({ parentId: "g", index: 1, depth: 1, offset: { x: 100, y: 200 } });
    expect(absoluteBox(found)).toEqual({ x: 130, y: 240, width: 100, height: 50 });
    expect(flattenLayers(tree()).map((f) => `${f.layer.id}@${f.depth}`)).toEqual(["a@0", "g@0", "c1@1", "c2@1", "b@0"]);
  });

  it("atualiza, remove e insere sem mutar o original", () => {
    const original = tree();
    const moved = updateLayer(original, "c1", { x: 99 });
    expect(findLayer(moved, "c1")!.layer.x).toBe(99);
    expect(findLayer(original, "c1")!.layer.x).toBe(10);
    expect(findLayer(removeLayer(original, "c2"), "c2")).toBeNull();
    expect(insertLayer(original, LayerSchema.parse(shape("n")), "c1").find((l) => l.id === "g")).toMatchObject({ children: [{ id: "c1" }, { id: "n" }, { id: "c2" }] });
    expect(insertLayer(original, LayerSchema.parse(shape("top"))).at(-1)!.id).toBe("top");
  });

  it("reordena entre irmãos", () => {
    const ids = (ls: Layer[]) => ls.map((l) => l.id);
    expect(ids(reorderLayer(tree(), "a", "forward"))).toEqual(["g", "a", "b"]);
    expect(ids(reorderLayer(tree(), "a", "front"))).toEqual(["g", "b", "a"]);
    expect(ids(reorderLayer(tree(), "b", "back"))).toEqual(["b", "a", "g"]);
    expect(ids(reorderLayer(tree(), "a", "backward"))).toEqual(["a", "g", "b"]);
  });

  it("duplica com ids novos (inclusive filhos) acima do original", () => {
    let n = 0;
    const { layers, newId } = duplicateLayer(tree(), "g", () => `id${++n}`);
    expect(layers.map((l) => l.id)).toEqual(["a", "g", "id1", "b"]);
    expect(newId).toBe("id1");
    expect(layers[2]).toMatchObject({ x: 124, y: 224, children: [{ id: "id2" }, { id: "id3" }] });
  });

  it("desagrupa convertendo posição e opacidade; grupo girado fica como está", () => {
    const flat = ungroupLayer(tree(), "g");
    expect(flat.map((l) => l.id)).toEqual(["a", "c1", "c2", "b"]);
    expect(flat[1]).toMatchObject({ x: 110, y: 220, opacity: 0.5 });
    const rotated = updateLayer(tree(), "g", { rotation: 10 });
    expect(ungroupLayer(rotated, "g").map((l) => l.id)).toEqual(["a", "g", "b"]);
  });
});

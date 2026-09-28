import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import v01 from "../../src/modules/import/legacy/__fixtures__/catalog-v0.1.json";
import { recoverInterruptedGenerations } from "./recover-generations";

let root: string;

function writeVersion(dir: string, marker: string, opts: { valid?: boolean; draft?: string } = {}): void {
  mkdirSync(dir, { recursive: true });
  const catalog = opts.valid === false ? { quebrado: true } : { ...v01, meta: { ...v01.meta, userAgent: marker } };
  writeFileSync(path.join(dir, "catalog.json"), JSON.stringify(catalog));
  writeFileSync(path.join(dir, "marker.txt"), marker);
  if (opts.draft) writeFileSync(path.join(dir, "case-draft.mdx"), opts.draft);
}
const marker = (dir: string) => readFileSync(path.join(dir, "marker.txt"), "utf-8");

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "atlas-recover-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("recoverInterruptedGenerations", () => {
  it("sem .trash: nada a fazer", async () => {
    expect(await recoverInterruptedGenerations(root)).toEqual([]);
  });

  it("geração interrompida (pasta atual parcial) → restaura a versão anterior e preserva o rascunho de case", async () => {
    writeVersion(path.join(root, ".trash", "site-1790000000000"), "anterior");
    const partial = path.join(root, "site");
    mkdirSync(path.join(partial, "screenshots"), { recursive: true }); // parcial: sem catalog.json
    writeFileSync(path.join(partial, "case-draft.mdx"), "# rascunho que só existia aqui");

    expect(await recoverInterruptedGenerations(root)).toEqual([
      { slug: "site", backup: "site-1790000000000", action: "restored" },
    ]);
    expect(marker(path.join(root, "site"))).toBe("anterior");
    expect(readFileSync(path.join(root, "site", "case-draft.mdx"), "utf-8")).toBe("# rascunho que só existia aqui");
    expect(existsSync(path.join(root, ".trash", "site-1790000000000"))).toBe(false);
  });

  it("pasta atual sumiu de vez → restaura", async () => {
    writeVersion(path.join(root, ".trash", "site-1790000000000"), "anterior");
    await recoverInterruptedGenerations(root);
    expect(marker(path.join(root, "site"))).toBe("anterior");
  });

  it("geração nova concluída mas backup sobrou (commit interrompido) → descarta o backup, mantém a nova", async () => {
    writeVersion(path.join(root, ".trash", "site-1790000000000"), "anterior");
    writeVersion(path.join(root, "site"), "nova");
    expect(await recoverInterruptedGenerations(root)).toEqual([
      { slug: "site", backup: "site-1790000000000", action: "discarded" },
    ]);
    expect(marker(path.join(root, "site"))).toBe("nova");
  });

  it("vários backups do mesmo slug → restaura o mais recente e descarta os antigos", async () => {
    writeVersion(path.join(root, ".trash", "site-1790000000000"), "antiga");
    writeVersion(path.join(root, ".trash", "site-1790000009999"), "recente");
    const actions = await recoverInterruptedGenerations(root);
    expect(actions.map((a) => [a.backup, a.action])).toEqual([
      ["site-1790000009999", "restored"],
      ["site-1790000000000", "discarded"],
    ]);
    expect(marker(path.join(root, "site"))).toBe("recente");
  });

  it("nunca troca uma versão válida por backup; backups inválidos/estranhos ficam para inspeção", async () => {
    writeVersion(path.join(root, ".trash", "site-1790000000000"), "backup ruim", { valid: false });
    writeVersion(path.join(root, ".trash", "Nome Esquisito"), "x");
    writeVersion(path.join(root, ".trash", "..-1790000000000"), "x");
    const actions = await recoverInterruptedGenerations(root);
    expect(actions.every((a) => a.action === "skipped")).toBe(true);
    expect(existsSync(path.join(root, ".trash", "site-1790000000000"))).toBe(true);
    expect(existsSync(path.join(root, "site"))).toBe(false);
  });
});

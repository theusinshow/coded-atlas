import { mkdtempSync, promises as fs, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { contentStorageKey, parseStorageKey, type StorageKey } from "../../core/assets/storage-key";
import { isDomainError, type DomainErrorCode } from "../../shared/errors";
import { assertRealWithin, resolveWithin } from "./confine";
import { sha256Bytes } from "./hash";
import { LocalAssetStorage } from "./local-asset-storage";

const bytes = (text: string) => new TextEncoder().encode(text);
const key = (value: string) => parseStorageKey(value);

async function expectCode(promise: Promise<unknown>, code: DomainErrorCode): Promise<void> {
  try {
    await promise;
    expect.unreachable(`esperava ${code}`);
  } catch (err) {
    expect(isDomainError(err, code), String(err)).toBe(true);
  }
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "atlas-storage-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("resolveWithin", () => {
  it.each(["a", "a/b", "a/b/c.png", "a/./b"])("aceita %j dentro da raiz", (rel) => {
    const resolved = resolveWithin(dir, rel);
    expect(resolved.startsWith(path.resolve(dir) + path.sep)).toBe(true);
  });

  it.each([
    "",
    ".",
    "..",
    "../",
    "../x",
    "a/../..",
    "a/../../x",
    "a/b/../../../x",
    "..\\x",
    "/etc/passwd",
    "C:\\Windows\\System32",
    "C:/Windows",
    "c:relative",
    "\\\\server\\share\\x",
    "a\0b",
  ])("recusa %j", (rel) => {
    try {
      resolveWithin(dir, rel);
      expect.unreachable();
    } catch (err) {
      expect(isDomainError(err, "PATH_OUTSIDE_ROOT")).toBe(true);
    }
  });

  it("não decodifica traversal codificado (%2e%2e fica literal e dentro da raiz)", () => {
    const resolved = resolveWithin(dir, "%2e%2e/x");
    expect(resolved).toBe(path.join(path.resolve(dir), "%2e%2e", "x"));
  });

  it("assertRealWithin recusa junction/symlink que aponta para fora", async () => {
    const outside = mkdtempSync(path.join(os.tmpdir(), "atlas-outside-"));
    try {
      const root = await fs.realpath(dir);
      const link = path.join(root, "escape");
      try {
        await fs.symlink(outside, link, "junction");
      } catch {
        return; // sistema sem suporte a links: nada a verificar
      }
      await expectCode(assertRealWithin(root, path.join(link, "x.png")), "PATH_OUTSIDE_ROOT");
      await assertRealWithin(root, path.join(root, "ainda-nao-existe", "x.png"));
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe("LocalAssetStorage", () => {
  it("put → get → stat → exists → delete", async () => {
    const storage = await LocalAssetStorage.open(dir);
    const k = key("captures/p1/desktop.png");
    const stored = await storage.put(k, bytes("png-bytes"));
    expect(stored).toEqual({ key: k, sha256: sha256Bytes(bytes("png-bytes")), byteSize: 9 });
    expect(new TextDecoder().decode(await storage.get(k))).toBe("png-bytes");
    expect(await storage.stat(k)).toEqual(stored);
    expect(await storage.exists(k)).toBe(true);
    await storage.delete(k);
    expect(await storage.exists(k)).toBe(false);
    expect(await storage.stat(k)).toBeNull();
    await storage.delete(k); // idempotente
  });

  it("grava no layout <root>/<key>, sem arquivo temporário sobrando", async () => {
    const storage = await LocalAssetStorage.open(dir);
    await storage.put(key("a/b/c.txt"), bytes("x"));
    expect(await fs.readFile(path.join(dir, "a", "b", "c.txt"), "utf-8")).toBe("x");
    expect(await fs.readdir(path.join(dir, ".staging", "tmp"))).toEqual([]);
  });

  it("get de chave inexistente → NOT_FOUND", async () => {
    const storage = await LocalAssetStorage.open(dir);
    await expectCode(storage.get(key("nao/existe.png")), "NOT_FOUND");
  });

  it("imutável: mesmo conteúdo = dedupe; conteúdo diferente = CONFLICT (original preservado)", async () => {
    const storage = await LocalAssetStorage.open(dir);
    const k = key("assets/x.png");
    await storage.put(k, bytes("v1"));
    await expect(storage.put(k, bytes("v1"))).resolves.toMatchObject({ key: k });
    await expectCode(storage.put(k, bytes("v2")), "CONFLICT");
    expect(new TextDecoder().decode(await storage.get(k))).toBe("v1");
  });

  it("chave endereçada por conteúdo deduplica bytes iguais", async () => {
    const storage = await LocalAssetStorage.open(dir);
    const data = bytes("mesmo conteúdo");
    const k = contentStorageKey("assets", sha256Bytes(data), "bin");
    const a = await storage.put(k, data);
    const b = await storage.put(k, data);
    expect(a).toEqual(b);
  });

  it("copy cria um novo objeto com o mesmo hash", async () => {
    const storage = await LocalAssetStorage.open(dir);
    const src = await storage.put(key("a/original.png"), bytes("abc"));
    const copy = await storage.copy(src.key, key("b/copia.png"));
    expect(copy.sha256).toBe(src.sha256);
    expect(await storage.exists(src.key)).toBe(true);
  });

  it.each(["../fora.txt", "a/../../fora.txt", "/etc/passwd", "C:/Windows/x", "..\\fora", "%2e%2e/x", ".staging/tmp/x"])(
    "recusa chave forjada %j mesmo com cast",
    async (raw) => {
      const storage = await LocalAssetStorage.open(dir);
      const forged = raw as StorageKey;
      await expectCode(storage.put(forged, bytes("x")), "INVALID_STORAGE_KEY");
      await expectCode(storage.get(forged), "INVALID_STORAGE_KEY");
      await expectCode(storage.delete(forged), "INVALID_STORAGE_KEY");
      await expect(fs.access(path.join(path.dirname(dir), "fora.txt"))).rejects.toThrow();
    }
  );

  describe("staging", () => {
    it("objetos ficam invisíveis até o commit", async () => {
      const storage = await LocalAssetStorage.open(dir);
      const staging = await storage.beginStaging();
      await staging.put(key("gen/p1/a.png"), bytes("a"));
      await staging.put(key("gen/p1/b.png"), bytes("b"));
      expect(await storage.exists(key("gen/p1/a.png"))).toBe(false);

      const published = await staging.commit();
      expect(published.map((o) => o.key)).toEqual(["gen/p1/a.png", "gen/p1/b.png"]);
      expect(await storage.exists(key("gen/p1/a.png"))).toBe(true);
      expect(await fs.readdir(path.join(dir, ".staging"))).toEqual(["tmp"]);
    });

    it("discard não publica nada e limpa a área", async () => {
      const storage = await LocalAssetStorage.open(dir);
      const staging = await storage.beginStaging();
      await staging.put(key("gen/x.png"), bytes("x"));
      await staging.discard();
      expect(await storage.exists(key("gen/x.png"))).toBe(false);
      expect(await fs.readdir(path.join(dir, ".staging"))).toEqual(["tmp"]);
    });

    it("commit é tudo-ou-nada: conflito desfaz o que já tinha publicado", async () => {
      const storage = await LocalAssetStorage.open(dir);
      await storage.put(key("gen/b.png"), bytes("valor antigo"));
      const staging = await storage.beginStaging();
      await staging.put(key("gen/a.png"), bytes("novo a"));
      await staging.put(key("gen/b.png"), bytes("novo b")); // vai conflitar no commit
      await expectCode(staging.commit(), "CONFLICT");
      expect(await storage.exists(key("gen/a.png"))).toBe(false);
      expect(new TextDecoder().decode(await storage.get(key("gen/b.png")))).toBe("valor antigo");
    });

    it("área finalizada não aceita mais operações", async () => {
      const storage = await LocalAssetStorage.open(dir);
      const staging = await storage.beginStaging();
      await staging.commit();
      await expectCode(staging.put(key("x.png"), bytes("x")), "INVALID_TRANSITION");
      await expectCode(staging.commit(), "INVALID_TRANSITION");
    });

    it("mesma chave com conteúdo diferente na mesma staging → CONFLICT", async () => {
      const storage = await LocalAssetStorage.open(dir);
      const staging = await storage.beginStaging();
      await staging.put(key("x.png"), bytes("1"));
      await expectCode(staging.put(key("x.png"), bytes("2")), "CONFLICT");
      await staging.discard();
    });
  });
});

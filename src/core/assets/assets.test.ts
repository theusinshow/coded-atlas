import { describe, expect, it } from "vitest";
import { isDomainError } from "../../shared/errors";
import { newId, type ProjectId, type SourceId } from "../../shared/id";
import { AssetRelationSchema, AssetSchema, createAsset } from "./asset";
import { CaptureSchema, createCapture } from "./capture";
import { createOutput, OutputSchema } from "./output";
import { contentStorageKey, isValidStorageKey, parseStorageKey } from "./storage-key";

const SHA = "a".repeat(64);
const projectId = newId() as ProjectId;

describe("StorageKey", () => {
  it.each(["assets/ab/abc.png", "captures/01j9zk/desktop-1440x900.png", "a", "a/b", "renders/x_y.v2.webp"])(
    "aceita %j",
    (key) => {
      expect(isValidStorageKey(key)).toBe(true);
    }
  );

  it.each([
    "",
    ".",
    "..",
    "../x",
    "a/../b",
    "a/..",
    "a/../../etc/passwd",
    "a..b/c",
    "/etc/passwd",
    "/a",
    "a/",
    "a//b",
    "a\\b",
    "..\\..\\windows",
    "C:/Windows/system32",
    "c:",
    "\\\\server\\share",
    "%2e%2e/x",
    "%2e%2e%2fx",
    "a%2fb",
    ".staging/x",
    ".hidden",
    "Assets/A.png",
    "con",
    "a/nul.txt",
    "com1.png",
    "a b",
    "x".repeat(513),
  ])("rejeita %j", (key) => {
    expect(isValidStorageKey(key)).toBe(false);
  });

  it("parseStorageKey lança INVALID_STORAGE_KEY", () => {
    try {
      parseStorageKey("../x");
      expect.unreachable();
    } catch (err) {
      expect(isDomainError(err, "INVALID_STORAGE_KEY")).toBe(true);
    }
  });

  it("contentStorageKey é endereçada pelo hash", () => {
    expect(contentStorageKey("assets", SHA, "png")).toBe(`assets/aa/${SHA}.png`);
    expect(() => contentStorageKey("assets", SHA, "../png")).toThrow();
    expect(() => contentStorageKey("../x", SHA, "png")).toThrow();
  });
});

describe("Asset", () => {
  const base = {
    projectId,
    kind: "screenshot" as const,
    storageKey: parseStorageKey(`assets/aa/${SHA}.png`),
    sha256: SHA,
    mimeType: "image/png",
    byteSize: 1024,
  };

  it("createAsset preenche opcionais com null", () => {
    const asset = createAsset(base);
    expect(AssetSchema.parse(asset)).toEqual(asset);
    expect(asset.parentAssetId).toBeNull();
    expect(asset.captureId).toBeNull();
  });

  it.each([
    ["sha256 curto", { sha256: "abc" }],
    ["sha256 maiúsculo", { sha256: "A".repeat(64) }],
    ["storage key com traversal", { storageKey: "../../etc/passwd" }],
    ["storage key absoluta", { storageKey: "C:/x.png" }],
    ["tamanho negativo", { byteSize: -1 }],
    ["kind desconhecido", { kind: "planilha" }],
    ["mime inválido", { mimeType: "png" }],
  ])("rejeita %s", (_label, override) => {
    expect(AssetSchema.safeParse({ ...createAsset(base), ...override }).success).toBe(false);
  });

  it("relação não pode apontar para o próprio asset", () => {
    const id = newId();
    const relation = { fromAssetId: id, toAssetId: id, type: "variant-of", createdAt: new Date().toISOString() };
    expect(AssetRelationSchema.safeParse(relation).success).toBe(false);
  });
});

describe("Capture", () => {
  it("nasce pending, com params validados", () => {
    const capture = createCapture({
      projectId,
      sourceId: newId() as SourceId,
      type: "device",
      params: {
        url: "https://example.com",
        viewport: { label: "desktop", width: 1440, height: 900, deviceScaleFactor: 2 },
      },
    });
    expect(CaptureSchema.parse(capture)).toEqual(capture);
    expect(capture.status).toBe("pending");
  });

  it("rejeita params desconhecidos", () => {
    const capture = createCapture({ projectId, sourceId: newId() as SourceId, type: "page" });
    expect(CaptureSchema.safeParse({ ...capture, params: { script: "rm -rf" } }).success).toBe(false);
  });
});

describe("Output", () => {
  it("createOutput válido e imutável por contrato (sem updatedAt)", () => {
    const output = createOutput({
      projectId,
      format: "png",
      mimeType: "image/png",
      storageKey: parseStorageKey(`renders/aa/${SHA}.png`),
      sha256: SHA,
      byteSize: 10,
    });
    expect(OutputSchema.parse(output)).toEqual(output);
    expect("updatedAt" in output).toBe(false);
    expect(output.sourceAssetIds).toEqual([]);
  });
});

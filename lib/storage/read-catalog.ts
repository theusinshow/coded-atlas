import { promises as fs } from "node:fs";
import { z } from "zod";
import { LegacyCatalogSchema } from "../../src/modules/import/legacy/catalog-schema";
import { SlugSchema } from "../../src/core/projects/project";
import type { Catalog } from "../types";
import { catalogPath } from "./paths";

export type CatalogRead =
  | { status: "ok"; catalog: Catalog }
  | { status: "missing" }
  | { status: "invalid"; reason: string };

/**
 * Único leitor do `catalog.json` no v1 (2.1.G): valida com o schema de runtime
 * em vez de `JSON.parse(...) as Catalog`. Catálogo inválido não quebra a tela
 * nem some em silêncio — é reportado no log com o motivo.
 */
export async function readCatalog(slug: string): Promise<CatalogRead> {
  if (!SlugSchema.safeParse(slug).success) return { status: "missing" };

  let raw: string;
  try {
    raw = await fs.readFile(catalogPath(slug), "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { status: "missing" };
    return invalid(slug, `leitura falhou: ${String(err)}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    return invalid(slug, `JSON inválido: ${err instanceof Error ? err.message : String(err)}`);
  }

  const parsed = LegacyCatalogSchema.safeParse(json);
  if (!parsed.success) return invalid(slug, z.prettifyError(parsed.error));
  return { status: "ok", catalog: parsed.data };
}

/** Atalho para quem só precisa do catálogo válido (ou nada). */
export async function loadCatalog(slug: string): Promise<Catalog | null> {
  const read = await readCatalog(slug);
  return read.status === "ok" ? read.catalog : null;
}

function invalid(slug: string, reason: string): CatalogRead {
  console.warn(`[atlas:${slug}] catalog.json inválido — ${reason.split("\n")[0]}`);
  return { status: "invalid", reason };
}

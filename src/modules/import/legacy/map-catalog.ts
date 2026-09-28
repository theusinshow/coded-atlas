import { z } from "zod";
import type { AssetKind } from "../../../core/assets/asset";
import type { OutputFormat } from "../../../core/assets/output";
import { parseStorageKey } from "../../../core/assets/storage-key";
import { NewProjectInputSchema, type NewProjectInput, type Slug } from "../../../core/projects/project";
import { isHttpUrl } from "../../../core/projects/source";
import { LegacyCatalogSchema, type LegacyCatalog } from "./catalog-schema";

/**
 * Mapeamento puro de um `catalog.json` legado para o modelo novo — sem I/O,
 * sem IDs (IDs nascem quando o projeto for de fato importado, não a cada leitura).
 */

export type LegacyIssueCode =
  | "INVALID_FOLDER_NAME"   // pasta não é um slug válido — nunca vira caminho
  | "UNSAFE_FOLDER"         // entrada não é pasta real dentro da raiz (arquivo, link para fora)
  | "CATALOG_MISSING"       // pasta sem catalog.json
  | "CATALOG_TOO_LARGE"
  | "CATALOG_INVALID_JSON"
  | "CATALOG_UNREADABLE"
  | "CATALOG_SCHEMA"        // JSON válido, formato inesperado
  | "INVALID_PROJECT"       // metadados não satisfazem o domínio (nome vazio, URL inválida…)
  | "SLUG_MISMATCH"         // project.slug ≠ nome da pasta (a pasta vence: é a URL /projects/[slug])
  | "PATH_OUTSIDE_PROJECT"  // caminho aponta para fora de /generated/<slug>/
  | "UNMAPPABLE_PATH"       // caminho não vira storage key válida ou extensão desconhecida
  | "DUPLICATE_PATH"
  | "FILE_MISSING";         // referenciado no catálogo, ausente no disco

export interface LegacyIssue {
  folder: string;
  /** error = projeto fica de fora do resultado; warning = incluído, com ressalva. */
  severity: "error" | "warning";
  code: LegacyIssueCode;
  message: string;
  details?: Record<string, unknown>;
}

export type LegacyAssetRole =
  | "viewport"
  | "fullpage"
  | "section"
  | "page-viewport"
  | "page-fullpage"
  | "state"
  | "video"
  | "thumbnail"
  | "cover"
  | "composition"
  | "mockup";

/**
 * Arquivo legado descrito no vocabulário novo. `target` diz no que ele vira na
 * importação: matéria-prima (Asset) ou peça final renderizada (Output —
 * composições e mockups).
 */
export type LegacyFileDescriptor = {
  role: LegacyAssetRole;
  publicPath: string;
  /**
   * Caminho relativo à pasta do projeto, já validado com as regras de storage key
   * (sem "..", "%", "\", maiúsculas…). Na importação os bytes vão para uma chave
   * endereçada por conteúdo — uma recaptura v1 reescreve o mesmo caminho com bytes
   * novos, e o AssetStorage é imutável.
   */
  relativePath: string;
  mimeType: string;
  label: string | null;
  device: "desktop" | "mobile" | null;
  width: number | null;
  height: number | null;
  /** Linhagem: publicPath do arquivo de onde este foi derivado (thumbnail/capa). */
  derivedFrom: string | null;
} & ({ target: "asset"; kind: AssetKind } | { target: "output"; format: OutputFormat });

export interface LegacyProjectSnapshot {
  slug: Slug;
  atlasVersion: string;
  capturedAt: string;
  project: NewProjectInput;
  source: { type: "url"; locator: string };
  files: LegacyFileDescriptor[];
  /** Dados do v1 sem lugar no modelo da fundação — preservados, não descartados. */
  unmapped: {
    description?: string;
    inspection?: LegacyCatalog["inspection"];
    options?: LegacyCatalog["project"]["options"];
    extraPageInputs?: string[];
    stateInputs?: { name: string; selector: string }[];
  };
}

export interface MapResult {
  snapshot: LegacyProjectSnapshot | null;
  issues: LegacyIssue[];
}

const EXTENSIONS: Record<string, { mimeType: string; format: OutputFormat }> = {
  png: { mimeType: "image/png", format: "png" },
  webp: { mimeType: "image/webp", format: "webp" },
  jpg: { mimeType: "image/jpeg", format: "jpg" },
  jpeg: { mimeType: "image/jpeg", format: "jpg" },
  webm: { mimeType: "video/webm", format: "webm" },
  mp4: { mimeType: "video/mp4", format: "mp4" },
};

const ROLE_KIND: Record<Exclude<LegacyAssetRole, "composition" | "mockup">, AssetKind> = {
  viewport: "screenshot",
  fullpage: "screenshot",
  section: "section",
  "page-viewport": "screenshot",
  "page-fullpage": "screenshot",
  state: "screenshot",
  video: "video",
  thumbnail: "image",
  cover: "image",
};

interface FileRef {
  role: LegacyAssetRole;
  publicPath: string;
  label?: string | null;
  device?: "desktop" | "mobile" | null;
  width?: number;
  height?: number;
  derivedFrom?: string | null;
}

type ReportIssue = (
  severity: LegacyIssue["severity"],
  code: LegacyIssueCode,
  message: string,
  details?: Record<string, unknown>
) => void;

export function mapLegacyCatalog(folder: Slug, raw: unknown): MapResult {
  const issues: LegacyIssue[] = [];
  const issue: ReportIssue = (severity, code, message, details) =>
    issues.push({ folder, severity, code, message, ...(details ? { details } : {}) });

  const parsed = LegacyCatalogSchema.safeParse(raw);
  if (!parsed.success) {
    issue("error", "CATALOG_SCHEMA", `catalog.json fora do formato esperado: ${z.prettifyError(parsed.error)}`, {
      issues: parsed.error.issues,
    });
    return { snapshot: null, issues };
  }
  const catalog = parsed.data;

  if (catalog.project.slug !== folder) {
    issue("warning", "SLUG_MISMATCH", `project.slug "${catalog.project.slug}" difere da pasta; a pasta vale.`, {
      catalogSlug: catalog.project.slug,
    });
  }

  const project = NewProjectInputSchema.safeParse({
    slug: folder,
    name: catalog.project.name,
    category: catalog.project.category,
    ...(catalog.project.client?.trim() ? { client: catalog.project.client } : {}),
  });
  if (!project.success) {
    issue("error", "INVALID_PROJECT", `Metadados do projeto inválidos: ${z.prettifyError(project.error)}`);
  }
  if (!isHttpUrl(catalog.project.url)) {
    issue("error", "INVALID_PROJECT", `URL do projeto inválida: "${catalog.project.url}"`);
  }
  if (!project.success || !isHttpUrl(catalog.project.url)) return { snapshot: null, issues };

  const files: LegacyFileDescriptor[] = [];
  const seen = new Set<string>();
  for (const ref of collectFileRefs(catalog)) {
    if (seen.has(ref.publicPath)) {
      issue("warning", "DUPLICATE_PATH", `Arquivo referenciado mais de uma vez: ${ref.publicPath}`, { role: ref.role });
      continue;
    }
    seen.add(ref.publicPath);
    const descriptor = describeFile(folder, ref, issue);
    if (descriptor) files.push(descriptor);
  }

  return {
    snapshot: {
      slug: folder,
      atlasVersion: catalog.version,
      capturedAt: catalog.createdAt,
      project: project.data,
      source: { type: "url", locator: catalog.project.url },
      files,
      unmapped: {
        ...(catalog.project.description ? { description: catalog.project.description } : {}),
        ...(catalog.inspection ? { inspection: catalog.inspection } : {}),
        ...(catalog.project.options ? { options: catalog.project.options } : {}),
        ...(catalog.project.pages?.length ? { extraPageInputs: catalog.project.pages } : {}),
        ...(catalog.project.states?.length ? { stateInputs: catalog.project.states } : {}),
      },
    },
    issues,
  };
}

function collectFileRefs(catalog: LegacyCatalog): FileRef[] {
  const { desktop, mobile } = catalog.captures;
  const refs: FileRef[] = [
    { role: "viewport", publicPath: desktop.screenshot, device: "desktop", label: desktop.viewport },
    { role: "fullpage", publicPath: desktop.fullpage, device: "desktop" },
    { role: "viewport", publicPath: mobile.screenshot, device: "mobile", label: mobile.viewport },
    { role: "fullpage", publicPath: mobile.fullpage, device: "mobile" },
  ];

  for (const s of catalog.sections) {
    refs.push({ role: "section", publicPath: s.screenshot, device: s.device, label: s.suggestedName ?? s.heading ?? s.name });
  }
  for (const page of catalog.pages ?? []) {
    refs.push(
      { role: "page-viewport", publicPath: page.desktop.screenshot, device: "desktop", label: page.path },
      { role: "page-fullpage", publicPath: page.desktop.fullpage, device: "desktop", label: page.path },
      { role: "page-viewport", publicPath: page.mobile.screenshot, device: "mobile", label: page.path },
      { role: "page-fullpage", publicPath: page.mobile.fullpage, device: "mobile", label: page.path }
    );
  }
  for (const state of catalog.states ?? []) {
    refs.push({ role: "state", publicPath: state.screenshot, device: "desktop", label: state.name });
  }
  if (catalog.videos?.desktop) refs.push({ role: "video", publicPath: catalog.videos.desktop, device: "desktop" });
  if (catalog.videos?.mobile) refs.push({ role: "video", publicPath: catalog.videos.mobile, device: "mobile" });

  refs.push(
    { role: "thumbnail", publicPath: catalog.thumbnails.main, device: "desktop", derivedFrom: desktop.screenshot },
    { role: "thumbnail", publicPath: catalog.thumbnails.mobile, device: "mobile", derivedFrom: mobile.screenshot }
  );
  if (catalog.cover) {
    refs.push({
      role: "cover",
      publicPath: catalog.cover.image,
      label: catalog.cover.source,
      // og-image vem de fora do site capturado: sem linhagem interna.
      derivedFrom: catalog.cover.source === "smart-crop" ? desktop.screenshot : null,
    });
  }
  for (const c of catalog.compositions ?? []) {
    refs.push({ role: "composition", publicPath: c.image, label: c.label, width: c.width, height: c.height });
  }
  for (const m of catalog.mockups ?? []) {
    refs.push({ role: "mockup", publicPath: m.image, label: m.label });
  }
  return refs;
}

function describeFile(folder: Slug, ref: FileRef, issue: ReportIssue): LegacyFileDescriptor | null {
  const prefix = `/generated/${folder}/`;
  if (!ref.publicPath.startsWith(prefix)) {
    issue("warning", "PATH_OUTSIDE_PROJECT", `Caminho fora da pasta do projeto: ${ref.publicPath}`, { role: ref.role });
    return null;
  }

  const relative = ref.publicPath.slice(prefix.length);
  try {
    // A validação da storage key barra "..", "%2e", "\", maiúsculas etc.
    parseStorageKey(`legacy/${folder}/${relative}`);
  } catch {
    issue("warning", "UNMAPPABLE_PATH", `Caminho não vira storage key segura: ${ref.publicPath}`, { role: ref.role });
    return null;
  }

  const extension = relative.slice(relative.lastIndexOf(".") + 1);
  const type = EXTENSIONS[extension];
  if (!type) {
    issue("warning", "UNMAPPABLE_PATH", `Extensão desconhecida: ${ref.publicPath}`, { role: ref.role });
    return null;
  }

  const common = {
    role: ref.role,
    publicPath: ref.publicPath,
    relativePath: relative,
    mimeType: type.mimeType,
    label: ref.label ?? null,
    device: ref.device ?? null,
    width: ref.width ?? null,
    height: ref.height ?? null,
    derivedFrom: ref.derivedFrom ?? null,
  };

  if (ref.role === "composition" || ref.role === "mockup") {
    return { ...common, target: "output", format: type.format };
  }
  return { ...common, target: "asset", kind: ROLE_KIND[ref.role] };
}

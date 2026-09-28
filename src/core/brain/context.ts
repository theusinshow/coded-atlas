import type { Asset } from "../assets/asset";
import type { CompositionDefinition } from "../creative/composition";
import type { VisualProfile } from "../creative/visual-profile";
import type { Project } from "../projects/project";

/**
 * Context Builder (docs/ATLAS-BRAIN.md): manda ao modelo só o necessário e faz a
 * filtragem determinística ANTES do raciocínio — sem duplicatas, sem imagens
 * pequenas/derivadas, priorizando o que importa, com teto.
 */

export const SHORTLIST_LIMIT = 24;
const MIN_WIDTH = 300;
const MIN_HEIGHT = 200;
const EXCLUDED_ROLES = new Set(["cover", "thumbnail", "composition", "mockup"]);

export interface ShortlistItem {
  id: string;
  kind: string;
  device: string | null;
  role: string | null;
  section: string | null;
  sectionIndex: number | null;
  page: string | null;
  width: number | null;
  height: number | null;
  /** Prioridade determinística 0..1 (o modelo pode discordar, com motivo). */
  priority: number;
  /** Frase curta legível: o que é este asset. */
  describe: string;
}

function priorityOf(asset: Asset): number {
  const m = asset.metadata;
  if (m.role === "viewport") return m.device === "mobile" ? 0.9 : 1;
  if (m.role === "section") return Math.max(0.5, 0.85 - (m.sectionIndex ?? 0) * 0.03);
  if (m.role === "page-viewport") return 0.75;
  if (m.role === "fullpage") return 0.7;
  if (m.role === "page-fullpage") return 0.6;
  if (m.role === "state") return 0.6;
  if (asset.kind === "logo") return 0.55;
  if (m.origin === "upload") return 0.7;
  if (m.origin === "legacy") return asset.kind === "section" ? 0.75 : 0.8;
  return 0.5;
}

function describe(asset: Asset): string {
  const m = asset.metadata;
  const device = m.device === "mobile" ? "mobile" : m.device === "desktop" ? "desktop" : "";
  const what =
    m.role === "section" || asset.kind === "section"
      ? `seção${m.sectionName ? ` "${m.sectionName}"` : ""}${m.sectionIndex !== undefined ? ` (#${m.sectionIndex + 1} da página)` : ""}`
      : m.role === "fullpage"
        ? "página inteira"
        : m.role === "state"
          ? `estado${m.stateName ? ` "${m.stateName}"` : ""}`
          : m.role === "page-viewport"
            ? `página ${m.pagePath ?? ""}`.trim()
            : asset.kind === "logo"
              ? "logo"
              : "primeira dobra";
  return [what, device, asset.label && asset.label !== what ? `— ${asset.label}` : ""].filter(Boolean).join(" ").slice(0, 160);
}

/** Lista curta e ordenada de imagens candidatas (mesmo resultado para a mesma entrada). */
export function buildShortlist(assets: readonly Asset[], limit = SHORTLIST_LIMIT): ShortlistItem[] {
  const seen = new Set<string>();
  return assets
    .filter((a) => a.mimeType.startsWith("image/"))
    // Derivados (capa recortada, miniaturas) repetem o original: fora.
    .filter((a) => a.metadata.origin !== "derived" && !EXCLUDED_ROLES.has(a.metadata.role ?? ""))
    .filter((a) => (a.width ?? MIN_WIDTH) >= MIN_WIDTH && (a.height ?? MIN_HEIGHT) >= MIN_HEIGHT)
    .map((a) => ({ asset: a, priority: priorityOf(a) }))
    // Maior prioridade primeiro; empate → mais recente.
    .sort((x, y) => y.priority - x.priority || (x.asset.createdAt < y.asset.createdAt ? 1 : x.asset.createdAt > y.asset.createdAt ? -1 : x.asset.id < y.asset.id ? 1 : -1))
    // Mesmos bytes (ex.: hero do v1 = screenshot principal): fica o registro de papel mais forte.
    .filter(({ asset }) => {
      if (seen.has(asset.sha256)) return false;
      seen.add(asset.sha256);
      return true;
    })
    .slice(0, limit)
    .map(({ asset, priority }) => ({
      id: asset.id,
      kind: asset.kind,
      device: asset.metadata.device ?? null,
      role: asset.metadata.role ?? null,
      section: asset.metadata.sectionName ?? null,
      sectionIndex: asset.metadata.sectionIndex ?? null,
      page: asset.metadata.pagePath ?? null,
      width: asset.width,
      height: asset.height,
      priority: Math.round(priority * 100) / 100,
      describe: describe(asset),
    }));
}

export interface CatalogEntry {
  id: string;
  name: string;
  family: string;
  description: string;
  formats: readonly string[];
  variants: readonly { id: string; label: string }[];
  slots: { id: string; type: "asset" | "text"; label: string; required: boolean; maxLength: number | null; wants: string | null }[];
}

export function buildCatalog(compositions: readonly CompositionDefinition[]): CatalogEntry[] {
  return compositions.map((c) => ({
    id: c.id,
    name: c.name,
    family: c.family,
    description: c.description,
    formats: c.formats,
    variants: c.variants,
    slots: c.slots.map((s) =>
      s.type === "asset"
        ? { id: s.id, type: "asset" as const, label: s.label, required: s.required, maxLength: null, wants: s.prefers.map((p) => [p.device, p.role ?? p.kinds.join("/")].filter(Boolean).join(" ")).join(" | ") }
        : { id: s.id, type: "text" as const, label: s.label, required: s.required, maxLength: s.maxLength, wants: null }
    ),
  }));
}

export interface ProjectPack {
  name: string;
  category: string;
  client: string | null;
  description: string | null;
  url: string | null;
}

export interface VisualPack {
  revision: number;
  palette: readonly string[];
  fonts: readonly string[];
  traits: readonly string[];
  techStack: readonly string[];
}

export interface ContextPack {
  project: ProjectPack;
  visual: VisualPack | null;
  shortlist: ShortlistItem[];
  catalog: CatalogEntry[];
}

export function buildContextPack(input: {
  project: Pick<Project, "name" | "category" | "client" | "description">;
  url: string | null;
  profile: VisualProfile | null;
  assets: readonly Asset[];
  compositions: readonly CompositionDefinition[];
}): ContextPack {
  const { project, profile } = input;
  return {
    project: { name: project.name, category: project.category, client: project.client, description: project.description, url: input.url },
    visual: profile ? { revision: profile.revision, palette: profile.palette, fonts: profile.fonts, traits: profile.traits, techStack: profile.techStack } : null,
    shortlist: buildShortlist(input.assets),
    catalog: buildCatalog(input.compositions),
  };
}

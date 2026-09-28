import { z } from "zod";
import type { Asset } from "../assets/asset";
import type { VisualProfile } from "../creative/visual-profile";
import type { Project } from "../projects/project";
import { DocumentStyleSchema, type DocumentStyle } from "../documents/style";
import { newId } from "../../shared/id";

/**
 * CaseDocument (docs/DOMAIN-MODEL.md → CreativeDocument family): o estudo de caso
 * do projeto como SEÇÕES editoriais — texto, imagem em moldura, galeria, peça do
 * Atlas, identidade — em vez de um artboard. Sai como página web, PDF e módulos
 * no estilo Behance. Nada de métricas inventadas: texto vazio não é publicado.
 */
const Id = z.string().min(1).max(64);
const AssetRef = z.string().min(1).max(40);

export const CaseSectionSchema = z.discriminatedUnion("type", [
  z.strictObject({ id: Id, type: z.literal("text"), heading: z.string().max(120), body: z.string().max(4000) }),
  z.strictObject({ id: Id, type: z.literal("image"), assetId: AssetRef, caption: z.string().max(240), frame: z.enum(["none", "browser", "phone"]) }),
  z.strictObject({ id: Id, type: z.literal("gallery"), assetIds: z.array(AssetRef).min(1).max(12), caption: z.string().max(240) }),
  /** Peça final do Atlas (Output de imagem) — o case mostra o que foi produzido. */
  z.strictObject({ id: Id, type: z.literal("piece"), outputId: AssetRef, caption: z.string().max(240) }),
  z.strictObject({ id: Id, type: z.literal("identity"), heading: z.string().max(120) }),
  z.strictObject({ id: Id, type: z.literal("facts"), items: z.array(z.strictObject({ label: z.string().min(1).max(60), value: z.string().min(1).max(160) })).max(12) }),
]);
export type CaseSection = z.infer<typeof CaseSectionSchema>;
export type CaseSectionType = CaseSection["type"];

export const CaseContentSchema = z.strictObject({
  case: z.strictObject({
    title: z.string().trim().min(1).max(120),
    subtitle: z.string().max(240),
    client: z.string().max(120),
    category: z.string().max(120),
    url: z.string().max(300),
    year: z.string().max(12),
    coverAssetId: AssetRef.nullable(),
    techStack: z.array(z.string().max(60)).max(20),
  }),
  sections: z.array(CaseSectionSchema).max(40),
  style: DocumentStyleSchema,
  /** Uniformidade com os outros documentos (case não tem formato de peça). */
  formatId: z.null(),
  /** Snapshot da identidade (seção "identity" e tokens) — revisão congelada no case. */
  identity: z.strictObject({ palette: z.array(z.string().regex(/^#[0-9a-f]{6}$/)).max(12), fonts: z.array(z.string().max(80)).max(8) }),
});
export type CaseContent = z.infer<typeof CaseContentSchema>;

export function caseAssetIds(content: CaseContent): string[] {
  const ids = new Set<string>();
  if (content.case.coverAssetId) ids.add(content.case.coverAssetId);
  for (const s of content.sections) {
    if (s.type === "image") ids.add(s.assetId);
    if (s.type === "gallery") s.assetIds.forEach((id) => ids.add(id));
  }
  return [...ids];
}

export function caseOutputIds(content: CaseContent): string[] {
  return content.sections.flatMap((s) => (s.type === "piece" ? [s.outputId] : []));
}

/** Seção que vai para a saída? Texto sem corpo e galerias vazias ficam só no editor. */
export function isPublishable(section: CaseSection): boolean {
  if (section.type === "text") return section.body.trim().length > 0;
  return true;
}

const byNewest = (a: Asset, b: Asset) => (a.createdAt < b.createdAt ? 1 : -1);

/**
 * Esqueleto do case a partir do material (o gerador de case do v1, agora em
 * seções editáveis): contexto, desktop no navegador, mobile no celular, seções
 * em galeria, identidade e ficha técnica. Textos sem dados ficam VAZIOS para o
 * Matheus (ou o Atlas Brain) escreverem — não publicam enquanto vazios.
 */
export function buildCaseOutline(input: {
  project: Pick<Project, "name" | "category" | "client" | "description">;
  assets: readonly Asset[];
  url: string | null;
  profile: VisualProfile | null;
  coverAssetId: string | null;
  style: DocumentStyle;
  year: string;
}): CaseContent {
  const images = input.assets.filter((a) => a.mimeType.startsWith("image/") && a.metadata.origin !== "derived" && a.metadata.role !== "thumbnail").sort(byNewest);
  const desktop = images.find((a) => a.metadata.role === "viewport" && a.metadata.device === "desktop") ?? images.find((a) => a.metadata.device !== "mobile");
  const mobile = images.find((a) => a.metadata.role === "viewport" && a.metadata.device === "mobile") ?? images.find((a) => a.metadata.device === "mobile");
  const sections = images.filter((a) => a.kind === "section" || a.metadata.role === "section").sort((a, b) => (a.metadata.sectionIndex ?? 99) - (b.metadata.sectionIndex ?? 99));
  const host = (() => {
    try {
      return input.url ? new URL(input.url).host.replace(/^www\./, "") : "";
    } catch {
      return input.url ?? "";
    }
  })();

  const out: CaseSection[] = [
    { id: newId(), type: "text", heading: "Contexto", body: input.project.description?.trim() ?? "" },
    ...(desktop ? [{ id: newId(), type: "image" as const, assetId: desktop.id, caption: "Primeira dobra no desktop.", frame: "browser" as const }] : []),
    { id: newId(), type: "text", heading: "Desafio", body: "" },
    ...(mobile ? [{ id: newId(), type: "image" as const, assetId: mobile.id, caption: "A mesma experiência no celular.", frame: "phone" as const }] : []),
    { id: newId(), type: "text", heading: "Solução", body: "" },
    ...(sections.length > 0 ? [{ id: newId(), type: "gallery" as const, assetIds: sections.slice(0, 6).map((s) => s.id), caption: "Seções do site." }] : []),
    ...((input.profile?.palette.length ?? 0) > 0 || (input.profile?.fonts.length ?? 0) > 0 ? [{ id: newId(), type: "identity" as const, heading: "Identidade visual" }] : []),
    {
      id: newId(),
      type: "facts",
      items: [
        ...(input.project.client ? [{ label: "Cliente", value: input.project.client }] : []),
        { label: "Categoria", value: input.project.category },
        ...(host ? [{ label: "Site", value: host }] : []),
        ...(input.profile?.techStack.length ? [{ label: "Tecnologia", value: input.profile.techStack.slice(0, 5).join(", ") }] : []),
        { label: "Desenvolvimento", value: "Coded by M" },
      ],
    },
  ];
  return CaseContentSchema.parse({
    case: {
      title: input.project.name,
      subtitle: input.project.description?.trim().slice(0, 240) ?? "",
      client: input.project.client ?? "",
      category: input.project.category,
      url: input.url ?? "",
      year: input.year,
      coverAssetId: input.coverAssetId ?? desktop?.id ?? null,
      techStack: input.profile?.techStack.slice(0, 20) ?? [],
    },
    sections: out,
    style: input.style,
    formatId: null,
    identity: { palette: input.profile?.palette.slice(0, 12) ?? [], fonts: input.profile?.fonts.slice(0, 8) ?? [] },
  });
}

export function newCaseSection(type: CaseSectionType): CaseSection {
  const id = newId();
  switch (type) {
    case "text":
      return { id, type, heading: "Novo trecho", body: "" };
    case "identity":
      return { id, type, heading: "Identidade visual" };
    case "facts":
      return { id, type, items: [{ label: "Cliente", value: "—" }] };
    default:
      throw new Error("Seções de imagem precisam de um asset — use o seletor.");
  }
}

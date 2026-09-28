import type { Asset } from "../assets/asset";
import { autoBind, missingSlots } from "../creative/auto-bind";
import type { Binding } from "../creative/composition";
import { getComposition } from "../creative/compositions";
import { formatSize, type FormatId } from "../creative/formats";
import { buildArtboard } from "../creative/instance-artboard";
import type { VisualProfile } from "../creative/visual-profile";
import type { Project } from "../projects/project";
import { PresentationContentSchema, type PresentationContent, type Slide } from "../documents/creative-document";
import type { DocumentStyle } from "../documents/style";
import { newId } from "../../shared/id";

/**
 * Storyboard de apresentação (docs/WORKFLOWS.md → F): a sequência clássica de um
 * case — capa, contexto, o site, responsivo, detalhes, destaque, identidade,
 * fechamento — montada com composições curadas e o material real. Slides sem
 * material são pulados (e informados); nenhum dado é inventado.
 */
interface SlideStep {
  id: string;
  title: string;
  compositionId: string;
  variant?: string;
  /** Textos fixos por slot (sobrepõem os padrões do projeto). */
  texts?: (ctx: StoryboardContext) => Record<string, string>;
  notes: (ctx: StoryboardContext) => string;
  when?: (ctx: StoryboardContext) => boolean;
}

export interface StoryboardContext {
  project: Pick<Project, "name" | "category" | "client" | "description">;
  assets: readonly Asset[];
  url: string | null;
  profile: VisualProfile | null;
}

const sections = (ctx: StoryboardContext) => ctx.assets.filter((a) => a.mimeType.startsWith("image/") && (a.kind === "section" || a.metadata.role === "section")).length;
const hasMobile = (ctx: StoryboardContext) => ctx.assets.some((a) => a.mimeType.startsWith("image/") && a.metadata.device === "mobile");
const who = (ctx: StoryboardContext) => ctx.project.client ?? ctx.project.name;

export const PRESENTATION_STEPS: readonly SlideStep[] = [
  {
    id: "cover",
    title: "Capa",
    compositionId: "project-reveal",
    notes: (c) => `Abra apresentando ${c.project.name}${c.project.client ? ` — projeto para ${c.project.client}` : ""}. Uma frase sobre o que o site resolve.`,
  },
  {
    id: "context",
    title: "Contexto",
    compositionId: "statement",
    variant: "split",
    texts: (c) => ({ label: "Contexto", title: "O projeto", body: c.project.description?.trim() || `${c.project.category} desenvolvido pela Coded by M para ${who(c)}.` }),
    notes: (c) => `Explique o ponto de partida de ${who(c)}: o que existia, o que precisava mudar e para quem o site fala.`,
  },
  {
    id: "site",
    title: "O site",
    compositionId: "desktop-hero",
    notes: () => "Mostre a primeira dobra: a mensagem principal e a chamada para ação.",
  },
  {
    id: "responsive",
    title: "Responsivo",
    compositionId: "desktop-mobile",
    when: hasMobile,
    notes: () => "Desktop e mobile lado a lado: a experiência se mantém em qualquer tela.",
  },
  {
    id: "details",
    title: "Detalhes",
    compositionId: "ui-details-grid",
    when: (c) => sections(c) >= 3,
    notes: () => "Passe pelas seções que mais contam a história — conteúdo, prova, contato.",
  },
  {
    id: "feature",
    title: "Destaque",
    compositionId: "single-feature",
    when: (c) => sections(c) >= 1,
    notes: () => "Aprofunde uma seção: por que ela foi desenhada assim.",
  },
  {
    id: "identity",
    title: "Identidade visual",
    compositionId: "typography-colors",
    when: (c) => (c.profile?.palette.length ?? 0) >= 2,
    notes: () => "Paleta e tipografia lidas do próprio site: a identidade aplicada com consistência.",
  },
  {
    id: "closing",
    title: "Encerramento",
    compositionId: "project-closing",
    notes: (c) => `Feche com o endereço${c.url ? ` (${c.url.replace(/^https?:\/\//, "").replace(/\/$/, "")})` : ""} e a assinatura Coded by M. Abra para perguntas.`,
  },
];

export function buildPresentation(ctx: StoryboardContext & { formatId: FormatId; style: DocumentStyle }): { content: PresentationContent; skipped: string[] } {
  const assetMap = new Map(ctx.assets.map((a) => [a.id as string, a]));
  const slides: Slide[] = [];
  const skipped: string[] = [];
  for (const step of PRESENTATION_STEPS) {
    if (step.when && !step.when(ctx)) {
      skipped.push(`${step.title}: sem material`);
      continue;
    }
    const definition = getComposition(step.compositionId);
    if (!definition || !definition.formats.includes(ctx.formatId)) {
      skipped.push(`${step.title}: composição indisponível`);
      continue;
    }
    const bindings: Record<string, Binding> = autoBind(definition, ctx);
    for (const [slot, text] of Object.entries(step.texts?.(ctx) ?? {})) {
      const def = definition.slots.find((s) => s.id === slot && s.type === "text");
      if (def && def.type === "text") bindings[slot] = { text: text.slice(0, def.maxLength) };
    }
    if (missingSlots(definition, bindings).length > 0) {
      skipped.push(`${step.title}: sem material`);
      continue;
    }
    const artboard = buildArtboard(definition, { formatId: ctx.formatId, variant: step.variant ?? definition.variants[0].id, bindings }, assetMap, ctx.profile);
    slides.push({ id: newId(), title: step.title, notes: step.notes(ctx).slice(0, 2000), artboard });
  }
  if (slides.length === 0) throw new Error("Sem material para montar a apresentação.");
  // Garantia: todos no mesmo formato.
  const { width, height } = formatSize(ctx.formatId);
  if (slides.some((s) => s.artboard.width !== width || s.artboard.height !== height)) throw new Error("Slides fora do formato.");
  return { content: PresentationContentSchema.parse({ slides, style: ctx.style, formatId: ctx.formatId }), skipped };
}

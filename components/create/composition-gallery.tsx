"use client";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Play } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { createInstanceAction } from "@/app/actions/create";
import { createBlankCanvasAction, createPresentationAction, createVideoFromRecipeAction, createWebsiteScrollAction } from "@/app/actions/studio";
import { VIDEO_RECIPES } from "@/src/core/motion/recipes";
import { totalDurationMs } from "@/src/core/motion/motion";
import { contentPages, isCarousel, isMotion, isPresentation, type DocumentContent } from "@/src/core/documents/creative-document";
import { resolveTokens } from "@/src/core/creative/tokens";
import type { Binding, CompositionInstance } from "@/src/core/creative/composition";
import { COMPOSITIONS } from "@/src/core/creative/compositions";
import { FORMAT_IDS, FORMATS, type FormatId } from "@/src/core/creative/formats";
import type { VisualProfile } from "@/src/core/creative/visual-profile";
import { buttonClass, Collapsible, SectionTitle } from "@/components/ui/primitives";
import { DEVICE_LABEL, formatDuration, plural } from "@/components/ui/format";
import { DURATION, EASE_OUT } from "@/components/ui/motion";
import { ArtboardPreview, FramedArtboard } from "./artboard-preview";
import { SubmitButton } from "./submit-button";
import { FAMILY_LABEL, instanceDefinition, renderModel, type StudioAsset } from "./types";

export interface GalleryDocument {
  id: string;
  name: string;
  updatedAt: string;
  content: DocumentContent;
}

interface Props {
  projectId: string;
  slug: string;
  assets: StudioAsset[];
  profile: VisualProfile | null;
  profilesByRevision: Record<number, VisualProfile>;
  suggestions: Record<string, Record<string, Binding>>;
  instances: CompositionInstance[];
  documents: GalleryDocument[];
  /** "há 2 h" calculado no servidor (id → texto), sem divergência de hidratação. */
  ago: Record<string, string>;
}

const GRID: Record<FormatId, string> = {
  "post-1x1": "grid-cols-2 lg:grid-cols-4",
  "post-4x5": "grid-cols-2 lg:grid-cols-4",
  "story-9x16": "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
  "landscape-16x9": "grid-cols-1 sm:grid-cols-2",
  "og-1.91x1": "grid-cols-1 sm:grid-cols-2",
};

/** Quantas peças aparecem antes de "Mostrar todas". */
const PIECES_PREVIEW = 10;

const SELECT_CLASS = "h-10 sm:h-8 min-w-0 max-w-full bg-surface border border-line text-[12px] text-cbm-gray-200 px-2 focus:outline-none focus:border-accent";
const SMALL_BUTTON = `${buttonClass("secondary", "sm")} max-sm:h-10`;

function documentKind(content: DocumentContent): string {
  if (isCarousel(content)) return `Carrossel · ${plural(content.pages.length, "página", "páginas")}`;
  if (isMotion(content)) return `Vídeo · ${plural(content.scenes.length, "cena", "cenas")}`;
  if (isPresentation(content)) return `Apresentação · ${plural(content.slides.length, "slide", "slides")}`;
  return "Peça livre";
}

/** Nome legível de uma página inteira capturada: "Página inteira (Desktop) · /contato". */
function fullPageLabel(a: StudioAsset): string {
  const device = a.metadata.device ? (DEVICE_LABEL[a.metadata.device] ?? a.metadata.device) : null;
  const base = device ? `Página inteira (${device})` : "Página inteira";
  const path = a.metadata.pagePath && a.metadata.pagePath !== "/" ? ` · ${a.metadata.pagePath}` : "";
  return a.metadata.role === "upload" && a.label ? a.label : `${base}${path}`;
}

type Piece = { id: string; updatedAt: string; kind: "instance"; instance: CompositionInstance } | { id: string; updatedAt: string; kind: "document"; document: GalleryDocument };

/** Criar → Peças: o que já está em andamento, as composições curadas (caminho principal) e os outros formatos. */
export function CompositionGallery({ projectId, slug, assets, profile, profilesByRevision, suggestions, instances, documents, ago }: Props) {
  const [format, setFormat] = useState<FormatId>("post-4x5");
  const [showAll, setShowAll] = useState(false);
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const available = COMPOSITIONS.filter((c) => c.formats.includes(format));
  // O vídeo de rolagem precisa da página inteira (ou qualquer imagem bem mais alta que larga).
  const tallPages = assets.filter((a) => a.metadata.role === "fullpage" || a.metadata.role === "page-fullpage" || (!!a.width && !!a.height && a.height > a.width * 2));

  const pieces = useMemo<Piece[]>(
    () =>
      [
        ...instances.map((instance): Piece => ({ id: instance.id, updatedAt: instance.updatedAt, kind: "instance", instance })),
        ...documents.map((document): Piece => ({ id: document.id, updatedAt: document.updatedAt, kind: "document", document })),
      ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [instances, documents]
  );
  const visiblePieces = showAll ? pieces : pieces.slice(0, PIECES_PREVIEW);

  return (
    <div className="space-y-12">
      {pieces.length > 0 && (
        <section aria-labelledby="pecas">
          <SectionTitle
            id="pecas"
            aside={
              pieces.length > PIECES_PREVIEW ? (
                <button type="button" onClick={() => setShowAll((v) => !v)} className="h-10 sm:h-8 text-[12px] text-accent hover:text-accent-bright" aria-expanded={showAll}>
                  {showAll ? "Mostrar menos" : `Mostrar todas (${pieces.length})`}
                </button>
              ) : undefined
            }
          >
            Suas peças ({pieces.length})
          </SectionTitle>
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-5">
            <AnimatePresence initial={false}>
              {visiblePieces.map((piece) => (
                <motion.li
                  key={piece.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { duration: DURATION.quick, ease: EASE_OUT } }}
                  exit={{ opacity: 0, transition: { duration: DURATION.instant } }}
                >
                  {piece.kind === "instance" ? (
                    <InstanceCard instance={piece.instance} slug={slug} assetMap={assetMap} profile={profile} profilesByRevision={profilesByRevision} ago={ago[piece.id]} />
                  ) : (
                    <DocumentCard document={piece.document} profilesByRevision={profilesByRevision} ago={ago[piece.id]} />
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </section>
      )}

      <section aria-labelledby="galeria" className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="galeria" className="text-[11px] font-medium uppercase tracking-[0.22em] text-cbm-gray-400">
              Composições curadas
            </h2>
            <p className="text-[13px] text-cbm-gray-400 mt-1.5">Já preenchidas com o material do projeto.</p>
          </div>
          <div role="radiogroup" aria-label="Formato" className="flex flex-wrap gap-1">
            {FORMAT_IDS.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={format === id}
                onClick={() => setFormat(id)}
                className={`h-10 sm:h-8 px-3 text-[12px] border transition-colors ${
                  format === id ? "border-cbm-white text-cbm-white" : "border-line text-cbm-gray-400 hover:text-cbm-white hover:border-cbm-gray-400"
                }`}
              >
                {FORMATS[id].label}
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.ul
            key={format}
            className={`grid gap-x-6 gap-y-8 ${GRID[format]}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: DURATION.quick, ease: EASE_OUT } }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
          >
            {available.map((definition) => {
              const model = renderModel(definition, { formatId: format, variant: definition.variants[0].id, styleMode: "hybrid", bindings: suggestions[definition.id] ?? {} }, assetMap, profile);
              return (
                <li key={definition.id} className="group" data-composition={definition.id}>
                  <form action={createInstanceAction} className="space-y-3">
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="compositionId" value={definition.id} />
                    <input type="hidden" name="formatId" value={format} />
                    {/* A prévia inteira também abre a peça (atalho de mouse; o botão "Usar" é o controle acessível). */}
                    <button type="submit" tabIndex={-1} aria-hidden className="block w-full cursor-pointer">
                      <ArtboardPreview {...model} className="border border-line transition-colors group-hover:border-cbm-gray-400" />
                    </button>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-cbm-gray-400">{FAMILY_LABEL[definition.family]}</p>
                        <p className="text-[14px] text-cbm-white mt-0.5">{definition.name}</p>
                      </div>
                      <SubmitButton
                        className={`${SMALL_BUTTON} shrink-0 group-hover:border-signal group-hover:bg-signal group-hover:text-cbm-black focus-visible:border-signal focus-visible:bg-signal focus-visible:text-cbm-black`}
                      >
                        Usar
                      </SubmitButton>
                    </div>
                    <p className="text-[12px] text-cbm-gray-400 leading-snug line-clamp-2">{definition.description}</p>
                  </form>
                </li>
              );
            })}
          </motion.ul>
        </AnimatePresence>
      </section>

      <Collapsible title="Mais formatos">
        <div className="divide-y divide-line -my-4">
          <FormatRow title="Apresentação" detail="Slides 16:9 com notas do apresentador. Exporta PDF, PPTX e imagens.">
            <form action={createPresentationAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <SubmitButton className={SMALL_BUTTON}>Montar apresentação</SubmitButton>
            </form>
          </FormatRow>

          <FormatRow title="Vídeo por receita" detail="Estruturas prontas (abertura, site, mobile, rolagem, assinatura) montadas com o material do projeto.">
            <form action={createVideoFromRecipeAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="projectId" value={projectId} />
              <select name="recipeId" aria-label="Receita de vídeo" className={`${SELECT_CLASS} max-sm:flex-1 sm:max-w-60`}>
                {VIDEO_RECIPES.map((r) => (
                  <option key={r.id} value={r.id} title={r.description}>
                    {r.name} · {r.durationRange[0]}–{r.durationRange[1]} s
                  </option>
                ))}
              </select>
              <select name="formatId" aria-label="Formato do vídeo por receita" defaultValue="story-9x16" className={SELECT_CLASS}>
                {FORMAT_IDS.map((id) => (
                  <option key={id} value={id}>
                    {FORMATS[id].label}
                  </option>
                ))}
              </select>
              <SubmitButton className={SMALL_BUTTON}>Montar vídeo</SubmitButton>
            </form>
          </FormatRow>

          {tallPages.length > 0 && (
            <FormatRow title="Vídeo de rolagem" detail="A página inteira rolando dentro de um navegador. Pronto para Reels e apresentações.">
              <form action={createWebsiteScrollAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="projectId" value={projectId} />
                <select name="assetId" aria-label="Página inteira" className={`${SELECT_CLASS} max-sm:flex-1 sm:max-w-60`}>
                  {tallPages.map((a) => (
                    <option key={a.id} value={a.id}>
                      {fullPageLabel(a)}
                    </option>
                  ))}
                </select>
                <select name="formatId" aria-label="Formato do vídeo" defaultValue="story-9x16" className={SELECT_CLASS}>
                  {FORMAT_IDS.map((id) => (
                    <option key={id} value={id}>
                      {FORMATS[id].label}
                    </option>
                  ))}
                </select>
                <SubmitButton className={SMALL_BUTTON}>Criar vídeo</SubmitButton>
              </form>
            </FormatRow>
          )}

          <FormatRow title="Documento em branco" detail="Edição livre no Studio: camadas, textos e imagens do projeto.">
            <form action={createBlankCanvasAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="projectId" value={projectId} />
              <select name="kind" aria-label="Tipo de documento" defaultValue="canvas" className={`${SELECT_CLASS} max-sm:flex-1`}>
                <option value="canvas">Peça livre</option>
                <option value="carousel">Carrossel (3 páginas)</option>
                <option value="motion">Vídeo (1 cena)</option>
              </select>
              <select name="formatId" aria-label="Formato do documento" defaultValue={format} key={format} className={SELECT_CLASS}>
                {FORMAT_IDS.map((id) => (
                  <option key={id} value={id}>
                    {FORMATS[id].label}
                  </option>
                ))}
              </select>
              <SubmitButton className={SMALL_BUTTON}>Criar</SubmitButton>
            </form>
          </FormatRow>
        </div>
      </Collapsible>
    </div>
  );
}

function FormatRow({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return (
    <div className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-8">
      <div className="min-w-0">
        <h3 className="text-[13px] text-cbm-white">{title}</h3>
        <p className="text-[12px] text-cbm-gray-400 mt-0.5 leading-snug">{detail}</p>
      </div>
      {children}
    </div>
  );
}

/**
 * Peças geradas por kit se chamam "Kit de portfólio · MJ Engenharia · Destaque 16:9":
 * o cartão mostra o nome do item e deixa a origem (o kit) na linha de detalhe.
 */
function splitName(name: string): { title: string; origin: string | null } {
  const parts = name.split(" · ");
  return parts.length >= 3 ? { title: parts[parts.length - 1], origin: parts[0] } : { title: name, origin: null };
}

function PieceCaption({ name, detail }: { name: string; detail: string }) {
  const { title, origin } = splitName(name);
  return (
    <div className="min-w-0">
      <p className="text-[13px] text-cbm-gray-100 truncate" title={name}>
        {title}
      </p>
      <p className="text-[12px] text-cbm-gray-400 truncate">{origin ? `${origin} · ${detail}` : detail}</p>
    </div>
  );
}

function InstanceCard({
  instance,
  slug,
  assetMap,
  profile,
  profilesByRevision,
  ago,
}: {
  instance: CompositionInstance;
  slug: string;
  assetMap: ReadonlyMap<string, StudioAsset>;
  profile: VisualProfile | null;
  profilesByRevision: Record<number, VisualProfile>;
  ago: string | undefined;
}) {
  const definition = instanceDefinition(instance);
  if (!definition) return null;
  const snapshot = (instance.visualProfileRevision && profilesByRevision[instance.visualProfileRevision]) || profile;
  const model = renderModel(definition, { ...instance, primary: instance.overrides.primary }, assetMap, snapshot);
  return (
    <Link href={`/projects/${slug}/create/${instance.id}`} className="group block space-y-2">
      <FramedArtboard {...model} className="border border-line transition-colors group-hover:border-cbm-gray-400" />
      <PieceCaption name={instance.name} detail={[FORMATS[instance.formatId].label, ago].filter(Boolean).join(" · ")} />
    </Link>
  );
}

function DocumentCard({ document, profilesByRevision, ago }: { document: GalleryDocument; profilesByRevision: Record<number, VisualProfile>; ago: string | undefined }) {
  const { style } = document.content;
  const first = contentPages(document.content)[0];
  const tokens = resolveTokens((style.profileRevision && profilesByRevision[style.profileRevision]) || null, style.mode, style.primary ? { primary: style.primary } : {});
  const video = isMotion(document.content) ? document.content : null;
  return (
    <Link href={`/studio/${document.id}`} className="group block space-y-2" data-document={document.id}>
      <div className="relative">
        {first ? (
          <FramedArtboard artboard={first.artboard} tokens={tokens} className="border border-line transition-colors group-hover:border-cbm-gray-400" />
        ) : (
          <div className="aspect-square border border-line bg-surface-2" />
        )}
        {video && (
          <span className="absolute left-2 bottom-2 inline-flex items-center gap-1 bg-base/85 px-1.5 py-0.5 text-[11px] text-cbm-gray-100 tabular-nums">
            <Play size={12} aria-hidden />
            {formatDuration(totalDurationMs(video))}
          </span>
        )}
      </div>
      <PieceCaption name={document.name} detail={[documentKind(document.content), ago].filter(Boolean).join(" · ")} />
    </Link>
  );
}

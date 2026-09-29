export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { FramedArtboard } from "@/components/create/artboard-preview";
import { Fresh } from "@/components/create/fresh";
import { outputFileUrl, outputThumbUrl } from "@/components/create/output-card";
import { RenderFonts } from "@/components/create/render-fonts";
import { STYLE_MODES } from "@/components/create/types";
import { DeleteKitForm, KitRenderForm, KitVideo } from "@/components/kits/kit-forms";
import { Breadcrumb, Panel, SectionTitle } from "@/components/ui/primitives";
import { formatDuration, plural } from "@/components/ui/format";
import type { Output } from "@/src/core/assets/output";
import { CompositionInstanceIdSchema } from "@/src/core/creative/composition";
import { getComposition } from "@/src/core/creative/compositions";
import { FORMATS } from "@/src/core/creative/formats";
import { buildArtboard } from "@/src/core/creative/instance-artboard";
import { resolveTokens, type StyleTokens } from "@/src/core/creative/tokens";
import type { Artboard } from "@/src/core/documents/artboard";
import { contentPages, CreativeDocumentIdSchema, isCarousel, isMotion } from "@/src/core/documents/creative-document";
import { isTerminal } from "@/src/core/jobs/job";
import { MediaKitIdSchema, type KitItem } from "@/src/core/kits/media-kit";
import { totalDurationMs } from "@/src/core/motion/motion";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { requireProjectBySlug } from "@/src/modules/projects/project-service";
import { JobIdSchema } from "@/src/shared/id";

interface Props {
  params: Promise<{ slug: string; kitId: string }>;
}

interface ItemView {
  item: KitItem;
  preview: { artboard: Artboard; tokens: StyleTokens } | null;
  href: string | null;
  detail: string;
  /** Última edição do rascunho — para saber se o render ficou para trás. */
  updatedAt: string | null;
  durationMs: number | null;
}

/** Moldura comum da grade: a proporção mais frequente entre os itens (empate → a mais larga). */
function frameRatio(items: KitItem[]): number {
  const counts = new Map<number, number>();
  for (const i of items) {
    const r = FORMATS[i.formatId].width / FORMATS[i.formatId].height;
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0] ?? [1];
  return Math.min(16 / 9, Math.max(0.8, best));
}

function ItemStatus({ busy, outputs, stale }: { busy: boolean; outputs: Output[]; stale: boolean }) {
  if (busy) return <span className="text-cbm-gray-200">Renderizando…</span>;
  if (outputs.length === 0) return <span className="text-cbm-gray-400">Ainda não renderizado</span>;
  if (stale) return <span className="text-warn">Alterado depois do render · renderize de novo</span>;
  return <span className="text-ok">Renderizado</span>;
}

export default async function KitPage({ params }: Props) {
  const { slug, kitId } = await params;
  const parsed = MediaKitIdSchema.safeParse(kitId);
  if (!parsed.success) notFound();
  const { repos } = await getAtlasRuntime();
  const project = await requireProjectBySlug(repos.projects, slug);
  const kit = await repos.kits.getById(parsed.data);
  if (!kit || kit.projectId !== project.id) notFound();

  const [assets, profiles, outputs] = await Promise.all([repos.assets.listByProject(project.id), repos.visualProfiles.listByProject(project.id), repos.outputs.listByProject(project.id)]);
  const assetMap = new Map(assets.map((a) => [a.id as string, a]));
  const profileOf = (rev: number | null) => (rev ? (profiles.find((p) => p.revision === rev) ?? null) : null);

  // Prévias calculadas no servidor (o mesmo kernel do render; o cliente só desenha).
  const views: ItemView[] = await Promise.all(
    kit.items.map(async (item): Promise<ItemView> => {
      const empty = { item, preview: null, href: null, updatedAt: null, durationMs: null };
      if (item.instanceId) {
        const instance = await repos.compositionInstances.getById(CompositionInstanceIdSchema.parse(item.instanceId));
        const definition = instance ? getComposition(instance.compositionId) : undefined;
        if (!instance || !definition) return { ...empty, detail: "Rascunho excluído" };
        const profile = profileOf(instance.visualProfileRevision);
        return {
          item,
          preview: { artboard: buildArtboard(definition, instance, assetMap, profile), tokens: resolveTokens(profile, instance.styleMode, instance.overrides) },
          href: `/projects/${project.slug}/create/${instance.id}`,
          detail: `${definition.name} · ${FORMATS[instance.formatId].label}`,
          updatedAt: instance.updatedAt,
          durationMs: null,
        };
      }
      if (item.documentId) {
        const document = await repos.documents.getById(CreativeDocumentIdSchema.parse(item.documentId));
        const head = document ? await repos.documents.getRevision(document.id, document.headRevision) : null;
        if (!document || !head) return { ...empty, detail: "Documento excluído" };
        const style = head.content.style;
        const pages = contentPages(head.content);
        const durationMs = isMotion(head.content) ? totalDurationMs(head.content) : null;
        const detail = isMotion(head.content)
          ? `Vídeo · ${plural(head.content.scenes.length, "cena", "cenas")} · ${formatDuration(durationMs ?? 0)}`
          : isCarousel(head.content)
            ? `Carrossel · ${plural(pages.length, "página", "páginas")}`
            : FORMATS[item.formatId].label;
        return {
          item,
          preview: pages[0] ? { artboard: pages[0].artboard, tokens: resolveTokens(profileOf(style.profileRevision), style.mode, style.primary ? { primary: style.primary } : {}) } : null,
          href: `/studio/${document.id}`,
          detail,
          updatedAt: document.updatedAt,
          durationMs,
        };
      }
      return { ...empty, detail: "Não gerado" };
    })
  );

  const lastJob = kit.lastRenderJobId ? await repos.jobs.getById(JobIdSchema.parse(kit.lastRenderJobId)) : null;
  const busyJobId = lastJob && !isTerminal(lastJob.status) ? lastJob.id : null;
  const kitOutputs = outputs.filter((o) => o.metadata.mediaKitId === kit.id && o.jobId === kit.lastRenderJobId);
  const hasVideo = kit.items.some((i) => i.kind === "video" && i.documentId);
  const ratio = frameRatio(kit.items);
  const base = `/projects/${project.slug}`;
  const style = STYLE_MODES.find((m) => m.id === kit.direction.styleMode)?.label;

  return (
    <div className="space-y-8">
      <RenderFonts />
      <Breadcrumb items={[{ label: project.name, href: base }, { label: "Media Kits", href: `${base}/kits` }, { label: kit.name }]} />

      <header className="space-y-3">
        <h2 className="text-[20px] font-semibold leading-snug text-cbm-white">{kit.name}</h2>
        <dl className="flex flex-wrap gap-x-10 gap-y-3 text-[13px]" aria-label="Direção criativa do kit">
          <div className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-[0.22em] text-cbm-gray-400">Tom</dt>
            <dd className="text-cbm-gray-200 mt-0.5">{kit.direction.tone}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-[0.22em] text-cbm-gray-400">Ênfase</dt>
            <dd className="text-cbm-gray-200 mt-0.5">{kit.direction.emphasis}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-[0.22em] text-cbm-gray-400">Estilo</dt>
            <dd className="text-cbm-gray-200 mt-0.5 flex items-center gap-2">
              {style}
              {kit.direction.accent && <span className="inline-block w-3 h-3 border border-line" style={{ background: kit.direction.accent }} title={kit.direction.accent} />}
            </dd>
          </div>
        </dl>
      </header>

      <Panel className="p-4">
        <KitRenderForm kitId={kit.id} hasVideo={hasVideo} busyJobId={busyJobId} zip={kitOutputs.length > 0 ? { href: `/api/atlas/kits/${kit.id}/zip`, files: kitOutputs.length } : null} />
      </Panel>

      <section aria-labelledby="itens">
        <SectionTitle id="itens">Peças ({kit.items.length})</SectionTitle>
        <ul className={`grid gap-x-5 gap-y-8 ${ratio > 1.2 ? "sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-2 lg:grid-cols-5"}`}>
          {views.map(({ item, preview, href, detail, updatedAt, durationMs }) => {
            const mine = kitOutputs.filter((o) => o.metadata.kitItemId === item.id).sort((a, b) => (a.metadata.page ?? 0) - (b.metadata.page ?? 0) || a.format.localeCompare(b.format));
            const video = item.kind === "video" ? mine.find((o) => o.mimeType.startsWith("video/")) : undefined;
            const newest = mine.reduce<string | null>((max, o) => (!max || o.createdAt > max ? o.createdAt : max), null);
            const stale = !!newest && !!updatedAt && updatedAt > newest;
            return (
              <li key={item.id} className="flex min-w-0 flex-col" data-kit-item={item.presetItemId}>
                <Fresh stamp={mine[0]?.id ?? null}>
                  {video ? (
                    <div className="border border-line">
                      <KitVideo src={outputFileUrl(video.id)} poster={outputThumbUrl(video.id, 640)} durationMs={video.durationMs ?? durationMs} label={item.label} ratio={ratio} />
                    </div>
                  ) : preview && href ? (
                    <Link href={href} tabIndex={-1} aria-hidden className="group relative block">
                      <FramedArtboard artboard={preview.artboard} tokens={preview.tokens} ratio={ratio} className="border border-line transition-colors group-hover:border-cbm-gray-400" />
                    </Link>
                  ) : preview ? (
                    <FramedArtboard artboard={preview.artboard} tokens={preview.tokens} ratio={ratio} className="border border-line" />
                  ) : (
                    <div className="grid place-items-center border border-dashed border-line p-4 text-center text-[12px] text-cbm-gray-400" style={{ aspectRatio: ratio }}>
                      {item.note ?? "Não gerado"}
                    </div>
                  )}
                </Fresh>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] text-cbm-white truncate" title={item.label}>
                      {item.label}
                    </p>
                    <p className="text-[12px] text-cbm-gray-400 truncate" title={detail}>
                      {detail}
                    </p>
                  </div>
                  {href && (
                    <Link href={href} className="inline-flex h-10 sm:h-auto items-start text-[12px] text-accent hover:text-accent-bright shrink-0" aria-label={`Editar ${item.label}`}>
                      Editar
                    </Link>
                  )}
                </div>
                <div className="mt-2 flex min-h-8 items-center justify-between gap-3 border-t border-line pt-2 text-[12px]">
                  <ItemStatus busy={!!busyJobId} outputs={mine} stale={stale} />
                  {!busyJobId && mine.length === 1 && (
                    <a
                      href={outputFileUrl(mine[0].id, true)}
                      className="inline-flex h-10 sm:h-8 items-center gap-1.5 text-accent hover:text-accent-bright shrink-0"
                      aria-label={`Baixar ${item.label}`}
                    >
                      <Download size={14} aria-hidden />
                      {mine[0].format.toUpperCase()}
                    </a>
                  )}
                  {!busyJobId && mine.length > 1 && <span className="text-cbm-gray-400 shrink-0">{plural(mine.length, "arquivo", "arquivos")} no ZIP</span>}
                </div>
                {item.note && preview && <p className="mt-1.5 text-[12px] text-cbm-gray-400 leading-snug">{item.note}</p>}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-[12px] text-cbm-gray-400">Excluir o kit mantém os rascunhos e os arquivos renderizados.</p>
        <DeleteKitForm kitId={kit.id} />
      </div>
    </div>
  );
}

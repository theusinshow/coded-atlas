export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteKitAction } from "@/app/actions/kits";
import { ArtboardPreview } from "@/components/create/artboard-preview";
import { OutputCard } from "@/components/create/output-card";
import { RenderFonts } from "@/components/create/render-fonts";
import { STYLE_MODES } from "@/components/create/types";
import { KitRenderForm } from "@/components/kits/kit-forms";
import { Button, Panel, SectionTitle } from "@/components/ui/primitives";
import { CompositionInstanceIdSchema } from "@/src/core/creative/composition";
import { getComposition } from "@/src/core/creative/compositions";
import { FORMATS } from "@/src/core/creative/formats";
import { buildArtboard } from "@/src/core/creative/instance-artboard";
import { resolveTokens, type StyleTokens } from "@/src/core/creative/tokens";
import type { Artboard } from "@/src/core/documents/artboard";
import { contentPages, CreativeDocumentIdSchema, isMotion } from "@/src/core/documents/creative-document";
import { isTerminal } from "@/src/core/jobs/job";
import { getKitPreset, MediaKitIdSchema, type KitItem } from "@/src/core/kits/media-kit";
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
  meta: string;
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

  // Previews calculados no servidor (mesmo kernel no cliente só desenha).
  const views: ItemView[] = await Promise.all(
    kit.items.map(async (item): Promise<ItemView> => {
      if (item.instanceId) {
        const instance = await repos.compositionInstances.getById(CompositionInstanceIdSchema.parse(item.instanceId));
        const definition = instance ? getComposition(instance.compositionId) : undefined;
        if (!instance || !definition) return { item, preview: null, href: null, meta: "rascunho removido" };
        const profile = profileOf(instance.visualProfileRevision);
        return {
          item,
          preview: { artboard: buildArtboard(definition, instance, assetMap, profile), tokens: resolveTokens(profile, instance.styleMode, instance.overrides) },
          href: `/projects/${project.slug}/create/${instance.id}`,
          meta: `${definition.name} · ${FORMATS[instance.formatId].label}`,
        };
      }
      if (item.documentId) {
        const document = await repos.documents.getById(CreativeDocumentIdSchema.parse(item.documentId));
        const head = document ? await repos.documents.getRevision(document.id, document.headRevision) : null;
        if (!document || !head) return { item, preview: null, href: null, meta: "documento removido" };
        const style = head.content.style;
        const pages = contentPages(head.content);
        const meta = isMotion(head.content) ? `vídeo · ${head.content.scenes.length} cenas · ${(totalDurationMs(head.content) / 1000).toFixed(1)} s` : `${pages.length} página(s) · rev ${document.headRevision}`;
        return {
          item,
          preview: { artboard: pages[0].artboard, tokens: resolveTokens(profileOf(style.profileRevision), style.mode, style.primary ? { primary: style.primary } : {}) },
          href: `/studio/${document.id}`,
          meta,
        };
      }
      return { item, preview: null, href: null, meta: "não gerado" };
    })
  );

  const lastJob = kit.lastRenderJobId ? await repos.jobs.getById(JobIdSchema.parse(kit.lastRenderJobId)) : null;
  const busyJobId = lastJob && !isTerminal(lastJob.status) ? lastJob.id : null;
  const kitOutputs = outputs.filter((o) => o.metadata.mediaKitId === kit.id && o.jobId === kit.lastRenderJobId);
  const hasVideo = kit.items.some((i) => i.kind === "video" && i.documentId);

  return (
    <div className="space-y-10">
      <RenderFonts />
      <Link href={`/projects/${project.slug}/kits`} className="text-[12px] text-cbm-gray-400 hover:text-cbm-gray-200">
        ← Kits
      </Link>

      <section className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-accent">{getKitPreset(kit.presetId)?.name ?? "Media Kit"}</p>
          <h2 className="text-xl text-cbm-white">{kit.name}</h2>
          <Panel className="p-4 grid sm:grid-cols-3 gap-3 text-[12px]" aria-label="Direção criativa do kit">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-cbm-gray-400">Tom</p>
              <p className="text-cbm-gray-200">{kit.direction.tone}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-cbm-gray-400">Ênfase</p>
              <p className="text-cbm-gray-200">{kit.direction.emphasis}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-cbm-gray-400">Estilo</p>
              <p className="text-cbm-gray-200 flex items-center gap-2">
                {STYLE_MODES.find((m) => m.id === kit.direction.styleMode)?.label}
                {kit.direction.accent && <span className="inline-block w-3 h-3 border border-line" style={{ background: kit.direction.accent }} title={kit.direction.accent} />}
              </p>
            </div>
          </Panel>
          <p className="text-[11px] text-cbm-gray-400">Todos os itens usam esta direção. Edite qualquer item antes de renderizar — o render usa a versão atual de cada um.</p>
        </div>
        <Panel className="p-4 space-y-4 self-start">
          <KitRenderForm kitId={kit.id} hasVideo={hasVideo} busyJobId={busyJobId} />
          {kitOutputs.length > 0 && (
            <a href={`/api/atlas/kits/${kit.id}/zip`} className="block text-center h-9 leading-9 border border-accent text-[12px] text-accent hover:bg-accent/10">
              Baixar kit (.zip) · {kitOutputs.length} arquivos
            </a>
          )}
          <form action={deleteKitAction} className="border-t border-line pt-3">
            <input type="hidden" name="kitId" value={kit.id} />
            <Button variant="ghost" size="sm" type="submit">
              Excluir kit (mantém rascunhos e peças)
            </Button>
          </form>
        </Panel>
      </section>

      <section aria-labelledby="itens">
        <SectionTitle id="itens">Itens ({kit.items.length})</SectionTitle>
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 items-start">
          {views.map(({ item, preview, href, meta }, index) => (
            <li key={item.id} className="space-y-2" data-kit-item={item.presetItemId}>
              {preview ? (
                <div className="relative">
                  <ArtboardPreview artboard={preview.artboard} tokens={preview.tokens} className="border border-line" />
                  {item.kind !== "composition" && (
                    <span className="absolute right-1.5 top-1.5 bg-base/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.22em] text-cbm-gray-200">{item.kind === "video" ? "▶ vídeo" : "carrossel"}</span>
                  )}
                </div>
              ) : (
                <div className="aspect-[4/5] grid place-items-center border border-dashed border-line text-[11px] text-cbm-gray-400 p-4 text-center">{item.note ?? "Não gerado"}</div>
              )}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] text-cbm-gray-100">
                    {index + 1}. {item.label}
                  </p>
                  <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-accent">{meta}</p>
                </div>
                {href && (
                  <Link href={href} className="text-[11px] font-medium uppercase tracking-[0.22em] text-cbm-gray-400 hover:text-accent shrink-0">
                    Editar
                  </Link>
                )}
              </div>
              {item.note && preview && <p className="text-[11px] text-cbm-gray-400">{item.note}</p>}
            </li>
          ))}
        </ul>
      </section>

      {kitOutputs.length > 0 && (
        <section aria-labelledby="entregas">
          <SectionTitle id="entregas">Último render ({kitOutputs.length})</SectionTitle>
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 items-start">
            {kitOutputs
              .sort((a, b) => kit.items.findIndex((i) => i.id === a.metadata.kitItemId) - kit.items.findIndex((i) => i.id === b.metadata.kitItemId) || (a.metadata.page ?? 0) - (b.metadata.page ?? 0))
              .map((o) => (
                <li key={o.id}>
                  <OutputCard output={o} compact />
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}

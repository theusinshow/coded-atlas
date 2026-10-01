import { plural, formatDuration } from "@/components/ui/format";
import type { Asset } from "@/src/core/assets/asset";
import { CompositionInstanceIdSchema } from "@/src/core/creative/composition";
import { getComposition } from "@/src/core/creative/compositions";
import { FORMATS } from "@/src/core/creative/formats";
import { buildArtboard } from "@/src/core/creative/instance-artboard";
import { resolveTokens, type StyleTokens } from "@/src/core/creative/tokens";
import type { VisualProfile } from "@/src/core/creative/visual-profile";
import type { Artboard } from "@/src/core/documents/artboard";
import { contentPages, CreativeDocumentIdSchema, isCarousel, isMotion } from "@/src/core/documents/creative-document";
import type { KitItem, MediaKit } from "@/src/core/kits/media-kit";
import { totalDurationMs } from "@/src/core/motion/motion";
import type { Repositories } from "@/src/infrastructure/db/repositories";

/** Uma peça do kit pronta para desenhar: prévia (mesmo kernel do render), link de edição e resumo. */
export interface ItemView {
  item: KitItem;
  preview: { artboard: Artboard; tokens: StyleTokens } | null;
  href: string | null;
  detail: string;
  /** Última edição do rascunho — para saber se o render ficou para trás. */
  updatedAt: string | null;
  durationMs: number | null;
}

/** Moldura comum da grade: a proporção mais frequente entre os itens (empate → a mais larga). */
export function frameRatio(items: KitItem[]): number {
  const counts = new Map<number, number>();
  for (const i of items) {
    const r = FORMATS[i.formatId].width / FORMATS[i.formatId].height;
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0] ?? [1];
  return Math.min(16 / 9, Math.max(0.8, best));
}

/** Prévias calculadas no servidor (o cliente só desenha). */
export async function buildItemViews(repos: Repositories, projectSlug: string, kit: MediaKit, assets: Asset[], profiles: VisualProfile[]): Promise<ItemView[]> {
  const assetMap = new Map(assets.map((a) => [a.id as string, a]));
  const profileOf = (rev: number | null) => (rev ? (profiles.find((p) => p.revision === rev) ?? null) : null);
  return Promise.all(
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
          href: `/projects/${projectSlug}/create/${instance.id}`,
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
}

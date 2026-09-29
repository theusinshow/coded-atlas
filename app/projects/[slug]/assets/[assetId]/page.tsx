export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { AssetActions } from "@/components/atlas/asset-actions";
import { AssetThumb, assetFileUrl, assetThumbUrl } from "@/components/atlas/asset-image";
import { mediaTitle } from "@/components/media/labels";
import { ASSET_KIND_LABEL, ASSET_ROLE_LABEL, DEVICE_LABEL, formatBytes } from "@/components/ui/format";
import { Breadcrumb, Panel, SectionTitle } from "@/components/ui/primitives";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { requireProjectBySlug } from "@/src/modules/projects/project-service";
import { AssetIdSchema } from "@/src/shared/id";

interface Props {
  params: Promise<{ slug: string; assetId: string }>;
}

const ORIGIN_LABEL: Record<string, string> = {
  capture: "Captura do site",
  upload: "Enviado por você",
  legacy: "Importado da biblioteca antiga",
  derived: "Gerado a partir de outro arquivo",
};

/** "image/svg+xml" → "SVG"; "video/webm" → "WebM". */
function formatLabel(mime: string): string {
  const sub = mime.split("/")[1] ?? mime;
  const known: Record<string, string> = { "svg+xml": "SVG", jpeg: "JPG", webm: "WebM", webp: "WebP", mpeg: "MP3", avif: "AVIF" };
  return known[sub] ?? sub.toUpperCase();
}

/** Inspeção de um arquivo: prévia, dados, origem e linhagem (de onde veio, o que derivou dele). */
export default async function AssetDetailPage({ params }: Props) {
  const { slug, assetId } = await params;
  const id = AssetIdSchema.safeParse(assetId);
  if (!id.success) notFound();
  const { repos } = await getAtlasRuntime();
  const project = await requireProjectBySlug(repos.projects, slug);
  const asset = await repos.assets.getById(id.data);
  if (!asset || asset.projectId !== project.id) notFound();

  const all = await repos.assets.listByProject(project.id);
  const parent = asset.parentAssetId ? all.find((a) => a.id === asset.parentAssetId) : undefined;
  const children = all.filter((a) => a.parentAssetId === asset.id);
  const capture = asset.captureId ? await repos.captures.getById(asset.captureId) : null;
  const isImage = asset.mimeType.startsWith("image/");
  const isVideo = asset.mimeType.startsWith("video/");
  const title = mediaTitle(asset);
  const m = asset.metadata;
  const role = m.role ? ASSET_ROLE_LABEL[m.role] : undefined;

  const rows: [string, string][] = [
    ["Tipo", ASSET_KIND_LABEL[asset.kind] ?? asset.kind],
    ["Formato", formatLabel(asset.mimeType)],
    ...(asset.width && asset.height ? ([["Dimensões", `${asset.width} × ${asset.height} px`]] as [string, string][]) : []),
    ["Tamanho", formatBytes(asset.byteSize)],
    ...(m.device ? ([["Dispositivo", DEVICE_LABEL[m.device] ?? m.device]] as [string, string][]) : []),
    ...(role ? ([["Papel", role]] as [string, string][]) : []),
    ...(m.sectionName ? ([["Seção", m.sectionName]] as [string, string][]) : []),
    ...(m.pagePath ? ([["Página", m.pagePath]] as [string, string][]) : []),
    ...(m.stateName ? ([["Estado", m.stateName]] as [string, string][]) : []),
    ["Origem", ORIGIN_LABEL[m.origin ?? "capture"] ?? ORIGIN_LABEL.capture],
    [m.origin === "upload" ? "Enviado em" : "Capturado em", new Date(capture?.createdAt ?? asset.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })],
  ];

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Material", href: `/projects/${project.slug}/assets` }, { label: title }]} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 max-h-[75vh] overflow-auto border border-line bg-surface-2">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- bytes originais servidos pelo AssetStorage
            <img src={assetFileUrl(asset.id)} alt={title} className="block h-auto w-full" />
          ) : isVideo ? (
            <video src={assetFileUrl(asset.id)} poster={assetThumbUrl(asset.id, 1280)} controls preload="metadata" className="block h-auto w-full" />
          ) : (
            <audio src={assetFileUrl(asset.id)} controls className="m-6 w-[calc(100%-3rem)]" />
          )}
        </div>
        <aside className="min-w-0 space-y-6">
          <div>
            <h2 className="break-words text-lg font-semibold text-cbm-white">{title}</h2>
            {project.coverAssetId === asset.id && <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.22em] text-cbm-gray-200">Capa do projeto</p>}
          </div>
          <AssetActions
            projectId={project.id}
            assetId={asset.id}
            canSetCover={isImage && project.coverAssetId !== asset.id}
            canDelete={m.origin === "upload"}
            downloadUrl={assetFileUrl(asset.id)}
          />
          <Panel>
            <dl className="divide-y divide-line">
              {rows.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 px-3 py-2">
                  <dt className="text-[12px] text-cbm-gray-400">{k}</dt>
                  <dd className="break-words text-[13px] text-cbm-gray-200">{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          {(parent || children.length > 0) && (
            <section aria-labelledby="linhagem">
              <SectionTitle id="linhagem">Linhagem</SectionTitle>
              <ul className="space-y-2">
                {parent && <LineageItem slug={project.slug} id={parent.id} label={`Derivado de: ${mediaTitle(parent)}`} image={parent.mimeType.startsWith("image/")} />}
                {children.map((c) => (
                  <LineageItem key={c.id} slug={project.slug} id={c.id} label={`Gerou: ${mediaTitle(c)}`} image={c.mimeType.startsWith("image/")} />
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function LineageItem({ slug, id, label, image }: { slug: string; id: string; label: string; image: boolean }) {
  return (
    <li>
      <Link href={`/projects/${slug}/assets/${id}`} className="flex min-h-12 items-center gap-3 border border-line p-2 transition-colors hover:border-cbm-gray-400">
        <span className="aspect-[16/10] w-16 shrink-0 overflow-hidden">
          <AssetThumb id={image ? id : null} alt="" width={320} className="h-full w-full" />
        </span>
        <span className="min-w-0 break-words text-[13px] text-cbm-gray-200">{label}</span>
      </Link>
    </li>
  );
}

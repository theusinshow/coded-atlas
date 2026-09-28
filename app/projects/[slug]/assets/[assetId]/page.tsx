export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { AssetActions } from "@/components/atlas/asset-actions";
import { AssetThumb, assetFileUrl } from "@/components/atlas/asset-image";
import { Panel, SectionTitle } from "@/components/ui/primitives";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { requireProjectBySlug } from "@/src/modules/projects/project-service";
import { AssetIdSchema } from "@/src/shared/id";

interface Props {
  params: Promise<{ slug: string; assetId: string }>;
}

function bytes(n: number): string {
  return n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Inspeção de um asset: prévia, metadados, origem e linhagem (de onde veio, o que derivou dele). */
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

  const rows: [string, string][] = [
    ["Tipo", asset.kind],
    ["Formato", asset.mimeType],
    ["Dimensões", asset.width && asset.height ? `${asset.width} × ${asset.height} px` : "—"],
    ["Tamanho", bytes(asset.byteSize)],
    ["Device", asset.metadata.device ?? "—"],
    ["Papel", asset.metadata.role ?? "—"],
    ...(asset.metadata.sectionName ? ([["Seção", asset.metadata.sectionName]] as [string, string][]) : []),
    ...(asset.metadata.pagePath ? ([["Página", asset.metadata.pagePath]] as [string, string][]) : []),
    ...(asset.metadata.stateName ? ([["Estado", asset.metadata.stateName]] as [string, string][]) : []),
    ["Origem", asset.metadata.origin === "legacy" ? "importado do v1" : asset.metadata.origin === "upload" ? "enviado manualmente" : asset.metadata.origin === "derived" ? "derivado" : "captura"],
    ["Capturado em", capture ? new Date(capture.createdAt).toLocaleString("pt-BR") : new Date(asset.createdAt).toLocaleString("pt-BR")],
    ["SHA-256", asset.sha256],
  ];

  return (
    <div className="space-y-8">
      <Link href={`/projects/${project.slug}/assets`} className="text-[12px] text-zinc-500 hover:text-zinc-200">
        ← Assets
      </Link>
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="border border-line bg-surface-2 overflow-auto max-h-[75vh]">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- bytes originais servidos pelo AssetStorage
            <img src={assetFileUrl(asset.id)} alt={asset.label ?? asset.kind} className="w-full h-auto block" />
          ) : (
            <video src={assetFileUrl(asset.id)} controls className="w-full h-auto block" />
          )}
        </div>
        <aside className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">{asset.label ?? asset.kind}</h2>
            {project.coverAssetId === asset.id && <p className="text-[11px] font-mono uppercase tracking-wider text-accent mt-1">Capa do projeto</p>}
          </div>
          <AssetActions
            projectId={project.id}
            assetId={asset.id}
            canSetCover={isImage && project.coverAssetId !== asset.id}
            canDelete={asset.metadata.origin === "upload"}
            downloadUrl={assetFileUrl(asset.id)}
          />
          <Panel>
            <dl className="divide-y divide-line">
              {rows.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[7rem_1fr] gap-2 px-3 py-2">
                  <dt className="text-[11px] text-zinc-500">{k}</dt>
                  <dd className="text-[12px] text-zinc-200 break-all">{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          {(parent || children.length > 0) && (
            <section aria-labelledby="linhagem">
              <SectionTitle id="linhagem">Linhagem</SectionTitle>
              <ul className="space-y-2">
                {parent && <LineageItem slug={project.slug} id={parent.id} label={`Derivado de: ${parent.label ?? parent.kind}`} image={parent.mimeType.startsWith("image/")} />}
                {children.map((c) => (
                  <LineageItem key={c.id} slug={project.slug} id={c.id} label={`Gerou: ${c.label ?? c.kind}`} image={c.mimeType.startsWith("image/")} />
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
      <Link href={`/projects/${slug}/assets/${id}`} className="flex items-center gap-3 border border-line p-2 hover:border-zinc-600">
        <span className="w-16 aspect-[16/10] overflow-hidden shrink-0">
          <AssetThumb id={image ? id : null} alt={label} width={320} className="w-full h-full" />
        </span>
        <span className="text-[12px] text-zinc-300">{label}</span>
      </Link>
    </li>
  );
}

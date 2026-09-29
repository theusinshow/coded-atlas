export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { AssetThumb, assetFileUrl } from "@/components/atlas/asset-image";
import { UploadForm } from "@/components/atlas/upload-form";
import { EmptyState, SectionTitle } from "@/components/ui/primitives";
import { AssetKindSchema, type AssetKind } from "@/src/core/assets/asset";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { requireProjectBySlug } from "@/src/modules/projects/project-service";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ kind?: string }>;
}

const KIND_LABEL: Partial<Record<AssetKind, string>> = {
  screenshot: "Screenshots",
  section: "Seções",
  image: "Imagens",
  video: "Vídeos",
  logo: "Logos",
  icon: "Ícones",
  background: "Fundos",
  illustration: "Ilustrações",
};

export default async function ProjectAssetsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { kind } = await searchParams;
  const selected = AssetKindSchema.safeParse(kind).success ? (kind as AssetKind) : undefined;
  const { repos } = await getAtlasRuntime();
  const project = await requireProjectBySlug(repos.projects, slug);
  const [counts, assets] = await Promise.all([
    repos.assets.countByProject(project.id),
    repos.assets.listByProject(project.id, selected ? { kinds: [selected] } : {}),
  ]);
  const base = `/projects/${project.slug}/assets`;
  const total = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);

  return (
    <div className="space-y-8">
      <nav aria-label="Filtrar por tipo" className="flex flex-wrap gap-2">
        <FilterLink href={base} active={!selected} label={`Todos · ${total}`} />
        {(Object.entries(counts) as [AssetKind, number][]).map(([k, n]) => (
          <FilterLink key={k} href={`${base}?kind=${k}`} active={selected === k} label={`${KIND_LABEL[k] ?? k} · ${n}`} />
        ))}
      </nav>

      <section aria-labelledby="enviar">
        <SectionTitle id="enviar">Enviar arquivos</SectionTitle>
        <UploadForm projectId={project.id} />
      </section>

      <section aria-labelledby="grade">
        <SectionTitle id="grade">{selected ? KIND_LABEL[selected] ?? selected : "Todos os assets"}</SectionTitle>
        {assets.length === 0 ? (
          <EmptyState title="Nenhum asset aqui">Capture o site ou envie arquivos.</EmptyState>
        ) : (
          <ul className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {[...assets].reverse().map((a) => (
              <li key={a.id} className="border border-line bg-surface">
                <Link href={`/projects/${project.slug}/assets/${a.id}`} className="block aspect-[16/10] overflow-hidden border-b border-line">
                  {a.mimeType.startsWith("video/") ? (
                    <video src={assetFileUrl(a.id)} muted preload="metadata" className="w-full h-full object-cover" />
                  ) : (
                    <AssetThumb id={a.id} alt={a.label ?? a.kind} width={640} className="w-full h-full" />
                  )}
                </Link>
                <div className="px-3 py-2">
                  <p className="text-[12px] text-cbm-gray-200 truncate">{a.label ?? a.metadata.sectionName ?? a.kind}</p>
                  <p className="text-[10px] font-mono text-cbm-gray-400 truncate">
                    {[a.kind, a.metadata.device, a.width && a.height ? `${a.width}×${a.height}` : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FilterLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`px-2.5 py-1 text-[12px] border ${active ? "border-accent text-cbm-white" : "border-line text-cbm-gray-400 hover:text-cbm-gray-100"}`}
    >
      {label}
    </Link>
  );
}

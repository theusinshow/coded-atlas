export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { UploadForm } from "@/components/atlas/upload-form";
import { AssetCard } from "@/components/media/asset-card";
import { Pagination } from "@/components/media/pagination";
import { EmptyState, LinkButton } from "@/components/ui/primitives";
import { AssetKindSchema, type AssetKind } from "@/src/core/assets/asset";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { requireProjectBySlug } from "@/src/modules/projects/project-service";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ kind?: string; page?: string }>;
}

const PAGE_SIZE = 48;

const KIND_LABEL: Record<AssetKind, string> = {
  screenshot: "Capturas",
  section: "Seções",
  image: "Imagens",
  video: "Vídeos",
  audio: "Áudios",
  logo: "Logos",
  icon: "Ícones",
  background: "Fundos",
  illustration: "Ilustrações",
  font: "Fontes",
  document: "Documentos",
  "motion-clip": "Clipes",
};

/** Material do projeto: grade paginada (mais recentes primeiro), filtro por tipo e envio atrás de um botão. */
export default async function ProjectAssetsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = await searchParams;
  const selected = AssetKindSchema.safeParse(query.kind).success ? (query.kind as AssetKind) : undefined;
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const { repos } = await getAtlasRuntime();
  const project = await requireProjectBySlug(repos.projects, slug);
  const [counts, { items, total }] = await Promise.all([
    repos.assets.countByProject(project.id),
    repos.assets.search({ projectId: project.id, kinds: selected ? [selected] : undefined, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
  ]);
  const base = `/projects/${project.slug}/assets`;
  const all = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (n: number) => {
    const q = new URLSearchParams();
    if (selected) q.set("kind", selected);
    if (n > 1) q.set("page", String(n));
    return q.size ? `${base}?${q}` : base;
  };

  return (
    <div className="space-y-5">
      <UploadForm projectId={project.id}>
        {all > 0 && (
          <nav aria-label="Filtrar por tipo" className="flex flex-wrap gap-1.5">
            <FilterLink href={base} active={!selected} label="Todos" count={all} />
            {(Object.entries(counts) as [AssetKind, number][]).map(([k, n]) => (
              <FilterLink key={k} href={`${base}?kind=${k}`} active={selected === k} label={KIND_LABEL[k] ?? k} count={n} />
            ))}
          </nav>
        )}
      </UploadForm>

      <section aria-labelledby="grade" className="space-y-5">
        <h2 id="grade" className="sr-only">
          {selected ? KIND_LABEL[selected] : "Todos os arquivos"}
        </h2>
        {items.length === 0 ? (
          <EmptyState
            title={selected ? "Nenhum arquivo deste tipo" : "Nenhum arquivo ainda"}
            action={
              <LinkButton href={`/projects/${project.slug}/capture`} size="sm">
                Capturar o site
              </LinkButton>
            }
          />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((a) => (
              <li key={a.id}>
                <AssetCard asset={a} href={`/projects/${project.slug}/assets/${a.id}`} />
              </li>
            ))}
          </ul>
        )}
        <Pagination page={page} pages={pages} href={href} />
      </section>
    </div>
  );
}

function FilterLink({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex h-10 items-center gap-1.5 border px-3 text-[12px] transition-colors sm:h-8 ${
        active ? "border-cbm-white text-cbm-white" : "border-line text-cbm-gray-400 hover:border-cbm-gray-400 hover:text-cbm-gray-100"
      }`}
    >
      {label}
      <span className={`tabular-nums ${active ? "text-cbm-gray-200" : "text-cbm-gray-400"}`}>{count}</span>
    </Link>
  );
}

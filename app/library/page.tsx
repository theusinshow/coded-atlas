export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Metadata } from "next";
import { AssetThumb, assetFileUrl } from "@/components/atlas/asset-image";
import { EmptyState, INPUT_CLASS, PageHeader } from "@/components/ui/primitives";
import { AssetKindSchema, type AssetKind } from "@/src/core/assets/asset";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";

export const metadata: Metadata = { title: "Biblioteca — Coded Atlas" };

const PAGE_SIZE = 48;
const KIND_OPTIONS: { value: AssetKind; label: string }[] = [
  { value: "screenshot", label: "Screenshots" },
  { value: "section", label: "Seções" },
  { value: "video", label: "Vídeos" },
  { value: "image", label: "Imagens" },
  { value: "logo", label: "Logos" },
  { value: "icon", label: "Ícones" },
  { value: "background", label: "Fundos" },
  { value: "illustration", label: "Ilustrações" },
];

interface Props {
  searchParams: Promise<{ q?: string; kind?: string; device?: string; project?: string; page?: string }>;
}

/** Biblioteca global de assets (docs/UX-ARCHITECTURE.md → Library): todo o material de todos os projetos. */
export default async function LibraryPage({ searchParams }: Props) {
  const params = await searchParams;
  const kind = AssetKindSchema.safeParse(params.kind).success ? (params.kind as AssetKind) : undefined;
  const device = params.device === "desktop" || params.device === "mobile" ? params.device : undefined;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const { repos } = await getAtlasRuntime();
  const projects = await repos.projects.list({ includeArchived: true });
  const project = projects.find((p) => p.slug === params.project);
  const { items, total } = await repos.assets.search({
    text: params.q?.slice(0, 100),
    kinds: kind ? [kind] : undefined,
    device,
    projectId: project?.id,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const byId = new Map(projects.map((p) => [p.id, p]));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (n: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: params.q, kind, device, project: project?.slug })) if (v) q.set(k, v);
    if (n > 1) q.set("page", String(n));
    return `/library${q.size ? `?${q}` : ""}`;
  };

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 space-y-8">
      <PageHeader eyebrow="Biblioteca" title="Biblioteca de assets" description={`${total} asset${total === 1 ? "" : "s"} em ${projects.length} projeto${projects.length === 1 ? "" : "s"}.`} />

      <form className="grid gap-3 sm:grid-cols-[1fr_11rem_9rem_12rem_auto] items-end" role="search">
        <input name="q" defaultValue={params.q} placeholder="Buscar por nome ou seção (ex.: hero, contato)…" aria-label="Buscar assets" className={INPUT_CLASS} />
        <select name="kind" defaultValue={kind ?? ""} aria-label="Tipo" className={INPUT_CLASS}>
          <option value="">Todos os tipos</option>
          {KIND_OPTIONS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <select name="device" defaultValue={device ?? ""} aria-label="Device" className={INPUT_CLASS}>
          <option value="">Qualquer device</option>
          <option value="desktop">Desktop</option>
          <option value="mobile">Mobile</option>
        </select>
        <select name="project" defaultValue={project?.slug ?? ""} aria-label="Projeto" className={INPUT_CLASS}>
          <option value="">Todos os projetos</option>
          {projects.map((p) => (
            <option key={p.id} value={p.slug}>
              {p.name}
            </option>
          ))}
        </select>
        <button type="submit" className="h-[42px] px-4 border border-line text-sm text-cbm-gray-200 hover:bg-surface">
          Filtrar
        </button>
      </form>

      {items.length === 0 ? (
        <EmptyState title="Nada encontrado">Ajuste os filtros ou capture um projeto.</EmptyState>
      ) : (
        <ul className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((a) => {
            const owner = byId.get(a.projectId);
            return (
              <li key={a.id} className="border border-line bg-surface">
                <Link href={`/projects/${owner?.slug}/assets/${a.id}`} className="block aspect-[16/10] overflow-hidden border-b border-line">
                  {a.mimeType.startsWith("video/") ? (
                    <video src={assetFileUrl(a.id)} muted preload="metadata" className="w-full h-full object-cover" />
                  ) : (
                    <AssetThumb id={a.id} alt={a.label ?? a.kind} width={640} className="w-full h-full" />
                  )}
                </Link>
                <div className="px-3 py-2">
                  <p className="text-[12px] text-cbm-gray-200 truncate">{a.label ?? a.metadata.sectionName ?? a.kind}</p>
                  <p className="text-[10px] font-mono text-cbm-gray-400 truncate">
                    {[owner?.name, a.kind, a.metadata.device].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Paginação" className="flex items-center justify-between text-[13px]">
          {page > 1 ? <Link href={link(page - 1)} className="text-accent">← Anteriores</Link> : <span />}
          <span className="text-cbm-gray-400">
            Página {page} de {pages}
          </span>
          {page < pages ? <Link href={link(page + 1)} className="text-accent">Próximos →</Link> : <span />}
        </nav>
      )}
    </main>
  );
}

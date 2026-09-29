export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { AssetCard } from "@/components/media/asset-card";
import { FilterBar } from "@/components/media/filter-bar";
import { Pagination } from "@/components/media/pagination";
import { plural } from "@/components/ui/format";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui/primitives";
import { AssetKindSchema, type AssetKind } from "@/src/core/assets/asset";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";

export const metadata: Metadata = { title: "Biblioteca — Coded Atlas" };

const PAGE_SIZE = 48;
const KIND_OPTIONS: { value: AssetKind; label: string }[] = [
  { value: "screenshot", label: "Capturas" },
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

/** Biblioteca global (docs/UX-ARCHITECTURE.md → Library): todo o material de todos os projetos. */
export default async function LibraryPage({ searchParams }: Props) {
  const params = await searchParams;
  const kind = AssetKindSchema.safeParse(params.kind).success ? (params.kind as AssetKind) : undefined;
  const device = params.device === "desktop" || params.device === "mobile" ? params.device : undefined;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const text = params.q?.trim().slice(0, 100) || undefined;
  const { repos } = await getAtlasRuntime();
  const projects = await repos.projects.list({ includeArchived: true });
  const project = projects.find((p) => p.slug === params.project);
  const { items, total } = await repos.assets.search({
    text,
    kinds: kind ? [kind] : undefined,
    device,
    projectId: project?.id,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const byId = new Map(projects.map((p) => [p.id, p]));
  const active = projects.filter((p) => p.status !== "archived").length;
  const archived = projects.length - active;
  const filtered = Boolean(text || kind || device || project);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (n: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: text, kind, device, project: project?.slug })) if (v) q.set(k, v);
    if (n > 1) q.set("page", String(n));
    return `/library${q.size ? `?${q}` : ""}`;
  };
  const description = filtered
    ? `${plural(total, "arquivo encontrado", "arquivos encontrados")}`
    : `${plural(total, "arquivo", "arquivos")} em ${plural(active, "projeto", "projetos")}${archived > 0 ? ` (+${plural(archived, "arquivado", "arquivados")})` : ""}`;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6 sm:py-12">
      <PageHeader title="Biblioteca" description={description} />

      <FilterBar
        query={params.q ?? ""}
        placeholder="Buscar por nome ou seção (hero, contato…)"
        searchLabel="Buscar arquivos"
        selects={[
          { name: "kind", label: "Tipo", value: kind ?? "", options: [{ value: "", label: "Todos os tipos" }, ...KIND_OPTIONS] },
          {
            name: "device",
            label: "Dispositivo",
            value: device ?? "",
            options: [
              { value: "", label: "Qualquer dispositivo" },
              { value: "desktop", label: "Desktop" },
              { value: "mobile", label: "Celular" },
            ],
          },
          {
            name: "project",
            label: "Projeto",
            value: project?.slug ?? "",
            options: [{ value: "", label: "Todos os projetos" }, ...projects.map((p) => ({ value: p.slug, label: p.status === "archived" ? `${p.name} (arquivado)` : p.name }))],
          },
        ]}
      />

      {items.length === 0 ? (
        <EmptyState
          title="Nada encontrado"
          action={
            filtered ? (
              <LinkButton href="/library" size="sm">
                Limpar filtros
              </LinkButton>
            ) : (
              <LinkButton href="/projects" size="sm">
                Ir para os projetos
              </LinkButton>
            )
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((a) => {
            const owner = byId.get(a.projectId);
            return (
              <li key={a.id}>
                <AssetCard asset={a} href={`/projects/${owner?.slug}/assets/${a.id}`} context={project ? undefined : owner?.name} />
              </li>
            );
          })}
        </ul>
      )}

      <Pagination page={page} pages={pages} href={link} />
    </main>
  );
}

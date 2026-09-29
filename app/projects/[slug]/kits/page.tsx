export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { KitGenerator } from "@/components/kits/kit-forms";
import { EmptyState, Panel, SectionTitle } from "@/components/ui/primitives";
import { plural, relativeTime } from "@/components/ui/format";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { requireProjectBySlug } from "@/src/modules/projects/project-service";

interface Props {
  params: Promise<{ slug: string }>;
}

const STATUS: Record<string, { label: string; className: string }> = {
  ready: { label: "Pronto para renderizar", className: "text-cbm-gray-200" },
  rendering: { label: "Renderizando…", className: "text-cbm-gray-200" },
  rendered: { label: "Renderizado", className: "text-ok" },
  failed: { label: "O render falhou", className: "text-warn" },
};

/** Media Kits do projeto: os kits primeiro; o "Novo kit" fica ao lado (embaixo no celular). */
export default async function ProjectKitsPage({ params }: Props) {
  const { slug } = await params;
  const { repos } = await getAtlasRuntime();
  const project = await requireProjectBySlug(repos.projects, slug);
  const [kits, directions] = await Promise.all([repos.kits.listByProject(project.id), repos.directions.listByProject(project.id)]);
  const now = new Date();

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] items-start">
      <section aria-labelledby="kits" className="min-w-0">
        <SectionTitle id="kits">Kits ({kits.length})</SectionTitle>
        {kits.length === 0 ? (
          <EmptyState title="Nenhum kit ainda">Escolha um modelo em Novo kit: o Atlas monta todas as peças com o material do projeto.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {kits.map((kit) => {
              const ready = kit.items.filter((i) => i.instanceId || i.documentId).length;
              return (
                <li key={kit.id}>
                  <Link href={`/projects/${project.slug}/kits/${kit.id}`} className="block group">
                    <Panel className="px-4 py-3.5 space-y-1 group-hover:border-cbm-gray-400 transition-colors">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <p className="text-[14px] text-cbm-white">{kit.name}</p>
                        <span className={`text-[12px] ${STATUS[kit.status].className}`}>{STATUS[kit.status].label}</span>
                      </div>
                      <p className="text-[12px] text-cbm-gray-400">
                        {ready === kit.items.length ? plural(kit.items.length, "peça", "peças") : `${ready} de ${plural(kit.items.length, "peça", "peças")}`} · {kit.direction.tone} ·{" "}
                        {relativeTime(kit.updatedAt, now)}
                      </p>
                    </Panel>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside aria-labelledby="novo-kit" className="lg:sticky lg:top-6">
        <Panel className="p-4">
          <h2 id="novo-kit" className="text-[14px] font-medium text-cbm-white mb-4">
            Novo kit
          </h2>
          <KitGenerator projectId={project.id} directions={directions.map((d) => ({ id: d.id, name: d.name }))} />
        </Panel>
      </aside>
    </div>
  );
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { KitGenerator } from "@/components/kits/kit-forms";
import { EmptyState, Panel, SectionTitle } from "@/components/ui/primitives";
import { getKitPreset } from "@/src/core/kits/media-kit";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { requireProjectBySlug } from "@/src/modules/projects/project-service";

interface Props {
  params: Promise<{ slug: string }>;
}

const STATUS: Record<string, { label: string; className: string }> = {
  ready: { label: "pronto para renderizar", className: "text-cbm-gray-200" },
  rendering: { label: "renderizando", className: "text-accent" },
  rendered: { label: "renderizado", className: "text-ok" },
  failed: { label: "falhou", className: "text-bad" },
};

/** Media Kits do projeto: gerar (preset + direção) e acompanhar os anteriores. */
export default async function ProjectKitsPage({ params }: Props) {
  const { slug } = await params;
  const { repos } = await getAtlasRuntime();
  const project = await requireProjectBySlug(repos.projects, slug);
  const [kits, directions] = await Promise.all([repos.kits.listByProject(project.id), repos.directions.listByProject(project.id)]);

  return (
    <div className="grid gap-10 lg:grid-cols-[26rem_1fr]">
      <section aria-labelledby="gerar">
        <SectionTitle id="gerar">Gerar Media Kit</SectionTitle>
        <p className="text-[13px] text-cbm-gray-400 mb-4">Um conjunto completo de entregáveis com a mesma direção criativa. Cada item vira um rascunho que você pode editar antes de renderizar.</p>
        <KitGenerator projectId={project.id} directions={directions.map((d) => ({ id: d.id, name: d.name }))} />
      </section>
      <section aria-labelledby="kits">
        <SectionTitle id="kits">Kits ({kits.length})</SectionTitle>
        {kits.length === 0 ? (
          <EmptyState title="Nenhum kit ainda">Escolha um kit ao lado. O Atlas monta todas as peças com o material capturado.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {kits.map((kit) => (
              <li key={kit.id}>
                <Link href={`/projects/${project.slug}/kits/${kit.id}`} className="block group">
                  <Panel className="p-4 space-y-1.5 group-hover:border-cbm-gray-400 transition-colors">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-[13px] text-cbm-gray-100">{kit.name}</p>
                      <span className={`text-[10px] font-medium uppercase tracking-[0.22em] ${STATUS[kit.status].className}`}>{STATUS[kit.status].label}</span>
                    </div>
                    <p className="text-[12px] text-cbm-gray-400">
                      {getKitPreset(kit.presetId)?.name ?? kit.presetId} · {kit.items.filter((i) => i.instanceId || i.documentId).length}/{kit.items.length} itens · {kit.direction.tone}
                    </p>
                  </Panel>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

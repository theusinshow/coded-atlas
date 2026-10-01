export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { Download } from "lucide-react";
import { OutputCard } from "@/components/create/output-card";
import { cleanOutputLabel, commonLabelPrefix, withoutPrefix } from "@/components/media/labels";
import { ExportForm, SelectAllButton } from "@/components/publish/export-forms";
import { ExportHistory } from "@/components/publish/export-history";
import { plural } from "@/components/ui/format";
import { Collapsible, EmptyState, LinkButton, SectionTitle } from "@/components/ui/primitives";
import type { Output } from "@/src/core/assets/output";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { requireProjectBySlug } from "@/src/modules/projects/project-service";
import { JobIdSchema } from "@/src/shared/id";
import { destinationStatus } from "@/src/modules/publish/export-service";

const FORM_ID = "package-form";
/** Renders mais novos que isto entram com o destaque de "novo". */
const FRESH_MS = 60_000;

interface Props {
  params: Promise<{ slug: string }>;
}

const LINK = "inline-flex h-10 items-center gap-1.5 text-[12px] text-accent transition-colors hover:text-accent-bright sm:h-8";
const shortDate = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Onde reabrir a origem de uma peça: o documento no Studio ou a composição. */
function sourceLink(slug: string, o: Output): { href: string; label: string } | null {
  if (o.metadata.documentId) return { href: `/studio/${o.metadata.documentId}`, label: "Abrir no Studio" };
  if (o.metadata.instanceId) return { href: `/projects/${slug}/create/${o.metadata.instanceId}`, label: "Abrir composição" };
  return null;
}

/** Entregar: peças finais do projeto (Outputs imutáveis) — marcar, empacotar e baixar. */
export default async function ProjectPublishPage({ params }: Props) {
  const { slug } = await params;
  const { repos, exportDeps } = await getAtlasRuntime();
  const project = await requireProjectBySlug(repos.projects, slug);
  const outputs = [...(await repos.outputs.listByProject(project.id))].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // Só o que saiu do render do Atlas é "render"; o resto veio da biblioteca antiga.
  const rendered = outputs.filter((o) => o.metadata.origin === "render");
  const legacy = outputs.filter((o) => o.metadata.origin !== "render");
  // Um grupo por render (job): carrossel, kit e múltiplos formatos saem juntos, na ordem.
  const groups: { jobId: string | null; items: Output[] }[] = [];
  for (const o of rendered) {
    const group = groups.find((g) => g.jobId !== null && g.jobId === o.jobId);
    if (group) group.items.push(o);
    else groups.push({ jobId: o.jobId, items: [o] });
  }
  for (const g of groups) g.items.sort((a, b) => (a.metadata.page ?? 0) - (b.metadata.page ?? 0) || a.format.localeCompare(b.format));

  const exports = await repos.exports.listByProject(project.id);
  const jobStatus: Record<string, string> = {};
  for (const e of exports) if (e.jobId && (e.status === "queued" || e.status === "running")) jobStatus[e.jobId] = (await repos.jobs.getById(JobIdSchema.parse(e.jobId)))?.status ?? "failed";
  const now = Date.now();
  const isFresh = (o: Output) => now - new Date(o.createdAt).getTime() < FRESH_MS;

  if (outputs.length === 0) {
    return (
      <EmptyState
        title="Nenhum arquivo gerado ainda"
        action={
          <LinkButton href={`/projects/${project.slug}/create`} size="sm">
            Ir para Criar
          </LinkButton>
        }
      />
    );
  }

  return (
    <div className="space-y-10">
      {rendered.length > 0 && (
        <section aria-labelledby="renders" className="space-y-8">
          <div className="space-y-1.5">
            <SectionTitle id="renders" aside={<SelectAllButton formId={FORM_ID} />}>
              Arquivos gerados ({rendered.length})
            </SectionTitle>
            <p className="text-[13px] text-cbm-gray-400">Marque os arquivos para baixar juntos num ZIP ou salvar na pasta de entregas.</p>
          </div>
          {groups.map((group) => {
            const labels = group.items.map((o) => cleanOutputLabel(o.label));
            const prefix = commonLabelPrefix(labels);
            const multi = group.items.length > 1 && group.jobId !== null;
            const pages = new Set(group.items.filter((o) => o.metadata.page !== undefined).map((o) => o.metadata.page)).size;
            const sources = group.items.map((o) => sourceLink(project.slug, o));
            const shared = multi && sources.every((s) => s && s.href === sources[0]?.href) ? sources[0] : null;
            return (
              <div key={group.jobId ?? group.items[0].id} className="space-y-3" data-render-group={group.jobId ?? ""}>
                {multi && (
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line pb-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] text-cbm-gray-100">{prefix || (pages > 0 ? "Carrossel" : "Render")}</p>
                      <p className="text-[12px] text-cbm-gray-400">
                        {pages > 0 ? `Carrossel · ${pages} páginas` : plural(group.items.length, "arquivo", "arquivos")} · {shortDate(group.items[0].createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      {shared && (
                        <Link href={shared.href} className={LINK}>
                          {shared.label}
                        </Link>
                      )}
                      <a href={`/api/atlas/jobs/${group.jobId}/outputs`} className={LINK}>
                        <Download size={14} aria-hidden />
                        Baixar tudo (.zip)
                      </a>
                    </div>
                  </div>
                )}
                <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
                  {group.items.map((o, i) => {
                    const source = shared ? null : sources[i];
                    return (
                      <li key={o.id}>
                        <OutputCard
                          output={o}
                          selectFor={FORM_ID}
                          title={capitalize(withoutPrefix(labels[i], prefix))}
                          fresh={isFresh(o)}
                          footer={
                            source && (
                              <Link href={source.href} className={LINK}>
                                {source.label}
                              </Link>
                            )
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </section>
      )}
      {legacy.length > 0 && (
        <section aria-label="Peças antigas">
          <Collapsible title={`Peças antigas (${legacy.length})`} meta="da versão anterior do Atlas" defaultOpen={rendered.length === 0}>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
              {legacy.map((o) => (
                <li key={o.id}>
                  <OutputCard output={o} selectFor={FORM_ID} />
                </li>
              ))}
            </ul>
          </Collapsible>
        </section>
      )}
      {exports.length > 0 && (
        <section aria-labelledby="entregas">
          <SectionTitle id="entregas">Entregas ({exports.length})</SectionTitle>
          <ExportHistory records={exports} jobStatus={jobStatus} folderRoot={exportDeps.folder.label} canReveal={exportDeps.folder.canReveal} />
        </section>
      )}
      <ExportForm formId={FORM_ID} mode="package" projectId={project.id} destinations={destinationStatus(exportDeps)} defaultName={`${project.name} · pacote`} />
    </div>
  );
}

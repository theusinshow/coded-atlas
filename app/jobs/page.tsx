export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Metadata } from "next";
import { AutoRefresh, CancelJobButton } from "@/components/atlas/job-controls";
import { EmptyState, PageHeader, Panel } from "@/components/ui/primitives";
import { JOB_TYPE_LABEL, JobStatusBadge, jobOutcome } from "@/components/ui/status";
import { relativeTime } from "@/components/ui/format";
import { isTerminal } from "@/src/core/jobs/job";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";

export const metadata: Metadata = { title: "Atividade — Coded Atlas" };

interface Props {
  searchParams: Promise<{ filter?: string }>;
}

type Filter = "all" | "active" | "failed";

function duration(start: string | null, end: string | null): string {
  if (!start) return "";
  const ms = (end ? Date.parse(end) : Date.now()) - Date.parse(start);
  return ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} s` : `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}

export default async function JobsPage({ searchParams }: Props) {
  const { filter: rawFilter } = await searchParams;
  const { repos } = await getAtlasRuntime();
  const jobs = await repos.jobs.listRecent({ limit: 100 });
  const projects = new Map((await repos.projects.list({ includeArchived: true })).map((p) => [p.id, p]));
  const activeCount = jobs.filter((j) => !isTerminal(j.status)).length;
  const failedCount = jobs.filter((j) => j.status === "failed").length;
  // Um filtro só existe quando tem o que mostrar (sem "Falhou" vazio).
  const filter: Filter = rawFilter === "active" && activeCount > 0 ? "active" : rawFilter === "failed" && failedCount > 0 ? "failed" : "all";
  const shown = filter === "active" ? jobs.filter((j) => !isTerminal(j.status)) : filter === "failed" ? jobs.filter((j) => j.status === "failed") : jobs;
  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "Tudo", count: jobs.length },
    ...(activeCount > 0 ? [{ id: "active" as const, label: "Em andamento", count: activeCount }] : []),
    ...(failedCount > 0 ? [{ id: "failed" as const, label: "Falhou", count: failedCount }] : []),
  ];

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
      <AutoRefresh active={activeCount > 0} />
      <PageHeader title="Atividade" description="Capturas, renders e exportações em andamento e recentes." />
      {jobs.length === 0 ? (
        <EmptyState title="Nenhuma atividade ainda">Capturas e renders aparecem aqui assim que forem pedidos.</EmptyState>
      ) : (
        <div className="space-y-4">
          {tabs.length > 1 && (
            <nav aria-label="Filtrar atividade" className="flex flex-wrap gap-2">
              {tabs.map((t) => {
                const on = filter === t.id;
                return (
                  <Link
                    key={t.id}
                    href={t.id === "all" ? "/jobs" : `/jobs?filter=${t.id}`}
                    aria-current={on ? "page" : undefined}
                    className={`inline-flex h-10 sm:h-8 items-center gap-2 border px-3 text-[12px] transition-colors ${on ? "border-cbm-white text-cbm-white" : "border-line text-cbm-gray-400 hover:border-cbm-gray-400 hover:text-cbm-white"}`}
                  >
                    {t.label}
                    <span className={`tabular-nums ${t.id === "failed" && !on ? "text-bad" : ""}`}>{t.count}</span>
                  </Link>
                );
              })}
            </nav>
          )}
          <Panel>
            <ul className="divide-y divide-line">
              {shown.map((job) => {
                const project = job.projectId ? projects.get(job.projectId) : undefined;
                const running = !isTerminal(job.status);
                return (
                  <li key={job.id} className="flex flex-col gap-2 px-4 py-3 sm:grid sm:grid-cols-[8.5rem_minmax(0,1fr)_6rem_auto] sm:items-center sm:gap-4">
                    <div className="flex items-center justify-between gap-3 sm:block">
                      <JobStatusBadge status={job.status} />
                      <span className="text-[12px] text-cbm-gray-400 tabular-nums sm:hidden">{running ? `${job.progress}%` : duration(job.startedAt, job.finishedAt)}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] text-cbm-gray-200">
                        {JOB_TYPE_LABEL[job.type] ?? job.type}
                        {project && (
                          <>
                            <span className="text-cbm-gray-600"> · </span>
                            <Link href={`/projects/${project.slug}`} className="text-cbm-gray-400 hover:text-accent-bright max-sm:-my-3 max-sm:inline-block max-sm:py-3">
                              {project.name}
                            </Link>
                          </>
                        )}
                      </p>
                      <p className={`text-[12px] sm:truncate ${job.error ? "text-bad" : "text-cbm-gray-400"}`}>
                        {jobOutcome(job)} · {relativeTime(job.updatedAt)}
                      </p>
                    </div>
                    <span className="hidden text-[12px] text-cbm-gray-400 tabular-nums sm:block">{running ? `${job.progress}%` : duration(job.startedAt, job.finishedAt)}</span>
                    {running ? (
                      <div className="sm:justify-self-end">
                        <CancelJobButton jobId={job.id} />
                      </div>
                    ) : (
                      <span className="hidden sm:block" aria-hidden />
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      )}
    </main>
  );
}

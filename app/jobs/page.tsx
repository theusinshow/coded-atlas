export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Metadata } from "next";
import { AutoRefresh, CancelJobButton } from "@/components/atlas/job-controls";
import { EmptyState, PageHeader, Panel } from "@/components/ui/primitives";
import { JOB_TYPE_LABEL, JobStatusBadge } from "@/components/ui/status";
import { isTerminal } from "@/src/core/jobs/job";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";

export const metadata: Metadata = { title: "Jobs — Coded Atlas" };

function duration(start: string | null, end: string | null): string {
  if (!start) return "";
  const ms = (end ? Date.parse(end) : Date.now()) - Date.parse(start);
  return ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60_000)}min ${Math.round((ms % 60_000) / 1000)}s`;
}

export default async function JobsPage() {
  const { repos } = await getAtlasRuntime();
  const jobs = await repos.jobs.listRecent({ limit: 100 });
  const projects = new Map((await repos.projects.list({ includeArchived: true })).map((p) => [p.id, p]));
  const active = jobs.some((j) => !isTerminal(j.status));

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 space-y-8">
      <AutoRefresh active={active} />
      <PageHeader
        eyebrow="Jobs"
        title="Jobs"
        description="Trabalho pesado roda aqui, fora das telas: captura, importação e render. Fechar o navegador não interrompe nada."
      />
      {jobs.length === 0 ? (
        <EmptyState title="Nenhum job ainda">Capturas e renders aparecem aqui assim que forem pedidos.</EmptyState>
      ) : (
        <Panel>
          <ul className="divide-y divide-line">
            {jobs.map((job) => {
              const project = job.projectId ? projects.get(job.projectId) : undefined;
              return (
                <li key={job.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[9rem_1fr_7rem_auto] sm:items-center">
                  <JobStatusBadge status={job.status} />
                  <div className="min-w-0">
                    <p className="text-[13px] text-zinc-200">
                      {JOB_TYPE_LABEL[job.type] ?? job.type}
                      {project && (
                        <>
                          {" · "}
                          <Link href={`/projects/${project.slug}`} className="text-zinc-400 hover:text-accent">
                            {project.name}
                          </Link>
                        </>
                      )}
                    </p>
                    <p className={`text-[11px] truncate ${job.error ? "text-bad" : "text-zinc-500"}`}>
                      {job.error?.message ?? job.message ?? new Date(job.createdAt).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-500 tabular-nums">
                    {isTerminal(job.status) ? duration(job.startedAt, job.finishedAt) : `${job.progress}%`}
                  </span>
                  <div className="justify-self-end">{!isTerminal(job.status) && <CancelJobButton jobId={job.id} />}</div>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </main>
  );
}

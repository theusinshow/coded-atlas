export const runtime = "nodejs";

import { isTerminal, type Job } from "@/src/core/jobs/job";
import { getAtlasRuntime } from "@/src/infrastructure/runtime";
import { DomainError } from "@/src/shared/errors";
import { JobIdSchema } from "@/src/shared/id";
import { errorResponse, parseParam } from "../../../_lib/http";

interface Params {
  params: Promise<{ id: string }>;
}

const POLL_MS = 500;

/**
 * SSE com o estado do job, lido do SQLite (fonte da verdade). Fechar a conexão
 * só encerra o acompanhamento — o job continua no worker.
 */
export async function GET(req: Request, { params }: Params): Promise<Response> {
  try {
    const id = parseParam(JobIdSchema, (await params).id, "id");
    const { repos } = await getAtlasRuntime();
    if (!(await repos.jobs.getById(id))) throw new DomainError("NOT_FOUND", "Job não encontrado.");

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let last = "";
        const send = (job: Job) => {
          // Só o que a tela enxerga: heartbeat/updatedAt mudam sem mudar nada visível.
          const visible = JSON.stringify([job.status, job.progress, job.message, job.error]);
          if (visible === last) return;
          last = visible;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(job)}\n\n`));
        };
        try {
          while (!req.signal.aborted) {
            const job = await repos.jobs.getById(id);
            if (!job) break;
            send(job);
            if (isTerminal(job.status)) break;
            await new Promise((r) => setTimeout(r, POLL_MS));
          }
        } finally {
          try {
            controller.close();
          } catch {
            // cliente já desconectou: nada a fechar
          }
        }
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

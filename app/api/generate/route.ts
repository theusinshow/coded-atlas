export const runtime = "nodejs";
export const maxDuration = 120;

import { NextRequest } from "next/server";
import { chromium } from "playwright";
import type { Browser } from "playwright";
import { validateProjectInput } from "@/lib/validation/validate-project-input";
import { assertCapturableUrl } from "@/lib/validation/url-policy";
import {
  ensureProjectFolder,
  commitProjectFolder,
  rollbackProjectFolder,
  type ProjectFolderLease,
} from "@/lib/storage/ensure-project-folder";
import { captureDevice } from "@/lib/capture/capture-device";
import { generateThumbnails } from "@/lib/capture/generate-thumbnails";
import { generateShowcase, type ShowcaseResult } from "@/lib/capture/generate-showcase";
import { captureExtraPage, resolvePageUrl } from "@/lib/capture/capture-page";
import { captureState } from "@/lib/capture/capture-states";
import { buildCatalog } from "@/lib/capture/build-catalog";
import { writeJson } from "@/lib/storage/write-json";
import { catalogPath } from "@/lib/storage/paths";
import { config } from "@/lib/config";
import { AtlasError } from "@/lib/errors";
import { warning } from "@/lib/warnings";
import type {
  AtlasErrorPayload,
  CatalogWarning,
  ProjectInput,
  PageCapture,
  StateCapture,
  ProgressEvent,
  ResultEvent,
} from "@/lib/types";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  "Connection": "keep-alive",
} as const;

const encoder = new TextEncoder();

function frame(data: ProgressEvent | ResultEvent | AtlasErrorPayload): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

export async function POST(req: NextRequest): Promise<Response> {
  // Parse — falha de JSON retorna um único evento de erro no stream
  let input: ProjectInput;
  try {
    input = (await req.json()) as ProjectInput;
  } catch {
    const payload: AtlasErrorPayload = {
      step: "error",
      code: "INVALID_URL",
      message: "A URL informada não é válida. Verifique e tente de novo.",
      detail: "Failed to parse request body as JSON",
    };
    return new Response(`data: ${JSON.stringify(payload)}\n\n`, {
      status: 400,
      headers: SSE_HEADERS,
    });
  }

  const startedAt = Date.now();

  // Cancelamento: o cliente abortar o fetch (botão Cancelar, aba fechada)
  // encerra o trabalho no servidor — fecha o Chromium, o que derruba a
  // operação em andamento, e a geração cai no rollback.
  const cancel = new AbortController();
  req.signal.addEventListener("abort", () => cancel.abort(), { once: true });
  // Teto da geração inteira (2.1.G): estourou → mesmo caminho do cancelamento
  // (fecha o Chromium, rollback), mas reportado como timeout.
  let timedOut = false;
  const watchdog = setTimeout(() => {
    timedOut = true;
    cancel.abort();
  }, config.generationTimeoutMs);
  let browser: Browser | undefined;
  cancel.signal.addEventListener("abort", () => {
    browser?.close().catch(() => {});
  }, { once: true });

  function throwIfCancelled(): void {
    if (cancel.signal.aborted) {
      throw new AtlasError("CANCELLED", "Geração cancelada.", "Client aborted the request");
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      // Cliente pode fechar a conexão SSE antes do finally (ao receber done/error).
      // Guard silencioso evita "Invalid state: Controller is already closed".
      function emit(data: ProgressEvent | ResultEvent | AtlasErrorPayload): void {
        try { controller.enqueue(frame(data)); } catch { /* cliente desconectou */ }
      }

      // Alias com tipo exato — passado a captureDevice como onProgress
      const emitProgress: (event: ProgressEvent) => void = emit;

      let lease: ProjectFolderLease | undefined;
      let succeeded = false;
      // Etapas opcionais que falham viram avisos persistidos no catálogo (2.1.G).
      const warnings: CatalogWarning[] = [];
      const onWarning = (w: CatalogWarning) => {
        warnings.push(w);
        console.warn(`[atlas:${input.slug}] aviso ${w.code}: ${w.message}${w.detail ? ` (${w.detail})` : ""}`);
      };
      try {
        emit({ step: "validating", message: "Validando URL...", progress: 5 });
        validateProjectInput(input);
        await assertCapturableUrl(input.url);

        emit({ step: "launching", message: "Abrindo navegador...", progress: 10 });
        lease = await ensureProjectFolder(input.slug);
        browser = await chromium.launch({
          headless: config.headless,
          args: ["--no-sandbox", "--disable-dev-shm-usage"],
        });
        throwIfCancelled();

        // Desktop: emite capturing-desktop (30%) e capturing-fullpage-desktop (40%)
        const desktop = await captureDevice(
          browser, input, config.viewports.desktop, emitProgress, onWarning
        );
        throwIfCancelled();

        // Mobile: emite capturing-mobile (50%) e capturing-fullpage-mobile (65%)
        const mobile = await captureDevice(
          browser, input, config.viewports.mobile, emitProgress, onWarning
        );
        throwIfCancelled();

        // Páginas extras (v1.5) — captura leve por página, falha por página é silenciosa.
        const pages: PageCapture[] = [];
        const seen = new Set<string>([input.url]);
        const pageEntries = (input.pages ?? [])
          .map((p) => p.trim())
          .filter(Boolean)
          .filter((e) => {
            try {
              const u = resolvePageUrl(e, input.url);
              if (seen.has(u)) return false;
              seen.add(u);
              return true;
            } catch {
              return false;
            }
          })
          .slice(0, config.maxExtraPages);
        for (const entry of pageEntries) await assertCapturableUrl(resolvePageUrl(entry, input.url));

        for (let i = 0; i < pageEntries.length; i++) {
          throwIfCancelled();
          emit({
            step: "capturing-pages",
            message: `Capturando página ${i + 1}/${pageEntries.length}: ${pageEntries[i]}`,
            progress: 70,
          });
          try {
            pages.push(await captureExtraPage(browser, input, pageEntries[i], i, onWarning));
          } catch (err) {
            onWarning(warning("PAGE_CAPTURE_FAILED", `A página "${pageEntries[i]}" não pôde ser capturada.`, err));
          }
        }

        // Estados de interação (v1.5) — clica um seletor e fotografa; falha é silenciosa.
        const states: StateCapture[] = [];
        const stateInputs = (input.states ?? [])
          .filter((s) => s?.name?.trim() && s?.selector?.trim())
          .slice(0, config.maxStates);

        for (let i = 0; i < stateInputs.length; i++) {
          throwIfCancelled();
          emit({
            step: "capturing-states",
            message: `Capturando estado ${i + 1}/${stateInputs.length}: ${stateInputs[i].name}`,
            progress: 75,
          });
          try {
            states.push(await captureState(browser, input, stateInputs[i], i));
          } catch (err) {
            onWarning(warning("STATE_CAPTURE_FAILED", `O estado "${stateInputs[i].name}" não pôde ser capturado.`, err));
          }
        }
        throwIfCancelled();

        // Peças de vitrine (capa, composições, mockups) só se pedidas — senão
        // ficam para depois, sob demanda, na página do projeto.
        const doShowcase = input.options?.showcase ?? config.captureShowcase;
        emit({
          step: "generating-thumbnails",
          message: doShowcase ? "Gerando thumbnails, capa e composições..." : "Gerando thumbnails...",
          progress: 80,
        });
        const thumbnails = await generateThumbnails(input.slug, desktop, mobile);
        const showcase: ShowcaseResult = doShowcase
          ? await generateShowcase(
              browser,
              input.slug,
              { desktopAbs: desktop.screenshotAbsPath, mobileAbs: mobile.screenshotAbsPath },
              { url: input.url, ogImage: desktop.inspection?.ogImage }
            )
          : { compositions: [], mockups: [], warnings: [] };
        showcase.warnings.forEach(onWarning);
        throwIfCancelled();

        emit({ step: "writing-catalog", message: "Montando catálogo...", progress: 92 });
        const catalog = buildCatalog(
          input,
          { desktop, mobile },
          thumbnails,
          showcase.cover,
          { compositions: showcase.compositions, mockups: showcase.mockups, pages, states, warnings },
          startedAt
        );
        await writeJson(catalogPath(input.slug), catalog);
        succeeded = true;

        const result: ResultEvent = {
          step: "done",
          catalog,
          projectUrl: `/legacy/${input.slug}`,
        };
        emit(result);

        console.log(`[atlas:${input.slug}] Concluído em ${Date.now() - startedAt}ms`);
      } catch (err) {
        if (timedOut) {
          console.error(`[atlas:${input.slug}] Geração excedeu ${config.generationTimeoutMs}ms.`);
          emit({
            step: "error",
            code: "RENDER_TIMEOUT",
            message: "A geração demorou demais e foi interrompida. Nada foi perdido.",
            detail: `generationTimeoutMs=${config.generationTimeoutMs}`,
          });
        } else if (cancel.signal.aborted) {
          console.log(`[atlas:${input.slug}] Geração cancelada pelo cliente.`);
          emit({ step: "error", code: "CANCELLED", message: "Geração cancelada." });
        } else {
          console.error(`[atlas:${input.slug}]`, err instanceof Error ? err.message : err);
          if (err instanceof AtlasError) {
            emit({
              step: "error",
              code: err.code,
              message: err.userMessage,
              detail: err.detail,
            } satisfies AtlasErrorPayload);
          } else {
            emit({
              step: "error",
              code: "UNKNOWN",
              message: "Algo deu errado ao gerar o catálogo.",
              detail: String(err),
            } satisfies AtlasErrorPayload);
          }
        }
      } finally {
        clearTimeout(watchdog);
        await browser?.close().catch(() => {});
        // Depois do browser fechado (vídeo finalizado, nenhum arquivo em uso):
        // sucesso descarta a versão anterior; falha/cancelamento a restaura.
        if (lease) {
          try {
            if (succeeded) await commitProjectFolder(lease);
            else await rollbackProjectFolder(input.slug, lease);
          } catch (err) {
            console.error(`[atlas:${input.slug}] falha ao finalizar a pasta: ${err}`);
          }
        }
        try { controller.close(); } catch { /* já fechado pelo cliente */ }
      }
    },
    cancel() {
      cancel.abort();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

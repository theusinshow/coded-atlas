"use client";
import type { ProgressEvent } from "@/lib/types";

type StepDef = { step: string; label: string };

const STEPS: StepDef[] = [
  { step: "validating",                 label: "Validando URL e entrada" },
  { step: "launching",                  label: "Abrindo navegador" },
  { step: "capturing-desktop",          label: "Capturando viewport desktop" },
  { step: "capturing-fullpage-desktop", label: "Capturando full page desktop" },
  { step: "capturing-sections-desktop", label: "Fotografando seções desktop" },
  { step: "recording-video-desktop",    label: "Gravando vídeo desktop" },
  { step: "capturing-mobile",           label: "Capturando viewport mobile" },
  { step: "capturing-fullpage-mobile",  label: "Capturando full page mobile" },
  { step: "capturing-sections-mobile",  label: "Fotografando seções mobile" },
  { step: "recording-video-mobile",     label: "Gravando vídeo mobile" },
  { step: "generating-thumbnails",      label: "Gerando thumbnails" },
  { step: "writing-catalog",            label: "Montando catálogo" },
  { step: "done",                       label: "Catálogo gerado" },
];

interface Props {
  events: ProgressEvent[];
  done?: boolean;
}

export function GenerationStatus({ events, done = false }: Props) {
  const lastEvent = events.at(-1);
  const progress  = done ? 100 : (lastEvent?.progress ?? 0);

  const lastIdx = done
    ? STEPS.length - 1
    : Math.max(-1, ...events.map(e => STEPS.findIndex(s => s.step === e.step)));

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span
            className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest"
            aria-live="polite"
            aria-atomic="true"
          >
            {done ? "Catálogo gerado." : "Construindo catálogo visual..."}
          </span>
          <span className="text-[10px] font-mono text-zinc-600 tabular-nums">{progress}%</span>
        </div>
        <div className="h-0.5 bg-zinc-800 relative rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-emerald-500 transition-[width] duration-500 rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Step list */}
      <ol>
        {STEPS.map(({ step, label }, idx) => {
          const isDone   = idx < lastIdx || (idx === lastIdx && done);
          const isActive = idx === lastIdx && !done;

          return (
            <li key={step} className="flex items-start gap-3 py-2.5 border-b border-zinc-900 last:border-b-0">
              {/* Indicator */}
              <span
                className={[
                  "w-4 shrink-0 mt-px text-center font-mono text-sm leading-none select-none",
                  isDone   ? "text-emerald-400" :
                  isActive ? "text-emerald-400 animate-pulse" :
                             "text-zinc-700",
                ].join(" ")}
                aria-hidden
              >
                {isDone ? "✓" : isActive ? "▶" : "○"}
              </span>

              {/* Label + live message */}
              <div className="min-w-0">
                <span
                  className={[
                    "text-sm",
                    isDone   ? "text-zinc-600" :
                    isActive ? "text-zinc-100" :
                               "text-zinc-700",
                  ].join(" ")}
                >
                  {label}
                </span>
                {isActive && lastEvent?.message && (
                  <p className="text-[11px] font-mono text-zinc-600 mt-0.5 truncate">
                    {lastEvent.message}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

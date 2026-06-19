import { DeviceFrame } from "./device-frame";
import type { DeviceCapture } from "@/lib/types";

interface Props {
  type: "desktop" | "mobile";
  capture: DeviceCapture;
  projectName: string;
}

export function GeneratedGallery({ type, capture, projectName }: Props) {
  const isDesktop = type === "desktop";
  const label     = isDesktop ? "Desktop" : "Mobile";

  return (
    <section aria-label={`Galeria ${label}`}>
      {/* Section header */}
      <div className="flex items-center gap-3 mb-5">
        <h2 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
          {label}
        </h2>
        <span className="text-[10px] font-mono text-zinc-600">{capture.viewport}</span>
      </div>

      {isDesktop ? (
        <div className="space-y-4">
          {/* Viewport */}
          <div>
            <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider mb-2">
              Viewport
            </p>
            <DeviceFrame type="desktop">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={capture.screenshot}
                alt={`${projectName} — desktop viewport`}
                className="w-full block"
                loading="lazy"
              />
            </DeviceFrame>
          </div>

          {/* Full page — clipped with fade */}
          <div>
            <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider mb-2">
              Full Page
            </p>
            <DeviceFrame type="desktop">
              <div className="relative max-h-72 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={capture.fullpage}
                  alt={`${projectName} — desktop full page`}
                  className="w-full block"
                  loading="lazy"
                />
                <div className="absolute inset-x-0 bottom-0 h-20 bg-linear-to-t from-zinc-900 to-transparent pointer-events-none" />
              </div>
            </DeviceFrame>
          </div>
        </div>
      ) : (
        /* Mobile — viewport + fullpage side by side */
        <div className="grid grid-cols-2 gap-4" style={{ maxWidth: "28rem" }}>
          <div>
            <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider mb-2">
              Viewport
            </p>
            <DeviceFrame type="mobile">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={capture.screenshot}
                alt={`${projectName} — mobile viewport`}
                className="w-full block"
                loading="lazy"
              />
            </DeviceFrame>
          </div>

          <div>
            <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider mb-2">
              Full Page
            </p>
            <DeviceFrame type="mobile">
              <div className="relative max-h-112 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={capture.fullpage}
                  alt={`${projectName} — mobile full page`}
                  className="w-full block"
                  loading="lazy"
                />
                <div className="absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-zinc-900 to-transparent pointer-events-none" />
              </div>
            </DeviceFrame>
          </div>
        </div>
      )}
    </section>
  );
}

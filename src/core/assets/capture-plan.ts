import { z } from "zod";

/**
 * O que uma captura completa deve produzir. Devices são nomes (desktop/mobile);
 * as dimensões reais vêm da configuração da instalação, não do plano.
 */
export const CaptureDeviceSchema = z.enum(["desktop", "mobile"]);
export type CaptureDevice = z.infer<typeof CaptureDeviceSchema>;

export const CaptureStateInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  selector: z.string().trim().min(1).max(300),
});

export const CapturePlanSchema = z.strictObject({
  devices: z.array(CaptureDeviceSchema).min(1).max(2),
  fullPage: z.boolean(),
  sections: z.boolean(),
  video: z.boolean(),
  inspect: z.boolean(),
  /** Páginas extras: paths ("/sobre") ou URLs completas do mesmo site. */
  pages: z.array(z.string().trim().min(1).max(500)).max(10),
  states: z.array(CaptureStateInputSchema).max(10),
});
export type CapturePlan = z.infer<typeof CapturePlanSchema>;

export const CAPTURE_PROFILES = {
  /** Matéria-prima para criar peças: rápido e suficiente na maioria dos casos. */
  quick: { devices: ["desktop", "mobile"], fullPage: true, sections: true, video: false, inspect: true, pages: [], states: [] },
  /** Tudo, incluindo o vídeo de scroll (mais lento e pesado). */
  complete: { devices: ["desktop", "mobile"], fullPage: true, sections: true, video: true, inspect: true, pages: [], states: [] },
} as const satisfies Record<string, CapturePlan>;

export type CaptureProfile = keyof typeof CAPTURE_PROFILES;

/** Resolve uma página extra relativa à URL da source. Lança se não for http(s). */
export function resolvePageUrl(entry: string, baseUrl: string): string {
  const url = new URL(entry.trim(), baseUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`Página inválida: ${entry}`);
  return url.href;
}

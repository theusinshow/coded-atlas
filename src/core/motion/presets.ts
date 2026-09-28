import { z } from "zod";
import type { Layer } from "../documents/layer";

/**
 * Presets de movimento (docs/MOTION-ENGINE.md → Initial motion presets). Motion V1
 * é baseado em cenas e presets — sem keyframes. Cada preset é uma função pura do
 * progresso (0..1) para deltas nas propriedades animáveis: x, y, scale, rotation,
 * opacity, blur (+ foco vertical da imagem, para o scroll do site).
 */
export const MOTION_PRESET_IDS = [
  "fade-up",
  "slide-left",
  "slide-right",
  "scale-in",
  "smooth-zoom",
  "float",
  "parallax",
  "browser-reveal",
  "device-float",
  "stack-reveal",
  "website-scroll",
  "ui-focus",
] as const;
export const MotionPresetIdSchema = z.enum(MOTION_PRESET_IDS);
export type MotionPresetId = z.infer<typeof MotionPresetIdSchema>;

export const EasingSchema = z.enum(["linear", "ease-out", "ease-in-out", "spring"]);
export type Easing = z.infer<typeof EasingSchema>;

/** `enter` acontece uma vez no início; `loop` dura a cena toda; `scroll` percorre a imagem. */
export type PresetKind = "enter" | "loop" | "scroll";

export interface PresetDefinition {
  id: MotionPresetId;
  label: string;
  description: string;
  kind: PresetKind;
  defaultDurationMs: number;
  defaultEasing: Easing;
  /** Tipos de camada onde o preset faz sentido (o inspetor filtra por isto). */
  appliesTo: readonly Layer["type"][];
}

const ALL: readonly Layer["type"][] = ["asset", "text", "shape", "device", "browser", "group"];
const FRAMES: readonly Layer["type"][] = ["asset", "device", "browser"];

export const MOTION_PRESETS: Record<MotionPresetId, PresetDefinition> = {
  "fade-up": { id: "fade-up", label: "Fade Up", description: "Surge subindo levemente.", kind: "enter", defaultDurationMs: 700, defaultEasing: "ease-out", appliesTo: ALL },
  "slide-left": { id: "slide-left", label: "Slide Left", description: "Entra deslizando da direita.", kind: "enter", defaultDurationMs: 800, defaultEasing: "ease-out", appliesTo: ALL },
  "slide-right": { id: "slide-right", label: "Slide Right", description: "Entra deslizando da esquerda.", kind: "enter", defaultDurationMs: 800, defaultEasing: "ease-out", appliesTo: ALL },
  "scale-in": { id: "scale-in", label: "Scale In", description: "Cresce até o tamanho final.", kind: "enter", defaultDurationMs: 700, defaultEasing: "spring", appliesTo: ALL },
  "smooth-zoom": { id: "smooth-zoom", label: "Smooth Zoom", description: "Aproximação lenta durante a cena.", kind: "loop", defaultDurationMs: 4000, defaultEasing: "linear", appliesTo: ALL },
  float: { id: "float", label: "Float", description: "Flutua suavemente para cima e para baixo.", kind: "loop", defaultDurationMs: 4000, defaultEasing: "ease-in-out", appliesTo: ALL },
  parallax: { id: "parallax", label: "Parallax", description: "Desliza devagar criando profundidade.", kind: "loop", defaultDurationMs: 4000, defaultEasing: "linear", appliesTo: ALL },
  "browser-reveal": { id: "browser-reveal", label: "Browser Reveal", description: "Janela sobe da base com leve zoom.", kind: "enter", defaultDurationMs: 1000, defaultEasing: "ease-out", appliesTo: ["browser", "asset", "group"] },
  "device-float": { id: "device-float", label: "Device Float", description: "Celular entra e flutua com leve inclinação.", kind: "loop", defaultDurationMs: 4000, defaultEasing: "ease-in-out", appliesTo: ["device", "group"] },
  "stack-reveal": { id: "stack-reveal", label: "Stack Reveal", description: "Entra em sequência (use atrasos diferentes).", kind: "enter", defaultDurationMs: 650, defaultEasing: "ease-out", appliesTo: ALL },
  "website-scroll": { id: "website-scroll", label: "Website Scroll", description: "Rola a página capturada dentro da moldura.", kind: "scroll", defaultDurationMs: 5000, defaultEasing: "ease-in-out", appliesTo: FRAMES },
  "ui-focus": { id: "ui-focus", label: "UI Focus", description: "Destaque com um leve pulso de escala.", kind: "enter", defaultDurationMs: 900, defaultEasing: "ease-in-out", appliesTo: ALL },
};

export function ease(easing: Easing, t: number): number {
  const x = Math.min(Math.max(t, 0), 1);
  switch (easing) {
    case "linear":
      return x;
    case "ease-out":
      return 1 - Math.pow(1 - x, 3);
    case "ease-in-out":
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    case "spring": {
      // Sobe além e assenta (overshoot amortecido), terminando exatamente em 1.
      if (x === 1) return 1;
      return 1 - Math.exp(-6 * x) * Math.cos(x * Math.PI * 2.2);
    }
  }
}

export interface MotionDelta {
  dx: number;
  dy: number;
  scale: number;
  rotation: number;
  /** Multiplicador de opacidade. */
  opacity: number;
  blur: number;
  /** Foco vertical absoluto (0 topo … 1 base) para imagens roladas. */
  focusY?: number;
}

export const IDENTITY: MotionDelta = { dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1, blur: 0 };

/**
 * Deltas de um preset em `progress` (0..1, já com a curva da faixa aplicada;
 * presets `loop` recebem o progresso ao longo do resto da cena).
 * `unit` = min(largura, altura) do artboard, para amplitudes proporcionais.
 */
export function evaluatePreset(id: MotionPresetId, progress: number, intensity: number, unit: number): MotionDelta {
  const d = rawPreset(id, progress, intensity, unit);
  // Sem -0 (evita diferenças espúrias em comparações e no JSON).
  return { ...d, dx: d.dx + 0, dy: d.dy + 0, rotation: d.rotation + 0, blur: d.blur + 0 };
}

function rawPreset(id: MotionPresetId, progress: number, intensity: number, unit: number): MotionDelta {
  const p = Math.min(Math.max(progress, 0), 1);
  const k = intensity;
  const rest = 1 - p;
  switch (id) {
    case "fade-up":
      return { ...IDENTITY, dy: rest * unit * 0.05 * k, opacity: p };
    case "slide-left":
      return { ...IDENTITY, dx: rest * unit * 0.18 * k, opacity: Math.min(1, p * 1.6) };
    case "slide-right":
      return { ...IDENTITY, dx: -rest * unit * 0.18 * k, opacity: Math.min(1, p * 1.6) };
    case "scale-in":
      return { ...IDENTITY, scale: 1 - rest * 0.18 * k, opacity: Math.min(1, p * 2) };
    case "smooth-zoom":
      return { ...IDENTITY, scale: 1 + p * 0.07 * k };
    case "float":
      return { ...IDENTITY, dy: Math.sin(p * Math.PI * 2) * unit * 0.012 * k };
    case "parallax":
      return { ...IDENTITY, dy: (0.5 - p) * unit * 0.04 * k };
    case "browser-reveal":
      return { ...IDENTITY, dy: rest * unit * 0.12 * k, scale: 1 - rest * 0.06 * k, opacity: Math.min(1, p * 1.8) };
    case "device-float": {
      const enter = Math.min(1, p * 4);
      return { ...IDENTITY, dy: (1 - enter) * unit * 0.1 * k + Math.sin(p * Math.PI * 2) * unit * 0.01 * k, rotation: Math.sin(p * Math.PI * 2) * 1.2 * k, opacity: enter };
    }
    case "stack-reveal":
      return { ...IDENTITY, dy: rest * unit * 0.08 * k, scale: 1 - rest * 0.04 * k, opacity: p };
    case "website-scroll":
      return { ...IDENTITY, focusY: p };
    case "ui-focus":
      return { ...IDENTITY, scale: 1 + Math.sin(p * Math.PI) * 0.05 * k + p * 0.02 * k, blur: 0 };
  }
}

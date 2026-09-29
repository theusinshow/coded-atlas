"use client";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/**
 * Movimento do Atlas (DESIGN-LANGUAGE §4, "Porsche, não videogame"): só para
 * feedback, mudança de estado e continuidade. Curva exponencial de saída, sem
 * bounce; saída mais rápida que a entrada. `reducedMotion="user"` corta
 * transform/layout para quem pede menos movimento e mantém opacidade/cor.
 */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
export const DURATION = { instant: 0.15, quick: 0.22, layout: 0.34 } as const;

/** Entrada/saída padrão de um painel que troca de conteúdo. */
export const swap = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: DURATION.quick, ease: EASE_OUT } },
  exit: { opacity: 0, y: -4, transition: { duration: DURATION.instant, ease: "easeIn" as const } },
};

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: DURATION.quick, ease: EASE_OUT }}>
      {children}
    </MotionConfig>
  );
}

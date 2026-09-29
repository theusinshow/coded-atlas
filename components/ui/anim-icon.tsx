"use client";
import UseAnimations from "react-useanimations";
import type { ComponentProps } from "react";
import { useReducedMotion } from "motion/react";

/**
 * Ícone animado (react-useanimations / Lottie) para feedback pontual — copiar,
 * baixar, carregando. Traço na cor do texto; sem movimento para quem pede
 * reduced motion (mostra o quadro final, estático).
 */
export function AnimIcon({ animation, size = 18, strokeColor = "currentColor", ...rest }: ComponentProps<typeof UseAnimations>) {
  const reduce = useReducedMotion();
  return <UseAnimations animation={animation} size={size} strokeColor={strokeColor} autoplay={reduce ? false : rest.autoplay} {...rest} />;
}

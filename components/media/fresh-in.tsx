"use client";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { EASE_OUT } from "@/components/ui/motion";

/**
 * Entrada de um item recém-criado (render que acabou de terminar): fade + 4 px de
 * subida em 240 ms e um contorno off-white que se apaga em 1,2 s — diz "isto é novo"
 * sem coreografia. Itens antigos renderizam direto, sem animação.
 */
export function FreshIn({ fresh, children, className = "" }: { fresh: boolean; children: ReactNode; className?: string }) {
  if (!fresh) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 4, outlineColor: "rgba(245, 242, 237, 1)" }}
      animate={{ opacity: 1, y: 0, outlineColor: "rgba(245, 242, 237, 0)" }}
      transition={{ opacity: { duration: 0.24, ease: EASE_OUT }, y: { duration: 0.24, ease: EASE_OUT }, outlineColor: { duration: 1.2, delay: 0.24, ease: "easeOut" } }}
      style={{ outlineWidth: 1, outlineStyle: "solid", outlineOffset: 3 }}
    >
      {children}
    </motion.div>
  );
}

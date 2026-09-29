"use client";
import { motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { EASE_OUT } from "@/components/ui/motion";

/**
 * "Acabou de chegar": uma peça nova (render que terminou, rascunho criado) entra
 * com fade + 4px de subida e um contorno off-white que some em ~1,2 s. Só o que
 * chegou DEPOIS da tela abrir anima — a lista inicial aparece parada.
 */
const OUTLINE_ON = "rgba(245, 242, 237, 0.9)";
const OUTLINE_OFF = "rgba(245, 242, 237, 0)";

const arrive = {
  initial: { opacity: 0, y: 4, outlineColor: OUTLINE_ON },
  animate: { opacity: 1, y: 0, outlineColor: [OUTLINE_ON, OUTLINE_ON, OUTLINE_OFF] },
  transition: {
    opacity: { duration: 0.24, ease: EASE_OUT },
    y: { duration: 0.24, ease: EASE_OUT },
    outlineColor: { duration: 1.5, times: [0, 0.8, 1], ease: "easeOut" as const },
  },
};

/** Grade de itens em que só os novos animam a chegada (e os removidos saem rápido). */
export function FreshList({ items, className = "", itemClassName = "" }: { items: { id: string; node: ReactNode }[]; className?: string; itemClassName?: string }) {
  const seen = useRef<Set<string> | null>(null);
  if (seen.current === null) seen.current = new Set(items.map((i) => i.id));
  const known = seen.current;
  useEffect(() => {
    for (const i of items) known.add(i.id);
  }, [items, known]);

  return (
    <ul className={className}>
      {items.map((item) => {
        const isNew = !known.has(item.id);
        return (
          <motion.li
            key={item.id}
            className={itemClassName}
            style={{ outline: "1px solid transparent", outlineOffset: 3 }}
            initial={isNew ? arrive.initial : false}
            animate={isNew ? arrive.animate : undefined}
            transition={arrive.transition}
          >
            {item.node}
          </motion.li>
        );
      })}
    </ul>
  );
}

/** Um bloco que "chega de novo" quando `stamp` muda (ex.: o item do kit ganhou um render novo). */
export function Fresh({ stamp, children, className = "" }: { stamp: string | null; children: ReactNode; className?: string }) {
  const first = useRef(stamp);
  const isNew = stamp !== null && stamp !== first.current;
  return (
    <motion.div
      key={stamp ?? "none"}
      className={className}
      style={{ outline: "1px solid transparent", outlineOffset: 3 }}
      initial={isNew ? arrive.initial : false}
      animate={isNew ? arrive.animate : undefined}
      transition={arrive.transition}
    >
      {children}
    </motion.div>
  );
}

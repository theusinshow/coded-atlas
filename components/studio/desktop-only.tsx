"use client";
import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { ChevronLeft, Monitor } from "lucide-react";
import { buttonClass } from "@/components/ui/primitives";

/** Editores de tela cheia (Studio, case) só funcionam a partir de 1024 px. */
const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * true em telas ≥ 1024 px. No servidor (e na hidratação) assume desktop — o CSS
 * (`max-lg:hidden` / `lg:hidden`) já esconde o lado errado antes do JS, então não
 * há flash; depois da hidratação o lado que não serve nem é montado.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true
  );
}

/** Fecha um menu flutuante ao clicar fora dele ou apertar Esc. */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void): void {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref]);
}

/**
 * Tela do editor em celular/tablet estreito: diz o que fazer, volta ao projeto e
 * mostra uma prévia só de leitura (quando houver).
 */
export function DesktopOnlyNotice({ title, backHref, preview, className = "" }: { title: string; backHref: string; preview?: ReactNode; className?: string }) {
  return (
    <div className={`fixed inset-0 z-40 overflow-y-auto bg-base text-cbm-gray-100 ${className}`}>
      <div className="mx-auto flex min-h-full max-w-md flex-col gap-6 px-4 py-10">
        <div className="space-y-3">
          <Monitor size={20} className="text-cbm-gray-400" aria-hidden />
          <h1 className="text-[18px] font-semibold leading-snug text-cbm-white">O {title} precisa de uma tela maior. Abra no computador.</h1>
          <p className="text-[13px] text-cbm-gray-400">O que foi feito até aqui está salvo.</p>
        </div>
        <Link href={backHref} className={`${buttonClass("secondary", "md")} w-full`}>
          <ChevronLeft size={16} aria-hidden />
          Voltar ao projeto
        </Link>
        {preview && (
          <figure className="space-y-2">
            <div className="border border-line">{preview}</div>
            <figcaption className="text-[12px] text-cbm-gray-400">Prévia, só leitura</figcaption>
          </figure>
        )}
      </div>
    </div>
  );
}

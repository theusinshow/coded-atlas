"use client";
import { Loader2 } from "lucide-react";
import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

/**
 * Botão de envio de um form de server action com feedback de espera: o rótulo
 * fica (a largura não pula) e um indicador aparece enquanto o Atlas cria a peça.
 */
export function SubmitButton({ children, className = "", disabled, ...props }: ComponentProps<"button">) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" {...props} disabled={disabled || pending} aria-busy={pending || undefined} className={className}>
      {pending && <Loader2 size={14} className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

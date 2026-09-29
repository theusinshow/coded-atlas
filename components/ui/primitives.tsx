import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * Primitivos de UI do Atlas (docs/DESIGN-SYSTEM.md), sobre os tokens da Coded by M
 * (globals.css): base profunda, estrutura em off-white, sinal vermelho raro, cantos
 * retos. Panchang só em títulos e botão primário; Satoshi no resto; micro-labels em
 * uppercase com tracking largo. Sem gradientes, glow ou pílulas decorativas.
 */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2";
const VARIANTS: Record<Variant, string> = {
  // Variante sólida do DS (§5.2): sinal + Panchang 600 uppercase — a ação principal da tela.
  primary: "bg-signal text-cbm-black hover:bg-signal-dark font-display font-semibold uppercase tracking-[0.12em]",
  secondary: "border border-line text-cbm-white hover:border-cbm-gray-400 hover:bg-surface",
  ghost: "text-cbm-gray-400 hover:text-cbm-gray-100 hover:bg-surface",
  danger: "border border-bad/60 text-bad hover:bg-bad/10",
};
const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[12px]",
  md: "h-10 px-4 text-sm",
};
/** Panchang é larga: o primário usa corpo menor no mesmo tamanho de botão. */
const PRIMARY_SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[10px]",
  md: "h-10 px-5 text-[11px]",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md"): string {
  return `${BASE} ${VARIANTS[variant]} ${(variant === "primary" ? PRIMARY_SIZES : SIZES)[size]}`;
}

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button {...props} className={`${buttonClass(variant, size)} ${className}`} />;
}

export function LinkButton({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link {...props} className={`${buttonClass(variant, size)} ${className}`} />;
}

export const INPUT_CLASS =
  "w-full bg-surface border border-line text-cbm-gray-100 text-sm px-3 py-2.5 placeholder:text-cbm-gray-400 " +
  "focus:outline-none focus:border-accent transition-colors disabled:opacity-50";

export const LABEL_CLASS = "block text-[11px] font-medium text-cbm-gray-400 tracking-[0.22em] uppercase mb-1.5";

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className={LABEL_CLASS}>
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-cbm-gray-400 mt-1.5">{hint}</p>}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[10px] font-medium text-signal/70 uppercase tracking-[0.35em] mb-3 flex items-center gap-2">
            <span className="w-6 h-px bg-signal/50" aria-hidden />
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-[26px] font-bold leading-tight text-cbm-white tracking-[-0.02em]">{title}</h1>
        {description && <div className="text-sm text-cbm-gray-400 mt-1.5 max-w-2xl">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ children, id, aside }: { children: ReactNode; id?: string; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 mb-4">
      <h2 id={id} className="text-[11px] font-medium text-cbm-gray-400 uppercase tracking-[0.22em]">
        {children}
      </h2>
      {aside}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="border border-dashed border-line p-8 text-center space-y-3">
      <p className="text-sm font-medium text-cbm-gray-200">{title}</p>
      {children && <div className="text-[13px] text-cbm-gray-400 max-w-md mx-auto">{children}</div>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`border border-line bg-surface ${className}`}>{children}</div>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="border border-line bg-surface px-4 py-3">
      <p className="text-[10px] font-medium text-cbm-gray-400 uppercase tracking-[0.22em]">{label}</p>
      <p className="font-display text-lg font-semibold text-cbm-white tabular-nums mt-1">{value}</p>
      {hint && <p className="text-[11px] text-cbm-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-[13px] text-bad">
      {message}
    </p>
  );
}

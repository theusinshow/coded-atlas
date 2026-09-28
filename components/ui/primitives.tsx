import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * Primitivos de UI do Atlas (docs/DESIGN-SYSTEM.md): derivados dos tokens do
 * globals.css (neutros frios, acento cobre, status semântico). Só semântica e
 * estados — sem gradientes, glow ou pílulas decorativas.
 */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-zinc-950 hover:bg-accent-bright",
  secondary: "border border-line text-zinc-200 hover:border-zinc-500 hover:bg-surface",
  ghost: "text-zinc-400 hover:text-zinc-100 hover:bg-surface",
  danger: "border border-bad/60 text-bad hover:bg-bad/10",
};
const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[12px]",
  md: "h-10 px-4 text-sm",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md"): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]}`;
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
  "w-full bg-surface border border-line text-zinc-100 text-sm px-3 py-2.5 placeholder:text-zinc-500 " +
  "focus:outline-none focus:border-accent transition-colors disabled:opacity-50";

export const LABEL_CLASS = "block text-[11px] font-mono text-zinc-400 tracking-wider uppercase mb-1.5";

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className={LABEL_CLASS}>
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-zinc-500 mt-1.5">{hint}</p>}
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
          <p className="text-[11px] font-mono text-accent uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
            <span className="tri" aria-hidden />
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-semibold text-zinc-50 tracking-tight">{title}</h1>
        {description && <div className="text-sm text-zinc-400 mt-1.5 max-w-2xl">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ children, id, aside }: { children: ReactNode; id?: string; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 mb-4">
      <h2 id={id} className="text-[11px] font-mono text-zinc-400 uppercase tracking-widest">
        {children}
      </h2>
      {aside}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="border border-dashed border-line p-8 text-center space-y-3">
      <p className="text-sm font-medium text-zinc-200">{title}</p>
      {children && <div className="text-[13px] text-zinc-500 max-w-md mx-auto">{children}</div>}
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
      <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{label}</p>
      <p className="text-xl font-semibold text-zinc-100 tabular-nums mt-1">{value}</p>
      {hint && <p className="text-[11px] text-zinc-500 mt-0.5">{hint}</p>}
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

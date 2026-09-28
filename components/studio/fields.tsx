"use client";
import { useEffect, useState, type ReactNode } from "react";
import { COLOR_TOKENS, type ColorRef, type ColorToken } from "@/src/core/documents/layer";
import type { StyleTokens } from "@/src/core/creative/tokens";

/** Controles compactos do inspetor do Studio (tokens do design system, sem decoração). */

export const FIELD_LABEL = "block text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1";
const INPUT = "w-full h-8 bg-surface-2 border border-line text-zinc-100 text-[12px] px-2 focus:outline-none focus:border-accent tabular-nums";

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-mono uppercase tracking-[0.14em] text-zinc-400">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Número com edição livre: aplica a cada mudança válida, volta ao valor real ao sair. */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  const [text, setText] = useState(String(round(value)));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(round(value)));
  }, [value, focused]);
  const id = `f-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className={FIELD_LABEL}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          className={INPUT}
          value={text}
          min={min}
          max={max}
          step={step}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setText(String(round(value)));
          }}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value.trim() !== "" && Number.isFinite(n)) onChange(clamp(n, min, max));
          }}
        />
        {suffix && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 pointer-events-none">{suffix}</span>}
      </div>
    </div>
  );
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
function clamp(n: number, min?: number, max?: number): number {
  return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
}

export function TextField({ label, value, onChange, maxLength }: { label: string; value: string; onChange: (v: string) => void; maxLength?: number }) {
  const id = `t-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className={FIELD_LABEL}>
        {label}
      </label>
      <input id={id} className={INPUT} value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { id: T; label: string; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <span className={FIELD_LABEL}>{label}</span>
      <div role="radiogroup" aria-label={label} className="flex border border-line">
        {options.map((o) => (
          <button
            key={String(o.id)}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            title={o.title}
            onClick={() => onChange(o.id)}
            className={`flex-1 h-7 px-1.5 text-[11px] transition-colors ${value === o.id ? "bg-surface-2 text-accent-bright" : "text-zinc-400 hover:text-zinc-100"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function RangeField({ label, value, onChange, min, max, step, format }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; format?: (v: number) => string }) {
  const id = `r-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className={`${FIELD_LABEL} flex justify-between`}>
        <span>{label}</span>
        <span className="text-zinc-400 normal-case tracking-normal">{format ? format(value) : value}</span>
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--color-accent)]" />
    </div>
  );
}

const TOKEN_LABEL: Record<ColorToken, string> = {
  background: "Fundo",
  surface: "Superfície",
  line: "Linha",
  text: "Texto",
  textMuted: "Texto suave",
  primary: "Primária",
  onPrimary: "Sobre primária",
  accent: "Destaque",
};

/**
 * Cor como referência: token semântico (acompanha o estilo projeto/atlas/híbrido)
 * ou hex fixo. Mostrar os tokens primeiro incentiva peças coerentes com a marca.
 */
export function ColorField({
  label,
  value,
  tokens,
  onChange,
  nullable = false,
}: {
  label: string;
  value: ColorRef | null;
  tokens: StyleTokens;
  onChange: (v: ColorRef | null) => void;
  nullable?: boolean;
}) {
  const isHex = typeof value === "string" && value.startsWith("#");
  const resolved = value === null ? null : isHex ? value : tokens.colors[value as ColorToken];
  return (
    <div>
      <span className={FIELD_LABEL}>{label}</span>
      <div className="flex flex-wrap items-center gap-1">
        {nullable && (
          <button
            type="button"
            title="Nenhuma"
            aria-label="Nenhuma"
            aria-pressed={value === null}
            onClick={() => onChange(null)}
            className={`w-6 h-6 border ${value === null ? "border-accent" : "border-line"} bg-[linear-gradient(135deg,transparent_45%,#71717a_45%,#71717a_55%,transparent_55%)]`}
          />
        )}
        {COLOR_TOKENS.map((token) => (
          <button
            key={token}
            type="button"
            title={`${TOKEN_LABEL[token]} (${tokens.colors[token]})`}
            aria-label={TOKEN_LABEL[token]}
            aria-pressed={value === token}
            onClick={() => onChange(token)}
            className={`w-6 h-6 border ${value === token ? "border-accent ring-1 ring-accent" : "border-line"}`}
            style={{ background: tokens.colors[token] }}
          />
        ))}
        <label title="Cor fixa" className={`relative w-6 h-6 border cursor-pointer overflow-hidden ${isHex ? "border-accent ring-1 ring-accent" : "border-line"}`}>
          <span className="absolute inset-0 bg-[conic-gradient(#ef4444,#eab308,#22c55e,#06b6d4,#6366f1,#ec4899,#ef4444)]" style={isHex ? { background: value } : undefined} />
          <input
            type="color"
            aria-label={`${label}: cor fixa`}
            className="absolute inset-0 opacity-0 cursor-pointer"
            value={(resolved ?? "#000000").slice(0, 7)}
            onChange={(e) => onChange(e.target.value.toLowerCase())}
          />
        </label>
        <span className="ml-1 text-[10px] font-mono text-zinc-500">{value === null ? "nenhuma" : isHex ? value : TOKEN_LABEL[value as ColorToken]}</span>
      </div>
    </div>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-[12px] text-zinc-300 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

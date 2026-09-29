"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useTransition, type FormEvent } from "react";
import { Search } from "lucide-react";
import { INPUT_CLASS } from "@/components/ui/primitives";

export interface FilterSelect {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
}

/**
 * Filtros que se aplicam sozinhos: selects na hora, busca com debounce (300 ms).
 * Tudo vai para a URL (compartilhável, volta com o navegador) e a página volta à 1.
 */
export function FilterBar({ query, placeholder, searchLabel, selects }: { query: string; placeholder: string; searchLabel: string; selects: FilterSelect[] }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Navegação externa ("Limpar filtros", voltar do navegador): o formulário segue a URL,
  // sem atropelar o campo que a pessoa está digitando.
  const signature = [query, ...selects.map((s) => s.value)].join("\u0000");
  useEffect(() => {
    const el = form.current;
    if (!el) return;
    const values: Record<string, string> = { q: query, ...Object.fromEntries(selects.map((s) => [s.name, s.value])) };
    for (const [name, value] of Object.entries(values)) {
      const field = el.elements.namedItem(name);
      if ((field instanceof HTMLInputElement || field instanceof HTMLSelectElement) && field !== document.activeElement && field.value !== value) field.value = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` resume query + selects
  }, [signature]);

  function apply() {
    if (timer.current) clearTimeout(timer.current);
    if (!form.current) return;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form.current)) {
      const v = String(value).trim();
      if (v) params.set(key, v);
    }
    start(() => router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false }));
  }

  function debounced() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(apply, 300);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    apply();
  }

  return (
    <form ref={form} role="search" onSubmit={onSubmit} aria-busy={pending} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,11rem))]">
      <div className="relative">
        <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cbm-gray-400" />
        <input name="q" type="search" defaultValue={query} placeholder={placeholder} aria-label={searchLabel} onChange={debounced} className={`${INPUT_CLASS} pl-9`} />
      </div>
      {selects.map((s) => (
        <select key={s.name} name={s.name} defaultValue={s.value} aria-label={s.label} onChange={apply} className={INPUT_CLASS}>
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
    </form>
  );
}

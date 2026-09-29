"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { INPUT_CLASS } from "@/components/ui/primitives";

const SEARCH_DEBOUNCE_MS = 300;
const DEFAULTS: Record<string, string> = { q: "", category: "", status: "active", sort: "recent" };

/** Valor local de um filtro que segue a URL quando ela muda por fora (ex.: "Limpar filtros"). */
function useParamState(url: string): [string, (v: string) => void] {
  const [value, setValue] = useState(url);
  const [seen, setSeen] = useState(url);
  if (url !== seen) {
    setSeen(url);
    setValue(url);
  }
  return [value, setValue];
}

/**
 * Filtros da biblioteca de projetos: aplicam sozinhos (busca com debounce, selects na
 * hora) trocando a query string — a lista continua vindo do servidor.
 */
export function ProjectFilters({ categories, sorts }: { categories: string[]; sorts: readonly { value: string; label: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const read = (key: string) => params.get(key) ?? DEFAULTS[key];
  const [category, setCategory] = useParamState(read("category"));
  const [status, setStatus] = useParamState(read("status"));
  const [sort, setSort] = useParamState(read("sort"));
  // A busca só é sobrescrita pela URL quando ela é limpa por fora — nunca no meio da digitação.
  const urlQ = read("q");
  const [q, setQ] = useState(urlQ);
  const [seenQ, setSeenQ] = useState(urlQ);
  if (urlQ !== seenQ) {
    setSeenQ(urlQ);
    if (urlQ === "") setQ("");
  }
  const [pending, startTransition] = useTransition();

  const apply = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === DEFAULTS[key]) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    if (query === params.toString()) return;
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  };
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    const timer = setTimeout(() => applyRef.current({ q: q.trim() }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div role="search" aria-busy={pending} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_12rem_9rem_10rem] sm:gap-3">
      <label className="relative col-span-2 sm:col-span-1">
        <span className="sr-only">Buscar projetos</span>
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cbm-gray-400" aria-hidden />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, cliente ou categoria" className={`${INPUT_CLASS} pl-9`} />
      </label>
      <select
        value={category}
        onChange={(e) => {
          setCategory(e.target.value);
          apply({ category: e.target.value });
        }}
        aria-label="Categoria"
        className={`${INPUT_CLASS} col-span-2 sm:col-span-1`}
      >
        <option value="">Todas as categorias</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select
        value={status}
        onChange={(e) => {
          setStatus(e.target.value);
          apply({ status: e.target.value });
        }}
        aria-label="Situação"
        className={INPUT_CLASS}
      >
        <option value="active">Ativos</option>
        <option value="archived">Arquivados</option>
        <option value="all">Todos</option>
      </select>
      <select
        value={sort}
        onChange={(e) => {
          setSort(e.target.value);
          apply({ sort: e.target.value });
        }}
        aria-label="Ordenar"
        className={INPUT_CLASS}
      >
        {sorts.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}

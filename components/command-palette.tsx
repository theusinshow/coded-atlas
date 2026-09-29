"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Activity, Briefcase, Folder, FolderOpen, Images, Megaphone, Plus, Search, Settings, type LucideIcon } from "lucide-react";
import { DURATION, EASE_OUT } from "@/components/ui/motion";

/** O mínimo que a paleta usa de um projeto do banco (GET /api/atlas/projects). */
interface ProjectItem {
  slug: string;
  name: string;
  category: string;
  client: string | null;
}

type Item = {
  id: string;
  label: string;
  sub?: string;
  hint: string;
  icon: LucideIcon;
  run: () => void;
};

const PAGES: { id: string; label: string; href: string; icon: LucideIcon; keywords?: string }[] = [
  { id: "go-new", label: "Novo projeto", href: "/projects/new", icon: Plus, keywords: "criar" },
  { id: "go-projects", label: "Projetos", href: "/projects", icon: FolderOpen, keywords: "biblioteca" },
  { id: "go-library", label: "Biblioteca de assets", href: "/library", icon: Images, keywords: "imagens capturas" },
  { id: "go-social", label: "Social", href: "/social", icon: Megaphone, keywords: "instagram posts feed" },
  { id: "go-portfolio", label: "Portfólio", href: "/portfolio", icon: Briefcase, keywords: "exportar" },
  { id: "go-jobs", label: "Atividade", href: "/jobs", icon: Activity, keywords: "jobs renders capturas" },
  { id: "go-settings", label: "Ajustes", href: "/settings", icon: Settings, keywords: "configurar brain ia" },
];

function matches(q: string, ...fields: (string | undefined)[]) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return fields.some((f) => f?.toLowerCase().includes(needle));
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [projects, setProjects] = useState<ProjectItem[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // A busca é zerada ao ABRIR (não ao fechar), para a lista não piscar durante a saída.
  const close = useCallback(() => setOpen(false), []);
  const show = useCallback(() => {
    setQuery("");
    setActive(0);
    setOpen(true);
  }, []);
  const openRef = useRef(open);
  openRef.current = open;

  // Atalho global Cmd/Ctrl+K + gatilho via evento (botão na nav)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (openRef.current) close();
        else show();
      }
    }
    function onOpen() {
      show();
    }
    document.addEventListener("keydown", onKey);
    window.addEventListener("atlas:open-command", onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("atlas:open-command", onOpen);
    };
  }, [close, show]);

  // Recarrega projetos a cada abertura (a lista muda depois de criar/excluir).
  useEffect(() => {
    if (!open) return;
    fetch("/api/atlas/projects", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { projects: ProjectItem[] }) => setProjects(d.projects))
      .catch(() => setProjects((p) => p ?? []));
  }, [open]);

  // Trava o scroll da página e foca a busca.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      document.body.style.overflow = prev;
      cancelAnimationFrame(id);
    };
  }, [open]);

  const items: Item[] = useMemo(() => {
    const go = (href: string) => () => {
      router.push(href);
      close();
    };
    const pages: Item[] = PAGES.filter((a) => matches(query, a.label, a.keywords)).map((a) => ({ id: a.id, label: a.label, hint: "Página", icon: a.icon, run: go(a.href) }));
    const projs: Item[] = (projects ?? [])
      .filter((p) => matches(query, p.name, p.category, p.client ?? undefined))
      .slice(0, 8)
      .map((p) => ({ id: `proj-${p.slug}`, label: p.name, sub: [p.category, p.client].filter(Boolean).join(" · "), hint: "Projeto", icon: Folder, run: go(`/projects/${p.slug}`) }));
    // Buscando, projetos primeiro (é o que mais se procura); sem busca, as páginas.
    return query ? [...projs, ...pages] : [...pages, ...projs];
  }, [query, projects, router, close]);

  useEffect(() => setActive(0), [query]);

  // Mantém o item ativo visível ao navegar pelo teclado.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[active]?.run();
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-start justify-center bg-base/80 px-4 pt-[12vh]"
          onClick={close}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: DURATION.instant, ease: EASE_OUT } }}
          exit={{ opacity: 0, transition: { duration: 0.1, ease: "easeIn" } }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Buscar"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl border border-line-soft bg-surface"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0, transition: { duration: DURATION.quick, ease: EASE_OUT } }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.1, ease: "easeIn" } }}
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search size={16} className="shrink-0 text-cbm-gray-400" aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Buscar projeto ou página…"
                aria-label="Buscar projeto ou página"
                role="combobox"
                aria-expanded="true"
                aria-controls="command-results"
                aria-activedescendant={items[active] ? `cmd-${items[active].id}` : undefined}
                style={{ outline: "none" }}
                className="flex-1 bg-transparent py-3.5 text-sm text-cbm-gray-100 placeholder:text-cbm-gray-400"
              />
              <kbd className="hidden border border-line px-1.5 py-0.5 font-mono text-[10px] text-cbm-gray-400 sm:inline">Esc</kbd>
            </div>

            <ul ref={listRef} id="command-results" role="listbox" aria-label="Resultados" className="max-h-80 overflow-y-auto py-1">
              {items.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-cbm-gray-400">{projects === null ? "Carregando…" : "Nada encontrado."}</li>}
              {items.map((item, i) => {
                const sel = i === active;
                return (
                  <li key={item.id} role="option" id={`cmd-${item.id}`} aria-selected={sel} data-index={i}>
                    <button
                      type="button"
                      tabIndex={-1}
                      onMouseEnter={() => setActive(i)}
                      onClick={item.run}
                      className={`flex min-h-11 w-full cursor-pointer items-center gap-3 px-4 py-2 text-left transition-colors ${sel ? "bg-surface-2" : ""}`}
                    >
                      <item.icon size={16} className={`shrink-0 ${sel ? "text-cbm-white" : "text-cbm-gray-400"}`} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm ${sel ? "text-cbm-white" : "text-cbm-gray-200"}`}>{item.label}</span>
                        {item.sub && <span className="block truncate text-[12px] text-cbm-gray-400">{item.sub}</span>}
                      </span>
                      <span className={`shrink-0 text-[10px] font-medium uppercase tracking-[0.22em] ${sel ? "text-cbm-gray-200" : "text-cbm-gray-400"}`}>{item.hint}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

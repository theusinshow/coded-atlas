"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { requestCaseCopyAction } from "@/app/actions/cases";
import { renameDocumentAction, renderCanvasAction, saveCanvasAction } from "@/app/actions/studio";
import { newCaseSection, type CaseContent, type CaseSection, type CaseSectionType } from "@/src/core/case/case-document";
import { resolveTokens } from "@/src/core/creative/tokens";
import type { VisualProfile } from "@/src/core/creative/visual-profile";
import { CaseView } from "@/src/render/case-view";
import { assetFileUrl } from "@/components/atlas/asset-image";
import { JobFollower } from "@/components/atlas/job-follower";
import { AssetPicker } from "@/components/create/asset-picker";
import { STYLE_MODES, type StudioAsset } from "@/components/create/types";
import { FIELD_LABEL, Section, Segmented, TextField } from "@/components/studio/fields";
import { newLayerId } from "@/components/studio/layer-factory";

export interface CaseOutputOption {
  id: string;
  label: string;
  width: number | null;
  height: number | null;
}

interface Props {
  documentId: string;
  name: string;
  project: { slug: string; name: string };
  initialContent: CaseContent;
  initialRevision: number;
  assets: StudioAsset[];
  outputs: CaseOutputOption[];
  profiles: Record<number, VisualProfile>;
  brainEnabled: boolean;
}

type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";
const SAVE_LABEL: Record<SaveState, string> = { saved: "Salvo", dirty: "Alterado", saving: "Salvando…", error: "Falha ao salvar", conflict: "Conflito — recarregue" };
const TYPE_LABEL: Record<CaseSectionType, string> = { text: "Texto", image: "Imagem", gallery: "Galeria", piece: "Peça do Atlas", identity: "Identidade", facts: "Ficha técnica" };
const outputUrl = (id: string) => `/api/atlas/outputs/${id}/file`;

function summary(section: CaseSection): string {
  switch (section.type) {
    case "text":
      return section.heading || "Texto";
    case "identity":
      return section.heading;
    case "facts":
      return `${section.items.length} item(ns)`;
    case "gallery":
      return `${section.assetIds.length} imagem(ns)`;
    default:
      return section.caption || TYPE_LABEL[section.type];
  }
}

/** Editor do case: seções à esquerda, página ao vivo no centro, inspetor à direita. */
export function CaseEditor({ documentId, name: initialName, project, initialContent, initialRevision, assets, outputs, profiles, brainEnabled }: Props) {
  const [content, setContent] = useState(initialContent);
  const [past, setPast] = useState<CaseContent[]>([]);
  const [future, setFuture] = useState<CaseContent[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(initialName);
  const [jobId, setJobId] = useState<string | null>(null);
  const [copyJob, setCopyJob] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [formats, setFormats] = useState<("zip" | "pdf" | "png")[]>(["zip", "pdf"]);
  const [pending, start] = useTransition();
  const revision = useRef(initialRevision);
  const latest = useRef(content);
  latest.current = content;
  const lastKey = useRef<{ key: string; at: number } | null>(null);

  const profile = content.style.profileRevision ? (profiles[content.style.profileRevision] ?? null) : null;
  const tokens = useMemo(() => resolveTokens(profile, content.style.mode, content.style.primary ? { primary: content.style.primary } : {}), [profile, content.style.mode, content.style.primary]);

  /** Mudança com undo (mesma chave em <800 ms = um passo só, como no Studio). */
  const change = useCallback((next: (c: CaseContent) => CaseContent, key?: string) => {
    // Estado atual pelo ref (mudanças seguidas antes do re-render continuam corretas).
    const current = latest.current;
    const updated = next(current);
    if (updated === current) return;
    const now = Date.now();
    const same = key && lastKey.current?.key === key && now - lastKey.current.at < 800;
    lastKey.current = key ? { key, at: now } : null;
    if (!same) setPast((p) => [...p.slice(-99), current]);
    setFuture([]);
    latest.current = updated;
    setContent(updated);
    setSaveState((s) => (s === "conflict" ? s : "dirty"));
  }, []);

  const undo = () => {
    const prev = past.at(-1);
    if (!prev) return;
    setFuture((f) => [content, ...f]);
    setPast((p) => p.slice(0, -1));
    setContent(prev);
    setSaveState("dirty");
  };
  const redo = () => {
    const [next, ...rest] = future;
    if (!next) return;
    setPast((p) => [...p, content]);
    setFuture(rest);
    setContent(next);
    setSaveState("dirty");
  };

  // Autosave com debounce (revisões coalescidas no servidor).
  useEffect(() => {
    if (saveState !== "dirty") return;
    const timer = setTimeout(async () => {
      const snapshot = latest.current;
      setSaveState("saving");
      const result = await saveCanvasAction(documentId, revision.current, snapshot);
      if (result.ok) {
        revision.current = result.revision;
        setSaveState(latest.current === snapshot ? "saved" : "dirty");
        setError(null);
      } else {
        setSaveState(result.conflict ? "conflict" : "error");
        setError(result.error);
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [content, saveState, documentId]);

  const sections = content.sections;
  const current = sections.find((s) => s.id === selected) ?? null;
  const setSection = (id: string, patch: Partial<CaseSection>, key?: string) =>
    change((c) => ({ ...c, sections: c.sections.map((s) => (s.id === id ? ({ ...s, ...patch } as CaseSection) : s)) }), key ? `${id}:${key}` : undefined);
  const move = (index: number, dir: -1 | 1) =>
    change((c) => {
      const to = index + dir;
      if (to < 0 || to >= c.sections.length) return c;
      const list = [...c.sections];
      const [item] = list.splice(index, 1);
      list.splice(to, 0, item);
      return { ...c, sections: list };
    });
  const add = (type: CaseSectionType) => {
    const images = assets.filter((a) => a.mimeType.startsWith("image/"));
    let section: CaseSection;
    if (type === "image") section = { id: newLayerId(), type, assetId: images[0]?.id ?? "", caption: "", frame: "browser" };
    else if (type === "gallery") section = { id: newLayerId(), type, assetIds: images.slice(0, 2).map((a) => a.id), caption: "" };
    else if (type === "piece") section = { id: newLayerId(), type, outputId: outputs[0]?.id ?? "", caption: "" };
    else section = newCaseSection(type);
    if ((type === "image" || type === "gallery") && images.length === 0) return setError("Sem imagens no projeto.");
    if (type === "piece" && outputs.length === 0) return setError("Renderize alguma peça do projeto antes (Criar/Studio).");
    const at = current ? sections.findIndex((s) => s.id === current.id) + 1 : sections.length;
    change((c) => ({ ...c, sections: [...c.sections.slice(0, at), section, ...c.sections.slice(at)] }));
    setSelected(section.id);
  };

  function exportCase() {
    start(async () => {
      setError(null);
      const snapshot = latest.current;
      const result = await renderCanvasAction(documentId, revision.current, snapshot, formats);
      if (!result.ok) {
        setError(result.error);
        if (result.conflict) setSaveState("conflict");
        return;
      }
      revision.current = result.revision;
      setSaveState(latest.current === snapshot ? "saved" : "dirty");
      setMenu(false);
      if (result.jobId) setJobId(result.jobId);
    });
  }

  const emptyTexts = sections.filter((s) => s.type === "text" && !s.body.trim()).length;
  const btn = "h-8 px-3 border border-line text-[12px] text-zinc-300 hover:border-zinc-500 hover:text-zinc-50 disabled:opacity-30";

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-base text-zinc-100" data-case-editor>
      <header className="h-12 shrink-0 flex items-center gap-3 border-b border-line px-3">
        <Link href={`/projects/${project.slug}/cases`} className="text-[12px] text-zinc-500 hover:text-zinc-100 whitespace-nowrap">
          ← {project.name}
        </Link>
        <span className="text-zinc-700">/</span>
        <input
          aria-label="Nome do case"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== initialName && void renameDocumentAction(documentId, name.trim())}
          className="min-w-0 w-64 bg-transparent text-[13px] px-1.5 h-8 border border-transparent hover:border-line focus:border-accent focus:outline-none"
        />
        <span className={`text-[11px] font-mono ${saveState === "error" || saveState === "conflict" ? "text-bad" : "text-zinc-500"}`} data-save-state={saveState}>
          {SAVE_LABEL[saveState]}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" className={btn} disabled={!past.length} onClick={undo} aria-label="Desfazer">
            ↶
          </button>
          <button type="button" className={btn} disabled={!future.length} onClick={redo} aria-label="Refazer">
            ↷
          </button>
          {brainEnabled && (
            <button
              type="button"
              className={btn}
              disabled={pending || emptyTexts === 0 || saveState !== "saved"}
              title={emptyTexts ? `Escreve os ${emptyTexts} trecho(s) vazio(s) com os dados do projeto — nada já escrito é alterado.` : "Todos os trechos já têm texto."}
              onClick={() =>
                start(async () => {
                  const result = await requestCaseCopyAction(documentId);
                  if (result.ok) setCopyJob(result.jobId);
                  else setError(result.error);
                })
              }
            >
              Escrever com o Atlas Brain
            </button>
          )}
          <div className="relative">
            <button type="button" className="h-8 px-4 bg-accent text-zinc-950 text-[12px] font-medium hover:bg-accent-bright" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
              Exportar
            </button>
            {menu && (
              <div className="absolute right-0 top-full mt-1 w-72 border border-line bg-surface shadow-2xl z-20 p-3 space-y-3" role="dialog" aria-label="Exportar case">
                {(
                  [
                    ["zip", "Página web (ZIP com index.html)"],
                    ["pdf", "PDF paginado"],
                    ["png", "Módulos PNG 1400 px (Behance)"],
                  ] as const
                ).map(([f, label]) => (
                  <label key={f} className="flex items-center gap-2 text-[12px] text-zinc-300">
                    <input type="checkbox" checked={formats.includes(f)} onChange={(e) => setFormats((cur) => (e.target.checked ? [...cur, f] : cur.filter((x) => x !== f)))} />
                    {label}
                  </label>
                ))}
                <p className="text-[11px] text-zinc-500">Trechos de texto vazios não entram na exportação.</p>
                <button type="button" disabled={pending || formats.length === 0} onClick={exportCase} className="w-full h-8 bg-accent text-zinc-950 text-[12px] font-medium disabled:opacity-40">
                  Exportar agora
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-64 shrink-0 border-r border-line flex flex-col min-h-0" aria-label="Seções do case">
          <div className="p-3 border-b border-line">
            <label htmlFor="add-section" className={FIELD_LABEL}>
              Adicionar seção
            </label>
            <select id="add-section" value="" onChange={(e) => e.target.value && add(e.target.value as CaseSectionType)} className="w-full h-8 bg-surface-2 border border-line text-[12px] px-2">
              <option value="">Escolher…</option>
              {(Object.keys(TYPE_LABEL) as CaseSectionType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <button type="button" onClick={() => setSelected(null)} className={`text-left px-3 py-2 text-[12px] border-b border-line ${selected === null ? "bg-surface-2 text-zinc-50" : "text-zinc-400 hover:bg-surface"}`}>
            Capa e dados do case
          </button>
          <ol className="flex-1 overflow-y-auto" aria-label="Seções">
            {sections.map((s, i) => (
              <li key={s.id} data-case-row={s.type} className={`group flex items-center gap-2 px-3 h-9 text-[12px] cursor-pointer ${selected === s.id ? "bg-surface-2 text-zinc-50" : "text-zinc-400 hover:bg-surface"}`} onClick={() => setSelected(s.id)}>
                <span className="w-16 shrink-0 text-[10px] font-mono uppercase text-zinc-600">{TYPE_LABEL[s.type].split(" ")[0]}</span>
                <span className={`flex-1 truncate ${s.type === "text" && !s.body.trim() ? "italic text-zinc-600" : ""}`}>{summary(s)}</span>
                <span className="hidden group-hover:flex gap-1">
                  <button type="button" aria-label="Subir" onClick={(e) => (e.stopPropagation(), move(i, -1))} className="text-zinc-500 hover:text-zinc-100">
                    ↑
                  </button>
                  <button type="button" aria-label="Descer" onClick={(e) => (e.stopPropagation(), move(i, 1))} className="text-zinc-500 hover:text-zinc-100">
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label="Remover seção"
                    onClick={(e) => {
                      e.stopPropagation();
                      change((c) => ({ ...c, sections: c.sections.filter((x) => x.id !== s.id) }));
                      if (selected === s.id) setSelected(null);
                    }}
                    className="text-zinc-500 hover:text-bad"
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ol>
        </aside>

        <main
          className="flex-1 min-w-0 overflow-y-auto bg-[#08090b]"
          onClick={(e) => {
            const el = (e.target as HTMLElement).closest("[data-case-section]");
            const id = el?.getAttribute("data-case-section");
            if (id && sections.some((s) => s.id === id)) setSelected(id);
            else if (id === "hero") setSelected(null);
          }}
        >
          <div className="mx-auto max-w-[1400px] shadow-2xl">
            <CaseView content={content} tokens={tokens} mode="edit" selectedId={selected} resolveAsset={(id) => (id ? assetFileUrl(id) : null)} resolveOutput={(id) => (id ? outputUrl(id) : null)} />
          </div>
        </main>

        <aside className="w-80 shrink-0 border-l border-line overflow-y-auto" aria-label="Inspetor do case">
          {current ? (
            <SectionInspector section={current} assets={assets} outputs={outputs} onChange={(patch, key) => setSection(current.id, patch, key)} />
          ) : (
            <CaseMetaInspector content={content} assets={assets} onChange={change} />
          )}
          {error && <p className="px-4 py-3 text-[12px] text-bad">{error}</p>}
          {copyJob && (
            <div className="p-4 space-y-2">
              <JobFollower key={copyJob} jobId={copyJob} onDone={(status) => status === "completed" && window.location.reload()} />
            </div>
          )}
          {jobId && (
            <div className="p-4 space-y-2">
              <JobFollower key={jobId} jobId={jobId} />
              <Link href={`/projects/${project.slug}/publish`} className="text-[11px] text-accent">
                Ver em Publicar →
              </Link>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function SectionInspector({ section, assets, outputs, onChange }: { section: CaseSection; assets: StudioAsset[]; outputs: CaseOutputOption[]; onChange: (patch: Partial<CaseSection>, key?: string) => void }) {
  const images = assets.filter((a) => a.mimeType.startsWith("image/"));
  const area = "w-full bg-surface-2 border border-line text-zinc-100 text-[12px] p-2 focus:outline-none focus:border-accent";
  return (
    <Section title={TYPE_LABEL[section.type]}>
      {"heading" in section && <TextField label="Título" value={section.heading} maxLength={120} onChange={(v) => onChange({ heading: v }, "heading")} />}
      {section.type === "text" && (
        <div>
          <label htmlFor="case-body" className={FIELD_LABEL}>
            Texto (linha em branco = novo parágrafo)
          </label>
          <textarea id="case-body" rows={12} maxLength={4000} value={section.body} onChange={(e) => onChange({ body: e.target.value }, "body")} className={area} placeholder="Escreva com fatos do projeto. Vazio não é publicado." />
        </div>
      )}
      {"caption" in section && <TextField label="Legenda" value={section.caption} maxLength={240} onChange={(v) => onChange({ caption: v }, "caption")} />}
      {section.type === "image" && (
        <>
          <Segmented label="Moldura" value={section.frame} options={[{ id: "browser", label: "Navegador" }, { id: "phone", label: "Celular" }, { id: "none", label: "Nenhuma" }]} onChange={(frame) => onChange({ frame })} />
          <AssetPicker assets={images} value={section.assetId} columns={2} onPick={(a) => onChange({ assetId: a.id })} />
        </>
      )}
      {section.type === "gallery" && (
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-500">Clique para incluir/remover ({section.assetIds.length}/12).</p>
          <AssetPicker
            assets={images}
            value={null}
            columns={2}
            onPick={(a) => {
              const has = section.assetIds.includes(a.id);
              const next = has ? section.assetIds.filter((id) => id !== a.id) : [...section.assetIds, a.id].slice(0, 12);
              if (next.length > 0) onChange({ assetIds: next });
            }}
          />
        </div>
      )}
      {section.type === "piece" && (
        <div>
          <label htmlFor="case-piece" className={FIELD_LABEL}>
            Peça renderizada
          </label>
          <select id="case-piece" value={section.outputId} onChange={(e) => onChange({ outputId: e.target.value })} className="w-full h-8 bg-surface-2 border border-line text-[12px] px-2">
            {outputs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {section.type === "facts" && (
        <div className="space-y-2">
          {section.items.map((item, i) => (
            <div key={i} className="grid grid-cols-[1fr_1.4fr_auto] gap-1.5">
              <input aria-label={`Rótulo ${i + 1}`} value={item.label} maxLength={60} onChange={(e) => onChange({ items: section.items.map((x, j) => (j === i ? { ...x, label: e.target.value || " " } : x)) }, `fact-l-${i}`)} className="h-8 bg-surface-2 border border-line px-2 text-[12px]" />
              <input aria-label={`Valor ${i + 1}`} value={item.value} maxLength={160} onChange={(e) => onChange({ items: section.items.map((x, j) => (j === i ? { ...x, value: e.target.value || " " } : x)) }, `fact-v-${i}`)} className="h-8 bg-surface-2 border border-line px-2 text-[12px]" />
              <button type="button" aria-label="Remover item" onClick={() => onChange({ items: section.items.filter((_, j) => j !== i) })} className="text-zinc-500 hover:text-bad px-1">
                ×
              </button>
            </div>
          ))}
          {section.items.length < 12 && (
            <button type="button" onClick={() => onChange({ items: [...section.items, { label: "Item", value: "—" }] })} className="text-[11px] text-accent">
              + item
            </button>
          )}
        </div>
      )}
      {section.type === "identity" && <p className="text-[11px] text-zinc-500">Mostra a paleta e as fontes da identidade congelada no case.</p>}
    </Section>
  );
}

function CaseMetaInspector({ content, assets, onChange }: { content: CaseContent; assets: StudioAsset[]; onChange: (next: (c: CaseContent) => CaseContent, key?: string) => void }) {
  const meta = content.case;
  const set = (patch: Partial<CaseContent["case"]>, key: string) => onChange((c) => ({ ...c, case: { ...c.case, ...patch } }), `meta:${key}`);
  return (
    <>
      <Section title="Capa e dados">
        <TextField label="Título" value={meta.title} maxLength={120} onChange={(v) => v.trim() && set({ title: v }, "title")} />
        <div>
          <label htmlFor="case-subtitle" className={FIELD_LABEL}>
            Subtítulo
          </label>
          <textarea id="case-subtitle" rows={3} maxLength={240} value={meta.subtitle} onChange={(e) => set({ subtitle: e.target.value }, "subtitle")} className="w-full bg-surface-2 border border-line text-[12px] p-2" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <TextField label="Categoria" value={meta.category} maxLength={120} onChange={(v) => set({ category: v }, "category")} />
          <TextField label="Ano" value={meta.year} maxLength={12} onChange={(v) => set({ year: v }, "year")} />
          <TextField label="Cliente" value={meta.client} maxLength={120} onChange={(v) => set({ client: v }, "client")} />
          <TextField label="URL" value={meta.url} maxLength={300} onChange={(v) => set({ url: v }, "url")} />
        </div>
        <div>
          <span className={FIELD_LABEL}>Imagem de capa</span>
          <AssetPicker assets={assets.filter((a) => a.mimeType.startsWith("image/"))} value={meta.coverAssetId} columns={2} onPick={(a) => set({ coverAssetId: a.id }, "cover")} onClear={() => set({ coverAssetId: null }, "cover")} />
        </div>
      </Section>
      <Section title="Estilo">
        <Segmented label="Modo" value={content.style.mode} options={STYLE_MODES.map((m) => ({ id: m.id, label: m.label, title: m.hint }))} onChange={(mode) => onChange((c) => ({ ...c, style: { ...c.style, mode } }))} />
      </Section>
    </>
  );
}

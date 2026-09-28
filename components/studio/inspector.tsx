"use client";
import { useEffect, useRef, useState } from "react";
import type { StyleTokens } from "@/src/core/creative/tokens";
import type { CanvasContent } from "@/src/core/documents/creative-document";
import type { Layer } from "@/src/core/documents/layer";
import { duplicateLayer, findLayer, removeLayer, reorderLayer, ungroupLayer, updateLayer, type LayerPatch, type Reorder } from "@/src/core/documents/layer-tree";
import type { VisualProfile } from "@/src/core/creative/visual-profile";
import { AssetThumb } from "@/components/atlas/asset-image";
import { AssetPicker } from "@/components/create/asset-picker";
import { STYLE_MODES, type StudioAsset } from "@/components/create/types";
import { ColorField, FIELD_LABEL, NumberField, RangeField, Section, Segmented, TextField, Toggle } from "./fields";
import { LAYER_TYPE_LABEL, newLayerId } from "./layer-factory";
import { useStudio, useStudioApi } from "./store";

const SHADOWS = [
  { id: "none", label: "Nenhuma" },
  { id: "soft", label: "Suave" },
  { id: "device", label: "Device" },
  { id: "deep", label: "Profunda" },
] as const;

function useLayerEditor(id: string) {
  const apply = useStudio((s) => s.apply);
  return (patch: LayerPatch, field: string) =>
    apply((c) => ({ ...c, artboard: { ...c.artboard, layers: updateLayer(c.artboard.layers, id, patch) } }), `field:${id}:${field}`);
}

function ImageField({ label, assetId, assets, onChange }: { label: string; assetId: string | null; assets: StudioAsset[]; onChange: (id: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const current = assets.find((a) => a.id === assetId);
  return (
    <div className="space-y-2">
      <span className={FIELD_LABEL}>{label}</span>
      <div className="flex items-center gap-2">
        <AssetThumb id={current?.id} alt={current?.label ?? label} width={320} className="w-16 aspect-[16/10] border border-line shrink-0" />
        <p className="flex-1 min-w-0 text-[11px] text-zinc-500 truncate">{current ? (current.label ?? current.kind) : "sem imagem"}</p>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 hover:text-accent">
          {open ? "Fechar" : "Trocar"}
        </button>
      </div>
      {open && (
        <AssetPicker
          assets={assets}
          value={assetId}
          columns={2}
          onPick={(a) => {
            onChange(a.id);
            setOpen(false);
          }}
          onClear={() => {
            onChange(null);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function LayerActions({ layer, canUngroup }: { layer: Layer; canUngroup: boolean }) {
  const api = useStudioApi();
  const run = (change: (layers: Layer[]) => Layer[]) => api.getState().apply((c) => ({ ...c, artboard: { ...c.artboard, layers: change(c.artboard.layers) } }));
  const reorder = (move: Reorder) => run((ls) => reorderLayer(ls, layer.id, move));
  const btn = "h-7 px-2 border border-line text-[11px] text-zinc-300 hover:border-zinc-500 hover:text-zinc-50 disabled:opacity-30";
  return (
    <div className="flex flex-wrap gap-1">
      <button type="button" className={btn} onClick={() => reorder("front")} title="Trazer para frente (Ctrl+Shift+])">
        Frente
      </button>
      <button type="button" className={btn} onClick={() => reorder("forward")} title="Avançar (Ctrl+])">
        ↑
      </button>
      <button type="button" className={btn} onClick={() => reorder("backward")} title="Recuar (Ctrl+[)">
        ↓
      </button>
      <button type="button" className={btn} onClick={() => reorder("back")} title="Enviar para trás (Ctrl+Shift+[)">
        Trás
      </button>
      <button
        type="button"
        className={btn}
        title="Duplicar (Ctrl+D)"
        onClick={() => {
          const { content, apply, select } = api.getState();
          const { layers, newId } = duplicateLayer(content.artboard.layers, layer.id, newLayerId);
          apply((c) => ({ ...c, artboard: { ...c.artboard, layers } }));
          if (newId) select(newId);
        }}
      >
        Duplicar
      </button>
      {layer.type === "group" && (
        <button type="button" className={btn} disabled={!canUngroup} title={canUngroup ? "Desagrupar" : "Grupo girado não pode ser desagrupado"} onClick={() => run((ls) => ungroupLayer(ls, layer.id))}>
          Desagrupar
        </button>
      )}
      <button
        type="button"
        className={`${btn} hover:!border-bad hover:!text-bad`}
        title="Excluir (Delete)"
        onClick={() => {
          run((ls) => removeLayer(ls, layer.id));
          api.getState().select(null);
        }}
      >
        Excluir
      </button>
    </div>
  );
}

function LayerInspector({ layer, tokens, assets }: { layer: Layer; tokens: StyleTokens; assets: StudioAsset[] }) {
  const edit = useLayerEditor(layer.id);
  const focusNonce = useStudio((s) => s.focusTextNonce);
  const textRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focusNonce > 0) textRef.current?.focus();
  }, [focusNonce]);

  return (
    <>
      <Section title={LAYER_TYPE_LABEL[layer.type]} aside={<span className="text-[10px] font-mono text-zinc-600">{layer.id.slice(0, 8)}</span>}>
        <LayerActions layer={layer} canUngroup={layer.rotation === 0} />
        <TextField label="Nome" value={layer.name ?? ""} maxLength={80} onChange={(v) => edit({ name: v || undefined }, "name")} />
      </Section>

      <Section title="Posição e tamanho">
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="X" value={layer.x} onChange={(v) => edit({ x: v }, "x")} min={-20000} max={20000} />
          <NumberField label="Y" value={layer.y} onChange={(v) => edit({ y: v }, "y")} min={-20000} max={20000} />
          <NumberField label="Largura" value={layer.width} onChange={(v) => edit({ width: v }, "w")} min={0} max={20000} />
          <NumberField label="Altura" value={layer.height} onChange={(v) => edit({ height: v }, "h")} min={0} max={20000} />
          <NumberField label="Rotação" value={layer.rotation} onChange={(v) => edit({ rotation: v }, "rot")} min={-360} max={360} suffix="°" />
          <NumberField label="Raio" value={layer.radius} onChange={(v) => edit({ radius: v }, "radius")} min={0} max={2000} />
        </div>
        <RangeField label="Opacidade" value={layer.opacity} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => edit({ opacity: v }, "opacity")} />
        {layer.type !== "text" && layer.type !== "group" && <Segmented label="Sombra" value={layer.shadow} options={SHADOWS} onChange={(v) => edit({ shadow: v }, "shadow")} />}
        <RangeField label="Desfoque" value={layer.blur} min={0} max={40} step={1} format={(v) => `${v}px`} onChange={(v) => edit({ blur: v }, "blur")} />
      </Section>

      {layer.type === "text" && (
        <Section title="Texto">
          <div>
            <label htmlFor="layer-text" className={FIELD_LABEL}>
              Conteúdo
            </label>
            <textarea
              id="layer-text"
              ref={textRef}
              rows={3}
              maxLength={2000}
              value={layer.text}
              onChange={(e) => edit({ text: e.target.value }, "text")}
              className="w-full bg-surface-2 border border-line text-zinc-100 text-[12px] p-2 focus:outline-none focus:border-accent"
            />
          </div>
          <Segmented label="Fonte" value={layer.font} options={[{ id: "display", label: "Título" }, { id: "body", label: "Texto" }, { id: "mono", label: "Mono" }]} onChange={(v) => edit({ font: v }, "font")} />
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Tamanho" value={layer.size} onChange={(v) => edit({ size: v }, "size")} min={4} max={800} />
            <NumberField label="Entrelinha" value={layer.lineHeight} onChange={(v) => edit({ lineHeight: v }, "lh")} min={0.6} max={3} step={0.05} />
            <NumberField label="Espaçamento" value={layer.letterSpacing} onChange={(v) => edit({ letterSpacing: v }, "ls")} min={-0.2} max={1} step={0.01} suffix="em" />
            <NumberField label="Máx. linhas" value={layer.maxLines ?? 0} onChange={(v) => edit({ maxLines: v >= 1 ? Math.round(v) : undefined }, "ml")} min={0} max={40} />
          </div>
          <Segmented
            label="Peso"
            value={layer.weight}
            options={[{ id: 400, label: "400" }, { id: 500, label: "500" }, { id: 600, label: "600" }, { id: 700, label: "700" }]}
            onChange={(v) => edit({ weight: v }, "weight")}
          />
          <Segmented label="Alinhamento" value={layer.align} options={[{ id: "left", label: "Esq." }, { id: "center", label: "Centro" }, { id: "right", label: "Dir." }]} onChange={(v) => edit({ align: v }, "align")} />
          <ColorField label="Cor" value={layer.color} tokens={tokens} onChange={(v) => v && edit({ color: v }, "color")} />
          <Toggle label="Caixa alta" checked={layer.uppercase} onChange={(v) => edit({ uppercase: v }, "upper")} />
        </Section>
      )}

      {layer.type === "shape" && (
        <Section title="Forma">
          <Segmented label="Tipo" value={layer.shape} options={[{ id: "rect", label: "Retângulo" }, { id: "ellipse", label: "Elipse" }, { id: "line", label: "Linha" }]} onChange={(v) => edit({ shape: v }, "shape")} />
          <ColorField label="Preenchimento" value={layer.fill} tokens={tokens} nullable onChange={(v) => edit({ fill: v }, "fill")} />
          <ColorField label="Contorno" value={layer.stroke} tokens={tokens} nullable onChange={(v) => edit({ stroke: v, strokeWidth: v && layer.strokeWidth === 0 ? 2 : layer.strokeWidth }, "stroke")} />
          {layer.stroke && <NumberField label="Espessura do contorno" value={layer.strokeWidth} onChange={(v) => edit({ strokeWidth: v }, "sw")} min={0} max={100} />}
        </Section>
      )}

      {(layer.type === "asset" || layer.type === "device" || layer.type === "browser") && (
        <Section title={layer.type === "asset" ? "Imagem" : layer.type === "device" ? "Celular" : "Navegador"}>
          <ImageField label="Imagem" assetId={layer.assetId} assets={assets} onChange={(id) => edit({ assetId: id }, "asset")} />
          {layer.type === "asset" && <Segmented label="Encaixe" value={layer.fit} options={[{ id: "cover", label: "Preencher" }, { id: "contain", label: "Conter" }]} onChange={(v) => edit({ fit: v }, "fit")} />}
          <RangeField label="Foco vertical" value={layer.focusY} min={0} max={1} step={0.01} format={(v) => (v === 0 ? "topo" : v === 1 ? "base" : `${Math.round(v * 100)}%`)} onChange={(v) => edit({ focusY: v }, "focus")} />
          {layer.type === "device" && <Segmented label="Moldura" value={layer.frame} options={[{ id: "dark", label: "Escura" }, { id: "light", label: "Clara" }]} onChange={(v) => edit({ frame: v }, "frame")} />}
          {layer.type === "browser" && (
            <>
              <Segmented label="Tema" value={layer.theme} options={[{ id: "dark", label: "Escuro" }, { id: "light", label: "Claro" }]} onChange={(v) => edit({ theme: v }, "theme")} />
              <TextField label="Endereço" value={layer.url ?? ""} maxLength={200} onChange={(v) => edit({ url: v || undefined }, "url")} />
            </>
          )}
        </Section>
      )}
    </>
  );
}

function DocumentInspector({ tokens, profiles, latestRevision }: { tokens: StyleTokens; profiles: Record<number, VisualProfile>; latestRevision: number | null }) {
  const content = useStudio((s) => s.content);
  const apply = useStudio((s) => s.apply);
  const set = (change: (c: CanvasContent) => CanvasContent, key: string) => apply(change, `doc:${key}`);
  const { artboard, style } = content;
  const profile = style.profileRevision ? profiles[style.profileRevision] : null;
  return (
    <>
      <Section title="Documento">
        <p className="text-[12px] text-zinc-400 font-mono tabular-nums">
          {artboard.width}×{artboard.height}px · {artboard.layers.length} camada(s)
        </p>
        <ColorField label="Fundo" value={artboard.background.fill} tokens={tokens} onChange={(v) => v && set((c) => ({ ...c, artboard: { ...c.artboard, background: { ...c.artboard.background, fill: v } } }), "bg")} />
        <Segmented
          label="Textura"
          value={artboard.background.pattern}
          options={[{ id: "none", label: "Nenhuma" }, { id: "grid", label: "Grade" }, { id: "dots", label: "Pontos" }]}
          onChange={(v) => set((c) => ({ ...c, artboard: { ...c.artboard, background: { ...c.artboard.background, pattern: v } } }), "pattern")}
        />
      </Section>
      <Section title="Estilo">
        <Segmented label="Modo" value={style.mode} options={STYLE_MODES.map((m) => ({ id: m.id, label: m.label, title: m.hint }))} onChange={(v) => set((c) => ({ ...c, style: { ...c.style, mode: v } }), "mode")} />
        <div>
          <span className={FIELD_LABEL}>Cor de destaque</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Cor de destaque"
              value={style.primary ?? tokens.colors.primary}
              onChange={(e) => set((c) => ({ ...c, style: { ...c.style, primary: e.target.value.toLowerCase() } }), "primary")}
              className="h-7 w-10 bg-transparent border border-line cursor-pointer"
            />
            <span className="text-[11px] font-mono text-zinc-400">{style.primary ?? `${tokens.colors.primary} (auto)`}</span>
            {style.primary && (
              <button
                type="button"
                className="ml-auto text-[11px] text-zinc-500 hover:text-zinc-200"
                onClick={() => set((c) => ({ ...c, style: { mode: c.style.mode, profileRevision: c.style.profileRevision } }), "primary")}
              >
                Automática
              </button>
            )}
          </div>
        </div>
        <div className="text-[11px] text-zinc-500 space-y-1.5">
          <p>{profile ? `Identidade visual rev ${profile.revision} · ${profile.palette.length} cores · ${profile.fonts.slice(0, 2).join(", ") || "sem fontes"}` : "Sem identidade visual — usa a linguagem Coded by M."}</p>
          {latestRevision && latestRevision !== style.profileRevision && (
            <button type="button" className="text-accent hover:text-accent-bright" onClick={() => set((c) => ({ ...c, style: { ...c.style, profileRevision: latestRevision } }), "profile")}>
              Usar a identidade mais nova (rev {latestRevision})
            </button>
          )}
        </div>
      </Section>
      <Section title="Atalhos">
        <ul className="text-[11px] text-zinc-500 space-y-1 font-mono">
          <li>Ctrl+Z / Ctrl+Shift+Z — desfazer / refazer</li>
          <li>Setas — mover 1px (Shift: 10px)</li>
          <li>Ctrl+D — duplicar · Delete — excluir</li>
          <li>Ctrl+[ / ] — recuar / avançar</li>
          <li>Shift ao redimensionar — manter proporção</li>
          <li>Alt ao mover — sem ímã</li>
          <li>Duplo clique no texto — editar</li>
        </ul>
      </Section>
    </>
  );
}

export function Inspector({ tokens, assets, profiles, latestRevision }: { tokens: StyleTokens; assets: StudioAsset[]; profiles: Record<number, VisualProfile>; latestRevision: number | null }) {
  const selectedId = useStudio((s) => s.selectedId);
  const layers = useStudio((s) => s.content.artboard.layers);
  const found = selectedId ? findLayer(layers, selectedId) : null;
  return found ? <LayerInspector key={found.layer.id} layer={found.layer} tokens={tokens} assets={assets} /> : <DocumentInspector tokens={tokens} profiles={profiles} latestRevision={latestRevision} />;
}

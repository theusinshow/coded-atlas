"use client";
import { isMotion } from "@/src/core/documents/creative-document";
import type { Layer } from "@/src/core/documents/layer";
import { updatePage } from "@/src/core/documents/pages";
import { autoAnimate, type AnimationTrack, type Scene } from "@/src/core/motion/motion";
import { MOTION_PRESET_IDS, MOTION_PRESETS, type Easing, type MotionPresetId } from "@/src/core/motion/presets";
import { FIELD_LABEL, NumberField, RangeField, Section, Segmented } from "./fields";
import { newLayerId } from "./layer-factory";
import { activeScene, useStudio, useStudioApi } from "./store";

const EASINGS: { id: Easing; label: string }[] = [
  { id: "ease-out", label: "Suave" },
  { id: "ease-in-out", label: "Entra/sai" },
  { id: "spring", label: "Mola" },
  { id: "linear", label: "Linear" },
];

function useSceneEditor() {
  const api = useStudioApi();
  return (change: (scene: Scene) => Scene, key?: string) => {
    const { activePage, applyDoc } = api.getState();
    applyDoc((d) => (isMotion(d) ? updatePage(d, activePage, change) : d), { key: key ? `scene:${activePage}:${key}` : undefined, keepSelection: true });
  };
}

/** Animações da camada selecionada (só em vídeos): presets, atraso, duração e intensidade. */
export function LayerAnimationSection({ layer }: { layer: Layer }) {
  const scene = useStudio(activeScene);
  const editScene = useSceneEditor();
  if (!scene) return null;
  const tracks = scene.animations.filter((a) => a.layerId === layer.id);
  const available = MOTION_PRESET_IDS.filter((id) => MOTION_PRESETS[id].appliesTo.includes(layer.type));
  const setTrack = (id: string, patch: Partial<AnimationTrack>) =>
    editScene((s) => ({ ...s, animations: s.animations.map((a) => (a.id === id ? { ...a, ...patch } : a)) }), `${id}:${Object.keys(patch).join(",")}`);

  return (
    <Section title="Animação" aside={<span className="text-[10px] font-mono text-zinc-600">{tracks.length} preset(s)</span>}>
      {tracks.length === 0 && <p className="text-[11px] text-zinc-500">Parada nesta cena. Adicione um preset abaixo.</p>}
      <ul className="space-y-3">
        {tracks.map((track) => (
          <li key={track.id} className="border border-line p-2.5 space-y-2" data-track={track.preset}>
            <div className="flex items-center justify-between">
              <p className="text-[12px] text-zinc-100">{MOTION_PRESETS[track.preset].label}</p>
              <button type="button" className="text-[11px] text-zinc-500 hover:text-bad" onClick={() => editScene((s) => ({ ...s, animations: s.animations.filter((a) => a.id !== track.id) }))}>
                remover
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Atraso (ms)" value={track.delayMs} min={0} max={60000} step={50} onChange={(v) => setTrack(track.id, { delayMs: Math.round(v) })} />
              <NumberField label="Duração (ms)" value={track.durationMs} min={100} max={60000} step={50} onChange={(v) => setTrack(track.id, { durationMs: Math.round(v) })} />
            </div>
            <RangeField label="Intensidade" value={track.intensity} min={0} max={2} step={0.1} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setTrack(track.id, { intensity: v })} />
            <Segmented label="Curva" value={track.easing} options={EASINGS} onChange={(v) => setTrack(track.id, { easing: v })} />
          </li>
        ))}
      </ul>
      <div>
        <label htmlFor="add-preset" className={FIELD_LABEL}>
          Adicionar preset
        </label>
        <select
          id="add-preset"
          value=""
          onChange={(e) => {
            const preset = e.target.value as MotionPresetId;
            if (!preset) return;
            const def = MOTION_PRESETS[preset];
            editScene((s) => ({
              ...s,
              animations: [...s.animations, { id: newLayerId(), layerId: layer.id, preset, delayMs: 0, durationMs: def.kind === "scroll" ? Math.max(1000, s.durationMs - 800) : def.defaultDurationMs, easing: def.defaultEasing, intensity: 1 }],
            }));
          }}
          className="w-full h-8 bg-surface-2 border border-line text-zinc-100 text-[12px] px-2"
        >
          <option value="">Escolher…</option>
          {available.map((id) => (
            <option key={id} value={id}>
              {MOTION_PRESETS[id].label} — {MOTION_PRESETS[id].description}
            </option>
          ))}
        </select>
      </div>
    </Section>
  );
}

const TRANSITIONS: { id: Scene["transition"]["type"]; label: string }[] = [
  { id: "none", label: "Corte" },
  { id: "fade", label: "Dissolver" },
  { id: "slide", label: "Deslizar" },
  { id: "zoom", label: "Zoom" },
];

/** Cena ativa: duração, transição de entrada e animação automática. */
export function SceneSection() {
  const scene = useStudio(activeScene);
  const index = useStudio((s) => s.activePage);
  const editScene = useSceneEditor();
  if (!scene) return null;
  return (
    <Section title={`Cena ${index + 1}`}>
      <NumberField label="Duração (s)" value={scene.durationMs / 1000} min={0.5} max={30} step={0.5} onChange={(v) => editScene((s) => ({ ...s, durationMs: Math.round(Math.min(30, Math.max(0.5, v)) * 1000) }), "duration")} />
      <Segmented label="Transição de entrada" value={scene.transition.type} options={TRANSITIONS} onChange={(type) => editScene((s) => ({ ...s, transition: { type, durationMs: type === "none" ? 0 : s.transition.durationMs || 450 } }))} />
      {scene.transition.type !== "none" && (
        <NumberField label="Duração da transição (ms)" value={scene.transition.durationMs} min={100} max={3000} step={50} onChange={(v) => editScene((s) => ({ ...s, transition: { ...s.transition, durationMs: Math.round(v) } }), "transition")} />
      )}
      <button
        type="button"
        className="h-8 w-full border border-line text-[12px] text-zinc-300 hover:border-zinc-500 hover:text-zinc-50"
        onClick={() => editScene((s) => ({ ...s, animations: autoAnimate(s.artboard, s.durationMs) }))}
        title="Substitui as animações desta cena por presets escolhidos pelo tipo de cada camada"
      >
        Animar cena automaticamente
      </button>
      <p className="text-[11px] text-zinc-500">{scene.animations.length} animação(ões) nesta cena. Selecione uma camada para ajustar a dela.</p>
    </Section>
  );
}

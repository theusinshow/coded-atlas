"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, Wand2, X } from "lucide-react";
import { uploadAssetsAction } from "@/app/actions/projects";
import { isMotion, isPresentation } from "@/src/core/documents/creative-document";
import type { Layer } from "@/src/core/documents/layer";
import { updatePage } from "@/src/core/documents/pages";
import { autoAnimate, type AnimationTrack, type MotionContent, type Scene } from "@/src/core/motion/motion";
import type { StudioAsset } from "@/components/create/types";
import { plural } from "@/components/ui/format";
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

const SELECT = "w-full h-8 bg-surface-2 border border-line text-cbm-gray-100 text-[12px] px-2 focus:outline-none focus:border-accent";
const SECONDARY = "inline-flex h-8 w-full items-center justify-center gap-2 border border-line text-[12px] text-cbm-gray-200 transition-colors hover:border-cbm-gray-400 hover:text-cbm-white disabled:opacity-40 disabled:hover:border-line";

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
    <Section title="Animação" aside={tracks.length > 0 ? <span className="text-[12px] text-cbm-gray-400">{plural(tracks.length, "animação", "animações")}</span> : undefined}>
      {tracks.length === 0 && <p className="text-[12px] text-cbm-gray-400">Parada nesta cena. Escolha uma animação abaixo.</p>}
      <ul className="space-y-3">
        {tracks.map((track) => (
          <li key={track.id} className="border border-line p-2.5 space-y-2" data-track={track.preset}>
            <div className="flex items-center justify-between">
              <p className="text-[12px] text-cbm-gray-100">{MOTION_PRESETS[track.preset].label}</p>
              <button
                type="button"
                aria-label={`Remover ${MOTION_PRESETS[track.preset].label}`}
                title="Remover animação"
                className="grid h-6 w-6 place-items-center text-cbm-gray-400 hover:text-bad"
                onClick={() => editScene((s) => ({ ...s, animations: s.animations.filter((a) => a.id !== track.id) }))}
              >
                <X size={14} aria-hidden />
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
          className={SELECT}
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
        className={SECONDARY}
        onClick={() => editScene((s) => ({ ...s, animations: autoAnimate(s.artboard, s.durationMs) }))}
        title="Troca as animações desta cena por animações escolhidas pelo tipo de cada camada"
      >
        <Wand2 size={14} aria-hidden />
        Animar cena automaticamente
      </button>
      <p className="text-[12px] text-cbm-gray-400">
        {scene.animations.length === 0 ? "Nenhuma animação nesta cena." : `${plural(scene.animations.length, "animação", "animações")} nesta cena.`} Selecione uma camada para ajustar.
      </p>
    </Section>
  );
}

const AUDIO_ACCEPT = "audio/mpeg,audio/wav,audio/ogg,audio/mp4,.m4a";

/**
 * Enviar áudio sem sair do Studio: usa o mesmo upload do Material (tipo áudio),
 * atualiza a lista de áudios do projeto e já escolhe o novo como trilha.
 */
function AudioUpload({ projectId, label, onUploaded }: { projectId: string; label: string; onUploaded: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<{ error?: string; message?: string } | null>(null);
  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        accept={AUDIO_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const form = new FormData();
          form.append("kind", "audio");
          form.append("files", file);
          e.target.value = "";
          setStatus(null);
          start(async () => {
            const result = await uploadAssetsAction(projectId, null, form);
            if (result?.error) return setStatus({ error: result.error });
            // O upload não duplica arquivos: o mesmo áudio de novo não cria nada.
            if (result?.message?.startsWith("0 ")) return setStatus({ message: "Esse áudio já está no projeto — escolha na lista." });
            setStatus({ message: `${file.name} enviado.` });
            onUploaded();
            router.refresh();
          });
        }}
      />
      <button type="button" className={SECONDARY} disabled={pending} onClick={() => input.current?.click()}>
        <Upload size={14} aria-hidden />
        {pending ? "Enviando…" : label}
      </button>
      {status?.error && (
        <p role="alert" className="text-[12px] text-bad">
          {status.error}
        </p>
      )}
      {status?.message && <p className="text-[12px] text-cbm-gray-400">{status.message}</p>}
    </div>
  );
}

/** Trilha sonora básica do vídeo: um áudio do projeto, volume e fade-out no fim. */
export function SoundtrackSection({ audioAssets, projectId }: { audioAssets: StudioAsset[]; projectId: string }) {
  const doc = useStudio((s) => s.doc);
  const api = useStudioApi();
  // Depois de um envio, o áudio novo (que chega com o refresh) vira a trilha.
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!known.current) return;
    const fresh = audioAssets.find((a) => !known.current?.has(a.id));
    if (!fresh) return;
    known.current = null;
    api.getState().applyDoc((d) => (isMotion(d) ? { ...d, audio: { assetId: fresh.id, volume: d.audio?.volume ?? 0.8, fadeOutMs: d.audio?.fadeOutMs ?? 1200 } } : d), { keepSelection: true });
  }, [audioAssets, api]);

  if (!isMotion(doc)) return null;
  const audio = doc.audio ?? null;
  const set = (next: MotionContent["audio"], key?: string) => api.getState().applyDoc((d) => (isMotion(d) ? { ...d, audio: next } : d), { key: key ? `audio:${key}` : undefined, keepSelection: true });
  const rememberCurrent = () => {
    known.current = new Set(audioAssets.map((a) => a.id));
  };
  return (
    <Section title="Trilha sonora">
      {audioAssets.length === 0 ? (
        <>
          <p className="text-[12px] text-cbm-gray-400">Nenhum áudio no projeto. MP3, WAV, OGG ou M4A.</p>
          <AudioUpload projectId={projectId} label="Enviar áudio" onUploaded={rememberCurrent} />
        </>
      ) : (
        <>
          <div>
            <label htmlFor="soundtrack" className={FIELD_LABEL}>
              Áudio
            </label>
            <select
              id="soundtrack"
              value={audio?.assetId ?? ""}
              onChange={(e) => set(e.target.value ? { assetId: e.target.value, volume: audio?.volume ?? 0.8, fadeOutMs: audio?.fadeOutMs ?? 1200 } : null)}
              className={SELECT}
            >
              <option value="">Sem trilha (mudo)</option>
              {audioAssets.map((a, i) => (
                <option key={a.id} value={a.id}>
                  {a.label ?? a.metadata.originalName ?? `Áudio ${i + 1}`}
                </option>
              ))}
            </select>
          </div>
          {audio && (
            <>
              <RangeField label="Volume" value={audio.volume} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ ...audio, volume: v }, "volume")} />
              <NumberField label="Sumir no fim (ms)" value={audio.fadeOutMs} min={0} max={10000} step={100} onChange={(v) => set({ ...audio, fadeOutMs: Math.round(v) }, "fade")} />
            </>
          )}
          <AudioUpload projectId={projectId} label="Enviar outro áudio" onUploaded={rememberCurrent} />
        </>
      )}
    </Section>
  );
}

/** Notas do apresentador do slide ativo (vão para o PPTX). */
export function SlideNotesSection() {
  const doc = useStudio((s) => s.doc);
  const index = useStudio((s) => s.activePage);
  const api = useStudioApi();
  if (!isPresentation(doc)) return null;
  const slide = doc.slides[index];
  if (!slide) return null;
  return (
    <Section title={`Slide ${index + 1} · notas`}>
      <textarea
        aria-label="Notas do apresentador"
        rows={5}
        maxLength={2000}
        value={slide.notes}
        placeholder="O que falar neste slide (não aparece na imagem)."
        onChange={(e) => {
          const notes = e.target.value;
          api.getState().applyDoc((d) => (isPresentation(d) ? updatePage(d, index, (s) => ({ ...s, notes })) : d), { key: `notes:${index}`, keepSelection: true });
        }}
        className="w-full bg-surface-2 border border-line text-cbm-gray-100 text-[12px] p-2 placeholder:text-cbm-gray-400 focus:outline-none focus:border-accent"
      />
    </Section>
  );
}

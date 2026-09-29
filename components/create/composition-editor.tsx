"use client";
import { AnimatePresence, motion } from "motion/react";
import { Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { deleteInstanceAction, renderInstanceAction, saveInstanceAction, type InstancePatch } from "@/app/actions/create";
import { animateInstanceAction, materializeInstanceAction } from "@/app/actions/studio";
import type { Binding, CompositionDefinition, CompositionInstance, SlotDefinition } from "@/src/core/creative/composition";
import { FORMATS, type FormatId } from "@/src/core/creative/formats";
import type { StyleMode } from "@/src/core/creative/tokens";
import type { VisualProfile } from "@/src/core/creative/visual-profile";
import { AssetThumb } from "@/components/atlas/asset-image";
import { JobFollower } from "@/components/atlas/job-follower";
import { Button, FormError, INPUT_CLASS, LABEL_CLASS } from "@/components/ui/primitives";
import { assetTitle } from "@/components/ui/format";
import { DURATION, EASE_OUT } from "@/components/ui/motion";
import { lintArtboard } from "@/src/core/creative/guardrails";
import { CreativeIssues } from "@/components/creative/creative-issues";
import { ArtboardPreview } from "./artboard-preview";
import { AssetPicker } from "./asset-picker";
import { instanceDefinition, renderModel, STYLE_MODES, type StudioAsset } from "./types";

type RasterFormat = "png" | "jpg" | "webp";

interface Props {
  instance: CompositionInstance;
  assets: StudioAsset[];
  /** Revisão da identidade gravada na instância (snapshot rule). */
  profile: VisualProfile | null;
  /** Revisão mais nova, quando diferente da gravada. */
  latestProfile: VisualProfile | null;
}

interface Draft {
  name: string;
  formatId: FormatId;
  variant: string;
  styleMode: StyleMode;
  bindings: Record<string, Binding>;
  primary: string | undefined;
  refreshProfile: boolean;
}

function initialDraft(instance: CompositionInstance): Draft {
  return {
    name: instance.name,
    formatId: instance.formatId,
    variant: instance.variant,
    styleMode: instance.styleMode,
    bindings: instance.bindings,
    primary: instance.overrides.primary,
    refreshProfile: false,
  };
}

function toPatch(draft: Draft): InstancePatch {
  return {
    name: draft.name,
    formatId: draft.formatId,
    variant: draft.variant,
    styleMode: draft.styleMode,
    bindings: draft.bindings,
    overrides: draft.primary ? { primary: draft.primary } : {},
    refreshProfile: draft.refreshProfile || undefined,
  };
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string; hint?: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className={LABEL_CLASS}>{label}</legend>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            title={o.hint}
            onClick={() => onChange(o.id)}
            className={`h-10 sm:h-8 px-3 text-[12px] border transition-colors ${
              value === o.id ? "border-cbm-white text-cbm-white" : "border-line text-cbm-gray-400 hover:text-cbm-white hover:border-cbm-gray-400"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function AssetSlotField({ slot, value, assets, onChange }: { slot: SlotDefinition; value: string | null; assets: StudioAsset[]; onChange: (id: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const current = assets.find((a) => a.id === value);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <AssetThumb id={current?.id} alt={current ? assetTitle(current) : slot.label} width={320} className="w-20 aspect-[16/10] border border-line shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-cbm-gray-200 truncate">
            {slot.label}
            {slot.required && <span className="text-cbm-gray-400"> (obrigatório)</span>}
          </p>
          <p className="text-[12px] text-cbm-gray-400 truncate">{current ? assetTitle(current) : "Nenhuma imagem"}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="h-10 sm:h-8 px-3 border border-line text-[12px] text-cbm-gray-200 hover:border-cbm-gray-400 hover:text-cbm-white transition-colors shrink-0"
          aria-expanded={open}
          aria-label={open ? `Fechar a escolha de ${slot.label}` : `Trocar ${slot.label}`}
        >
          {open ? "Fechar" : "Trocar"}
        </button>
      </div>
      {open && (
        <div className="border border-line bg-surface p-2">
          <AssetPicker
            assets={assets}
            value={value}
            onPick={(a) => {
              onChange(a.id);
              setOpen(false);
            }}
            onClear={() => {
              onChange(null);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

/** Editor de uma composição: prévia ao vivo + ajustes rápidos (sem o Studio). */
export function CompositionEditor({ instance, assets, profile, latestProfile }: Props) {
  // A receita tem uma função `build`: não atravessa a fronteira servidor→cliente, é resolvida aqui.
  const definition = instanceDefinition(instance);
  if (!definition) throw new Error(`Composição "${instance.compositionId}" não existe.`);
  return <Editor instance={instance} definition={definition} assets={assets} profile={profile} latestProfile={latestProfile} />;
}

function Editor({ instance, definition, assets, profile, latestProfile }: Props & { definition: CompositionDefinition }) {
  const [draft, setDraft] = useState<Draft>(() => initialDraft(instance));
  const [saved, setSaved] = useState(() => JSON.stringify(toPatch(initialDraft(instance))));
  const [formats, setFormats] = useState<RasterFormat[]>(["png"]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [typing, setTyping] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const activeProfile = draft.refreshProfile && latestProfile ? latestProfile : profile;
  const model = useMemo(() => renderModel(definition, draft, assetMap, activeProfile), [definition, draft, assetMap, activeProfile]);
  const dirty = JSON.stringify(toPatch(draft)) !== saved;
  const size = FORMATS[draft.formatId];

  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setNotice(null);
  };
  const bind = (slotId: string, binding: Binding) => update({ bindings: { ...draft.bindings, [slotId]: binding } });

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveInstanceAction(instance.id, toPatch(draft));
      if (!result.ok) return setError(result.error);
      setSaved(JSON.stringify(toPatch(draft)));
      setNotice(result.message ?? "Salvo.");
    });
  }

  function render() {
    setError(null);
    setJobId(null);
    startTransition(async () => {
      const result = await renderInstanceAction(instance.id, toPatch(draft), formats);
      if (!result.ok) return setError(result.error);
      setSaved(JSON.stringify(toPatch(draft)));
      if (result.jobId) setJobId(result.jobId);
    });
  }

  function openInCanvas() {
    setError(null);
    startTransition(async () => {
      const result = await materializeInstanceAction(instance.id, toPatch(draft));
      if (result && !result.ok) setError(result.error);
    });
  }

  function animate() {
    setError(null);
    startTransition(async () => {
      const result = await animateInstanceAction(instance.id, toPatch(draft));
      if (result && !result.ok) setError(result.error);
    });
  }

  function remove() {
    if (!window.confirm("Excluir esta peça? Os arquivos já renderizados continuam em Entregar.")) return;
    startTransition(async () => {
      const result = await deleteInstanceAction(instance.id);
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] items-start">
      <section aria-label="Prévia" className="space-y-3 lg:sticky lg:top-6 min-w-0">
        <div className="bg-surface border border-line p-4 sm:p-8 grid place-items-center overflow-hidden">
          {/* Formato, variante ou estilo trocados: a prévia antiga some enquanto a nova aparece (mesma célula da grade). */}
          <div className="grid w-full place-items-center [&>*]:[grid-area:1/1]">
            <AnimatePresence initial={false}>
              <motion.div
                key={`${draft.formatId}|${draft.variant}|${draft.styleMode}|${activeProfile?.revision ?? 0}`}
                className="w-full"
                style={{ maxWidth: `min(100%, calc(70vh * ${size.width} / ${size.height}))` }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: DURATION.instant, ease: EASE_OUT } }}
                exit={{ opacity: 0, transition: { duration: DURATION.instant, ease: "easeIn" } }}
              >
                <ArtboardPreview {...model} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        <p className="text-[12px] text-cbm-gray-400">
          {size.label} · {size.width}×{size.height}
          {!activeProfile && " · sem identidade do site (cores da Coded by M)"}
        </p>
        <CreativeIssues issues={lintArtboard(model.artboard, model.tokens)} />
      </section>

      <section aria-label="Ajustes da peça" className="space-y-6 min-w-0">
        <div>
          <label htmlFor="instance-name" className={LABEL_CLASS}>
            Nome
          </label>
          <input id="instance-name" className={INPUT_CLASS} value={draft.name} maxLength={120} onChange={(e) => update({ name: e.target.value })} />
        </div>

        <Choice label="Formato" value={draft.formatId} options={definition.formats.map((f) => ({ id: f, label: FORMATS[f].label }))} onChange={(formatId) => update({ formatId })} />
        {definition.variants.length > 1 && <Choice label="Variante" value={draft.variant} options={[...definition.variants]} onChange={(variant) => update({ variant })} />}
        <Choice label="Estilo" value={draft.styleMode} options={STYLE_MODES} onChange={(styleMode) => update({ styleMode })} />

        <div>
          <span className={LABEL_CLASS}>Cor de destaque</span>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="color"
              aria-label="Cor de destaque"
              value={draft.primary ?? model.tokens.colors.primary}
              onChange={(e) => update({ primary: e.target.value.toLowerCase() })}
              className="h-10 w-12 bg-transparent border border-line cursor-pointer"
            />
            {draft.primary ? (
              <>
                <span className="text-[12px] font-mono text-cbm-gray-200">{draft.primary}</span>
                <button type="button" onClick={() => update({ primary: undefined })} className="ml-auto h-10 sm:h-8 text-[12px] text-accent hover:text-accent-bright">
                  Voltar para automática
                </button>
              </>
            ) : (
              <span className="text-[12px] text-cbm-gray-400">Automática (da identidade)</span>
            )}
          </div>
        </div>

        {latestProfile && profile && latestProfile.revision !== profile.revision && (
          <div className="border border-line bg-surface px-3 py-2.5 text-[12px] text-cbm-gray-200 space-y-1.5">
            <p>A identidade do site mudou depois que esta peça foi criada.</p>
            <label className="flex items-center gap-2 min-h-10 sm:min-h-0 text-cbm-gray-400">
              <input type="checkbox" checked={draft.refreshProfile} onChange={(e) => update({ refreshProfile: e.target.checked })} />
              Usar a identidade atual
            </label>
          </div>
        )}

        <fieldset className="space-y-4">
          <legend className={LABEL_CLASS}>Conteúdo</legend>
          {definition.slots.map((slot) =>
            slot.type === "asset" ? (
              <AssetSlotField
                key={slot.id}
                slot={slot}
                assets={assets}
                value={(() => {
                  const b = draft.bindings[slot.id];
                  return b && "assetId" in b ? b.assetId : null;
                })()}
                onChange={(assetId) => bind(slot.id, { assetId: assetId as Extract<Binding, { assetId: unknown }>["assetId"] })}
              />
            ) : (
              <div key={slot.id}>
                <label htmlFor={`slot-${slot.id}`} className="flex justify-between gap-3 text-[12px] text-cbm-gray-200 mb-1.5">
                  <span>
                    {slot.label}
                    {slot.required && <span className="text-cbm-gray-400"> (obrigatório)</span>}
                  </span>
                  {typing === slot.id && (
                    <span className="text-[12px] text-cbm-gray-400 tabular-nums">
                      {(() => {
                        const b = draft.bindings[slot.id];
                        return b && "text" in b ? b.text.length : 0;
                      })()}
                      /{slot.maxLength}
                    </span>
                  )}
                </label>
                {(() => {
                  const b = draft.bindings[slot.id];
                  const value = b && "text" in b ? b.text : "";
                  const props = {
                    id: `slot-${slot.id}`,
                    className: INPUT_CLASS,
                    value,
                    maxLength: slot.maxLength,
                    onFocus: () => setTyping(slot.id),
                    onBlur: () => setTyping((t) => (t === slot.id ? null : t)),
                    onChange: (e: { target: { value: string } }) => bind(slot.id, { text: e.target.value }),
                  };
                  return slot.maxLength > 80 ? <textarea {...props} rows={3} /> : <input {...props} />;
                })()}
              </div>
            )
          )}
        </fieldset>

        <div className="border-t border-line pt-5 space-y-3">
          <fieldset>
            <legend className={LABEL_CLASS}>Arquivos do render</legend>
            <div className="flex gap-5">
              {(["png", "jpg", "webp"] as const).map((f) => (
                <label key={f} className="flex items-center gap-2 min-h-10 sm:min-h-8 text-[13px] text-cbm-gray-200">
                  <input type="checkbox" checked={formats.includes(f)} onChange={(e) => setFormats((cur) => (e.target.checked ? [...cur, f] : cur.filter((x) => x !== f)))} />
                  {f === "webp" ? "WebP" : f.toUpperCase()}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={render} disabled={pending || formats.length === 0}>
              Renderizar
            </Button>
            <Button onClick={save} disabled={pending || !dirty}>
              Salvar
            </Button>
            <Button onClick={openInCanvas} disabled={pending} title="Abre uma cópia desta peça no Studio, com camadas livres">
              Editar no canvas
            </Button>
            <Button onClick={animate} disabled={pending} title="Abre esta peça como vídeo no Studio">
              Animar
            </Button>
            <Button variant="ghost" onClick={remove} disabled={pending} className="ml-auto">
              <Trash2 size={14} aria-hidden />
              Excluir
            </Button>
          </div>
          <p className="text-[12px] text-cbm-gray-400 min-h-5" aria-live="polite">
            {dirty ? "Alterações não salvas. Renderizar também salva." : (notice ?? "")}
          </p>
          <FormError message={error} />
          {jobId && <JobFollower key={jobId} jobId={jobId} />}
        </div>
      </section>
    </div>
  );
}

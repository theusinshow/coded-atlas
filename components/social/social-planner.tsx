"use client";
/* eslint-disable @next/next/no-img-element -- peças servidas pelo AssetStorage */
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Clapperboard, Download, GalleryHorizontal, Play, Plus, X } from "lucide-react";
import { formatDuration } from "@/components/ui/format";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import checkmark from "react-useanimations/lib/checkmark";
import copy from "react-useanimations/lib/copy";
import trash2 from "react-useanimations/lib/trash2";
import { createPostAction, deletePostAction, movePostAction, setPostStatusAction, updatePostAction, type SocialActionState } from "@/app/actions/social";
import { AnimIcon } from "@/components/ui/anim-icon";
import { DURATION, EASE_OUT, swap } from "@/components/ui/motion";
import { Button, FormError, INPUT_CLASS, LABEL_CLASS } from "@/components/ui/primitives";
import { INSTAGRAM, type SocialPostKind, type SocialPostStatus } from "@/src/core/social/social-post";
import type { CandidateGroup, PieceView, PostView } from "./types";

const KINDS: { id: SocialPostKind; label: string; spec: string }[] = [
  { id: "post", label: "Post", spec: "1 imagem · 4:5 ou 1:1" },
  { id: "carousel", label: "Carrossel", spec: "2 a 10 peças · mesma proporção" },
  { id: "reel", label: "Reel", spec: "1 vídeo vertical" },
  { id: "story", label: "Story", spec: "1 peça 9:16" },
];
const STATUS: Record<SocialPostStatus, { label: string; dot: string }> = {
  draft: { label: "Rascunho", dot: "border border-cbm-gray-400" },
  ready: { label: "Pronto", dot: "bg-cbm-white" },
  posted: { label: "Publicado", dot: "bg-ok" },
};

/** Grades mostram o pôster (leve); o vídeo de verdade só carrega na prévia (`playable`). */
function Media({ piece, className = "", playable = false }: { piece: PieceView; className?: string; playable?: boolean }) {
  if (piece.isVideo && playable) return <video src={piece.fileUrl} poster={piece.thumbUrl} muted playsInline controls preload="none" className={`block w-full h-full object-cover bg-base ${className}`} />;
  return (
    <span className="relative block w-full h-full">
      <img src={piece.thumbUrl} alt={piece.label} loading="lazy" className={`block w-full h-full object-cover bg-base ${className}`} />
      {piece.isVideo && (
        <span className="absolute left-1.5 top-1.5 flex items-center gap-1 bg-base/80 px-1.5 py-0.5 text-[10px] tabular-nums text-cbm-white">
          <Play size={10} aria-hidden />
          {piece.durationMs ? formatDuration(piece.durationMs) : "vídeo"}
        </span>
      )}
    </span>
  );
}

function KindMark({ kind }: { kind: SocialPostKind }) {
  if (kind === "carousel") return <GalleryHorizontal size={14} aria-label="Carrossel" />;
  if (kind === "reel") return <Clapperboard size={14} aria-label="Reel" />;
  return null;
}

export function SocialPlanner({ feed, stories, candidates, initialPostId, initialView }: { feed: PostView[]; stories: PostView[]; candidates: CandidateGroup[]; initialPostId: string | null; initialView: "feed" | "stories" }) {
  const router = useRouter();
  const [view, setView] = useState<"feed" | "stories">(initialView);
  const [creating, setCreating] = useState(false);
  const all = useMemo(() => [...feed, ...stories], [feed, stories]);
  const list = view === "feed" ? feed : stories;
  const [selectedId, setSelectedId] = useState<string | null>(initialPostId ?? list[0]?.id ?? null);
  const selected = all.find((p) => p.id === selectedId) ?? list[0] ?? null;

  // A seleção fica na URL (dá para voltar e compartilhar o link), sem rolar a página.
  useEffect(() => {
    const params = new URLSearchParams();
    if (selected) params.set("post", selected.id);
    if (view === "stories") params.set("view", "stories");
    const qs = params.toString();
    router.replace(qs ? `/social?${qs}` : "/social", { scroll: false });
  }, [selected, view, router]);

  function pick(id: string) {
    const target = all.find((p) => p.id === id);
    if (target) setView(target.kind === "story" ? "stories" : "feed");
    setSelectedId(id);
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-[26px] font-bold leading-tight text-cbm-white tracking-[-0.02em]">Social</h1>
          <p className="mt-1.5 text-sm text-cbm-gray-400 max-w-xl">Planeje o Instagram da Coded by M com as peças dos projetos. O Atlas não publica: você baixa o pacote, posta e marca como publicado.</p>
        </div>
        <Button variant={creating ? "secondary" : "primary"} onClick={() => setCreating((c) => !c)} aria-expanded={creating}>
          {creating ? <X size={14} aria-hidden /> : <Plus size={14} aria-hidden />}
          {creating ? "Fechar" : "Novo post"}
        </Button>
      </header>

      <AnimatePresence initial={false}>
        {creating && (
          <motion.div key="new" {...swap}>
            <NewPostPanel
              candidates={candidates}
              onCreated={(id, kind) => {
                setCreating(false);
                setView(kind === "story" ? "stories" : "feed");
                setSelectedId(id);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-1 border-b border-line" role="tablist" aria-label="Visualização">
        {(["feed", "stories"] as const).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => {
              setView(v);
              setSelectedId((v === "feed" ? feed : stories)[0]?.id ?? null);
            }}
            className={`relative px-3 py-3 text-[11px] uppercase tracking-[0.15em] transition-colors ${view === v ? "text-cbm-white" : "text-cbm-gray-400 hover:text-cbm-white"}`}
          >
            {v === "feed" ? `Feed · ${feed.length}` : `Stories · ${stories.length}`}
            {view === v && <motion.span layoutId="social-tab" className="absolute left-3 right-3 -bottom-px h-0.5 bg-cbm-white" transition={{ duration: DURATION.quick, ease: EASE_OUT }} />}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="border border-line p-8 max-w-xl">
          <p className="text-sm text-cbm-white">{view === "feed" ? "O feed ainda está vazio." : "Nenhum story planejado."}</p>
          <p className="mt-2 text-[13px] text-cbm-gray-400">
            {candidates.length === 0
              ? "Gere as peças num projeto (Início → Instagram) e volte aqui para montar os posts."
              : `Use "Novo post" e escolha peças já renderizadas${view === "stories" ? " em 9:16" : ""}.`}
          </p>
        </div>
      ) : (
        <div className="grid gap-10 lg:grid-cols-[400px_1fr] items-start">
          {view === "feed" ? <ProfileGrid posts={feed} selectedId={selected?.id ?? null} onPick={pick} /> : <StoryLane posts={stories} selectedId={selected?.id ?? null} onPick={pick} />}
          <AnimatePresence mode="wait" initial={false}>
            {selected && (
              <motion.div key={selected.id} {...swap}>
                <PostEditor post={selected} inFeed={view === "feed"} isFirst={feed[0]?.id === selected.id} isLast={feed.at(-1)?.id === selected.id} onDeleted={() => setSelectedId(null)} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// ── Grid do perfil ───────────────────────────────────────────────────────────

function ProfileGrid({ posts, selectedId, onPick }: { posts: PostView[]; selectedId: string | null; onPick: (id: string) => void }) {
  const counts = { ready: posts.filter((p) => p.status === "ready").length, posted: posts.filter((p) => p.status === "posted").length };
  return (
    <section aria-label="Prévia do grid do perfil" className="border border-line bg-surface">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
        <span className="grid place-items-center w-9 h-9 border border-line text-signal" aria-hidden>
          <span className="tri" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-cbm-white">Coded by M</p>
          <p className="text-[11px] text-cbm-gray-400">
            {posts.length} no grid · {counts.ready} prontos · {counts.posted} publicados
          </p>
        </div>
      </div>
      <LayoutGroup>
        <ul className="grid grid-cols-3 gap-0.5 p-0.5" data-social-grid>
          {posts.map((p) => (
            <motion.li key={p.id} layout transition={{ duration: DURATION.layout, ease: EASE_OUT }}>
              <button
                onClick={() => onPick(p.id)}
                aria-label={`${p.title} — ${STATUS[p.status].label}`}
                aria-current={p.id === selectedId}
                className={`relative block w-full aspect-[3/4] overflow-hidden outline-offset-[-2px] ${p.id === selectedId ? "outline outline-2 outline-cbm-white" : ""}`}
              >
                {p.pieces[0] ? <Media piece={p.pieces[0]} /> : <span className="grid h-full place-items-center bg-base text-[11px] text-cbm-gray-400">sem peça</span>}
                <span className="absolute right-1.5 top-1.5 text-cbm-white drop-shadow">{<KindMark kind={p.kind} />}</span>
                <span className={`absolute left-1.5 bottom-1.5 w-2 h-2 ${STATUS[p.status].dot}`} aria-hidden />
                {p.errors.length > 0 && <span className="absolute inset-x-0 top-0 h-0.5 bg-bad" aria-hidden />}
              </button>
            </motion.li>
          ))}
        </ul>
      </LayoutGroup>
      <p className="flex flex-wrap gap-4 px-4 py-2.5 border-t border-line text-[11px] text-cbm-gray-400">
        {(Object.keys(STATUS) as SocialPostStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 ${STATUS[s].dot}`} aria-hidden />
            {STATUS[s].label}
          </span>
        ))}
        <span>Grid em 3:4, como no perfil</span>
      </p>
    </section>
  );
}

// ── Stories ──────────────────────────────────────────────────────────────────

function SafeZones() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      <span className="absolute inset-x-0 top-0 bg-base/70 border-b border-dashed border-cbm-gray-400" style={{ height: `${INSTAGRAM.storySafeTop * 100}%` }} />
      <span className="absolute inset-x-0 bottom-0 bg-base/70 border-t border-dashed border-cbm-gray-400" style={{ height: `${INSTAGRAM.storySafeBottom * 100}%` }} />
    </span>
  );
}

function StoryLane({ posts, selectedId, onPick }: { posts: PostView[]; selectedId: string | null; onPick: (id: string) => void }) {
  const [safe, setSafe] = useState(true);
  return (
    <section aria-label="Stories" className="space-y-3">
      <label className="flex items-center gap-2 text-[12px] text-cbm-gray-400 cursor-pointer">
        <input type="checkbox" checked={safe} onChange={(e) => setSafe(e.target.checked)} className="accent-[var(--color-cbm-white)]" />
        Mostrar as áreas cobertas pela interface do Instagram
      </label>
      <ul className="grid grid-cols-3 gap-2">
        {posts.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => onPick(p.id)}
              aria-label={`${p.title} — ${STATUS[p.status].label}`}
              aria-current={p.id === selectedId}
              className={`relative block w-full aspect-[9/16] overflow-hidden border ${p.id === selectedId ? "border-cbm-white" : "border-line hover:border-cbm-gray-400"}`}
            >
              {p.pieces[0] && <Media piece={p.pieces[0]} />}
              {safe && <SafeZones />}
              <span className={`absolute left-1.5 bottom-1.5 w-2 h-2 ${STATUS[p.status].dot}`} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Editor do post ───────────────────────────────────────────────────────────

function Preview({ post }: { post: PostView }) {
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const pieces = post.pieces;
  const current = pieces[Math.min(index, pieces.length - 1)];
  const vertical = post.kind === "reel" || post.kind === "story";
  const first = pieces[0];
  const r = first?.width && first?.height ? first.width / first.height : 0.8;
  const aspect = vertical ? 9 / 16 : Math.min(1.91, Math.max(0.8, r));
  const go = (d: number) => {
    setDir(d);
    setIndex((i) => Math.min(pieces.length - 1, Math.max(0, i + d)));
  };

  return (
    <figure className={`border border-line bg-base ${vertical ? "max-w-[260px]" : "max-w-[360px]"}`}>
      {post.kind !== "story" && (
        <figcaption className="flex items-center gap-2 px-3 py-2 border-b border-line">
          <span className="grid place-items-center w-6 h-6 border border-line text-signal" aria-hidden>
            <span className="tri" />
          </span>
          <span className="text-[12px] font-medium text-cbm-white">Coded by M</span>
        </figcaption>
      )}
      <div className="relative overflow-hidden" style={{ aspectRatio: String(aspect) }}>
        {current ? (
          <AnimatePresence initial={false} custom={dir}>
            <motion.div
              key={current.id}
              className="absolute inset-0"
              custom={dir}
              initial={{ x: `${dir * 100}%` }}
              animate={{ x: 0 }}
              exit={{ x: `${-dir * 100}%` }}
              transition={{ duration: DURATION.layout, ease: EASE_OUT }}
            >
              <Media piece={current} playable />
            </motion.div>
          </AnimatePresence>
        ) : (
          <span className="absolute inset-0 grid place-items-center text-[12px] text-cbm-gray-400">peças indisponíveis</span>
        )}
        {post.kind === "story" && <SafeZones />}
        {pieces.length > 1 && (
          <>
            <button onClick={() => go(-1)} disabled={index === 0} aria-label="Slide anterior" className="absolute left-2 top-1/2 -translate-y-1/2 grid place-items-center w-7 h-7 bg-base/80 text-cbm-white disabled:opacity-0 transition-opacity">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => go(1)} disabled={index >= pieces.length - 1} aria-label="Próximo slide" className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center w-7 h-7 bg-base/80 text-cbm-white disabled:opacity-0 transition-opacity">
              <ChevronRight size={16} />
            </button>
            <span className="absolute right-2 top-2 bg-base/80 px-1.5 py-0.5 text-[10px] tabular-nums text-cbm-white">
              {index + 1}/{pieces.length}
            </span>
          </>
        )}
      </div>
      {post.kind !== "story" && (
        <p className="px-3 py-2.5 text-[12px] leading-relaxed text-cbm-gray-200 line-clamp-3 whitespace-pre-line">
          <span className="font-medium text-cbm-white">Coded by M </span>
          {post.finalCaption || <span className="text-cbm-gray-400">Sem legenda ainda.</span>}
        </p>
      )}
    </figure>
  );
}

function PostEditor({ post, inFeed, isFirst, isLast, onDeleted }: { post: PostView; inFeed: boolean; isFirst: boolean; isLast: boolean; onDeleted: () => void }) {
  const [state, save, saving] = useActionState<SocialActionState, FormData>(updatePostAction.bind(null, post.id), null);
  const [caption, setCaption] = useState(post.caption);
  const [tags, setTags] = useState(post.hashtags.map((t) => `#${t}`).join(" "));
  const [statusError, setStatusError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const tagCount = tags.split(/[\s,]+/).filter((t) => t.replace(/^#+/, "")).length;
  const blocking = [...post.errors, ...post.captionIssues];

  function changeStatus(status: SocialPostStatus) {
    start(async () => {
      const result = await setPostStatusAction(post.id, status);
      setStatusError(result?.error ?? null);
    });
  }

  async function copyCaption() {
    await navigator.clipboard.writeText(post.finalCaption);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <section aria-label={`Editar ${post.title}`} className="space-y-6" data-social-editor={post.id}>
      <div className="grid gap-6 xl:grid-cols-[auto_1fr]">
        <Preview post={post} />
        <div className="space-y-5 min-w-0">
          <div>
            <p className="text-[12px] text-cbm-gray-400">
              {KINDS.find((k) => k.id === post.kind)?.label} · {post.projects.join(", ") || "sem projeto"}
            </p>
            <h2 className="mt-1 text-lg font-medium text-cbm-white truncate">{post.title}</h2>
          </div>

          <div role="radiogroup" aria-label="Status" className="grid grid-cols-3 border border-line">
            {(Object.keys(STATUS) as SocialPostStatus[]).map((s) => (
              <button
                key={s}
                role="radio"
                aria-checked={post.status === s}
                disabled={pending}
                onClick={() => changeStatus(s)}
                className={`relative flex items-center justify-center gap-2 h-9 text-[12px] transition-colors ${post.status === s ? "text-cbm-white" : "text-cbm-gray-400 hover:text-cbm-white"}`}
              >
                {post.status === s && <motion.span layoutId={`status-${post.id}`} className="absolute inset-0 bg-surface-2 border border-cbm-gray-400" transition={{ duration: DURATION.quick, ease: EASE_OUT }} />}
                <span className={`relative w-2 h-2 ${STATUS[s].dot}`} aria-hidden />
                <span className="relative">{STATUS[s].label}</span>
              </button>
            ))}
          </div>
          <FormError message={statusError} />

          {blocking.length > 0 ? (
            <ul className="space-y-1 text-[13px] text-bad">
              {blocking.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ok">Pronto para o Instagram.</p>
          )}
          {post.warnings.length > 0 && (
            <ul className="space-y-1 text-[12px] text-warn">
              {post.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={copyCaption} disabled={!post.finalCaption} aria-live="polite">
              <AnimIcon key={copied ? "ok" : "copy"} animation={copied ? checkmark : copy} size={16} autoplay={copied} />
              {copied ? "Legenda copiada" : "Copiar legenda"}
            </Button>
            <a href={`/api/atlas/social/${post.id}/pack`} className="inline-flex items-center gap-2 h-8 px-3 border border-line text-[12px] text-cbm-white hover:border-cbm-gray-400">
              <Download size={14} aria-hidden />
              Baixar pacote
            </a>
            {inFeed && (
              <>
                <Button size="sm" variant="ghost" disabled={isFirst} onClick={() => start(async () => void (await movePostAction(post.id, "earlier")))} aria-label="Mover para antes no grid">
                  <ArrowLeft size={14} aria-hidden />
                </Button>
                <Button size="sm" variant="ghost" disabled={isLast} onClick={() => start(async () => void (await movePostAction(post.id, "later")))} aria-label="Mover para depois no grid">
                  <ArrowRight size={14} aria-hidden />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <form action={save} className="space-y-4 border-t border-line pt-6">
        <div>
          <label htmlFor={`cap-${post.id}`} className={`${LABEL_CLASS} flex justify-between`}>
            <span>Legenda</span>
            <span className={`tabular-nums ${post.finalCaption.length > INSTAGRAM.captionMax ? "text-bad" : ""}`}>
              {caption.length} / {INSTAGRAM.captionMax}
            </span>
          </label>
          <textarea id={`cap-${post.id}`} name="caption" rows={5} maxLength={INSTAGRAM.captionMax} value={caption} onChange={(e) => setCaption(e.target.value)} className={INPUT_CLASS} placeholder="O que o post conta sobre o projeto — em uma ou duas frases." />
        </div>
        <div>
          <label htmlFor={`tags-${post.id}`} className={`${LABEL_CLASS} flex justify-between`}>
            <span>Hashtags</span>
            <span className={`tabular-nums ${tagCount > INSTAGRAM.hashtagsMax ? "text-bad" : ""}`}>
              {tagCount} / {INSTAGRAM.hashtagsMax}
            </span>
          </label>
          <input id={`tags-${post.id}`} name="hashtags" value={tags} onChange={(e) => setTags(e.target.value)} className={INPUT_CLASS} placeholder="#codedbym #webdesign" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`day-${post.id}`} className={LABEL_CLASS}>
              Dia planejado
            </label>
            <input id={`day-${post.id}`} name="plannedFor" type="date" defaultValue={post.plannedFor ?? ""} className={INPUT_CLASS} />
          </div>
          <div>
            <label htmlFor={`title-${post.id}`} className={LABEL_CLASS}>
              Nome interno
            </label>
            <input id={`title-${post.id}`} name="title" defaultValue={post.title} maxLength={120} className={INPUT_CLASS} />
          </div>
        </div>
        <FormError message={state?.error} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          {confirmDelete ? (
            <span className="flex items-center gap-3 text-[12px]">
              <span className="text-cbm-gray-200">Excluir este post? As peças continuam nos projetos.</span>
              <button type="button" className="text-bad hover:opacity-80" onClick={() => start(async () => {
                await deletePostAction(post.id);
                onDeleted();
              })}>
                Excluir
              </button>
              <button type="button" className="text-cbm-gray-400 hover:text-cbm-white" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 text-[12px] text-cbm-gray-400 hover:text-bad">
              <AnimIcon animation={trash2} size={16} />
              Excluir post
            </button>
          )}
          <div className="flex items-center gap-3">
            {state?.message && !saving && <span className="text-[12px] text-ok">{state.message}</span>}
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}

// ── Novo post ────────────────────────────────────────────────────────────────

function NewPostPanel({ candidates, onCreated }: { candidates: CandidateGroup[]; onCreated: (id: string, kind: SocialPostKind) => void }) {
  const [kind, setKind] = useState<SocialPostKind>("post");
  const [chosen, setChosen] = useState<string[]>([]);
  const [state, action, pending] = useActionState<SocialActionState, FormData>(createPostAction, null);
  const multi = kind === "carousel";
  const groups = candidates.map((g) => ({ ...g, pieces: g.pieces.filter((p) => p.fits.includes(kind)) })).filter((g) => g.pieces.length > 0);
  const valid = multi ? chosen.length >= INSTAGRAM.carouselMin && chosen.length <= INSTAGRAM.carouselMax : chosen.length === 1;

  useEffect(() => {
    if (state?.postId) onCreated(state.postId, kind);
    // Só reage a um post recém-criado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.postId]);

  function toggle(id: string) {
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : multi ? (c.length < INSTAGRAM.carouselMax ? [...c, id] : c) : [id]));
  }

  return (
    <form action={action} className="border border-line bg-surface p-5 space-y-5" data-new-post>
      <input type="hidden" name="kind" value={kind} />
      {chosen.map((id) => (
        <input key={id} type="hidden" name="outputId" value={id} />
      ))}
      <div role="radiogroup" aria-label="Tipo de post" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="radio"
            aria-checked={kind === k.id}
            onClick={() => {
              setKind(k.id);
              setChosen([]);
            }}
            className={`border px-3 py-2.5 text-left transition-colors ${kind === k.id ? "border-cbm-white bg-surface-2" : "border-line hover:border-cbm-gray-400"}`}
          >
            <span className="block text-[13px] text-cbm-white">{k.label}</span>
            <span className="block text-[11px] text-cbm-gray-400">{k.spec}</span>
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="text-[13px] text-cbm-gray-400">Nenhuma peça renderizada serve para {KINDS.find((k) => k.id === kind)?.label.toLowerCase()} ainda. Gere nos projetos (Início → Instagram) e volte aqui.</p>
      ) : (
        <div className="space-y-5 max-h-[420px] overflow-y-auto pr-1">
          {groups.map((g) => (
            <div key={g.project} className="space-y-2">
              <p className="text-[12px] text-cbm-gray-400">{g.project}</p>
              <ul className={`grid gap-2 ${kind === "story" || kind === "reel" ? "grid-cols-4 sm:grid-cols-8" : "grid-cols-3 sm:grid-cols-6"}`}>
                {g.pieces.map((p) => {
                  const order = chosen.indexOf(p.id);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => toggle(p.id)}
                        aria-pressed={order >= 0}
                        title={p.label}
                        className={`relative block w-full overflow-hidden border bg-base transition-colors ${kind === "story" || kind === "reel" ? "aspect-[9/16]" : "aspect-square"} ${order >= 0 ? "border-cbm-white" : "border-line hover:border-cbm-gray-400"}`}
                      >
                        <Media piece={p} className="!object-contain" />
                        {order >= 0 && (
                          <motion.span
                            initial={{ scale: 0.6, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ duration: DURATION.instant, ease: EASE_OUT }}
                            className="absolute right-1 top-1 grid place-items-center min-w-5 h-5 px-1 bg-cbm-white text-[11px] font-medium text-cbm-black tabular-nums"
                          >
                            {multi ? order + 1 : <Check size={12} aria-label="Escolhida" />}
                          </motion.span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-cbm-gray-400">
          {multi ? `${chosen.length} de ${INSTAGRAM.carouselMax} escolhidas — a ordem do clique é a ordem dos slides.` : chosen.length ? "1 peça escolhida." : "Escolha uma peça."}
        </p>
        <Button type="submit" variant="primary" disabled={!valid || pending}>
          {pending ? "Criando…" : "Criar rascunho"}
        </Button>
      </div>
      <FormError message={state?.error} />
    </form>
  );
}

# DECISIONS — Coded Atlas

Architecture Decision Log.

## ADR-001 — Product is media-first

Accepted. Atlas transforms digital products into media. Code review/front-end engineering belong elsewhere.

## ADR-002 — Local-first

Accepted. Primary runtime is local Node application. Cloud is not a current requirement.

## ADR-003 — SQLite as persistent source of truth

Accepted. SQLite replaces `catalog.json` as authoritative application state. `catalog.json` may remain as legacy/export format.

## ADR-004 — Filesystem for media bytes

Accepted. No large media BLOBs in SQLite.

## ADR-005 — Drizzle ORM

Accepted. Typed SQLite access and migrations without heavy external engine.

## ADR-006 — AssetStorage abstraction

Accepted. Domain/application code never depends on raw filesystem layout.

## ADR-007 — Hybrid Composition Engine

Accepted. Three levels: Composition → Canvas → Motion. Default path remains composition-first.

## ADR-008 — Constrained Canvas

Accepted. Atlas is not Figma. No general vector editor/plugin/prototyping scope initially.

## ADR-009 — Motion is scene/preset-first

Accepted. Motion V1 is not keyframe-first and not an After Effects replacement.

## ADR-010 — Atlas Brain is Creative Director

Accepted. AI performs judgment/planning. Deterministic engines execute.

## ADR-011 — ModelGateway abstraction

Accepted. GPT-6 Luna is initial default, but domain logic is model/vendor-independent.

## ADR-012 — Structured AI outputs

Accepted. Operational AI output must be schema-validated.

## ADR-013 — Design derives from Coded by M

Accepted. Atlas adds product semantic tokens/components without creating a separate brand.

## ADR-014 — Background jobs

Accepted. Capture/render/export are jobs; long work does not live inside long UI requests.

## ADR-015 — SQLite-backed local queue

Accepted for local architecture. No Redis/BullMQ without distributed-worker need.

## ADR-016 — Remotion + FFmpeg behind adapter

Accepted for future Motion phase. Atlas MotionDocument remains vendor-neutral.

## ADR-017 — Migration over rewrite

Accepted. Preserve current working capabilities and replace foundations incrementally.

## ADR-018 — Current phase is authoritative

Accepted. `CURRENT.md` prevents agents from implementing future architecture prematurely.

## ADR-019 — `DomainError` coexists with legacy `AtlasError`

Accepted (2026-09-27). New code in `src/` throws `DomainError` (`src/shared/errors.ts`) with a closed code set. The v1 pipeline keeps `AtlasError` (`lib/errors.ts`) until each flow is migrated; bridging happens at the adapter that routes a legacy flow through the new foundation. No mass rewrite of legacy error handling.

## ADR-020 — New foundation lives in `src/` beside the v1 tree

Accepted (2026-09-27). `src/{core,infrastructure,shared}` grows incrementally; `app/`, `components/` and `lib/` are not moved (Next.js keeps using root `app/`). Inside `src/`, imports are relative; legacy code may import from `src/core` (e.g. `SlugSchema`), never the reverse. The domain boundary is enforced by `src/core/architecture.test.ts`.

## ADR-021 — Storage keys are lowercase, validated, and published without overwrite

Accepted (2026-09-27). `StorageKey` segments are `[a-z0-9._-]` with alphanumeric ends: no `..`, `\`, `:`, `%`, leading dot or Windows reserved names. Lowercase only because NTFS is case-insensitive (`A.png` = `a.png`). `LocalAssetStorage` writes to a temp file and publishes with a hard link (atomic, fails if the target exists; falls back to exclusive copy where links are unsupported). Same bytes at an existing key = dedupe; different bytes = `CONFLICT`. Internal work areas start with `.` so they can never collide with a key.

## ADR-022 — Migrations run on open; schema mismatch fails loudly

Accepted (2026-09-27). `openDatabase` applies pending Drizzle migrations and refuses (`DB_SCHEMA_MISMATCH`) a database that contains migrations unknown to the code (newer Atlas) or whose applied migration hash differs (edited migration). Migration files are forced to LF via `.gitattributes`, since the hash covers the raw SQL text and `core.autocrlf` would otherwise change it.

## ADR-023 — 2.1.A delivered DB and storage together

Accepted (2026-09-27). `CURRENT.md` 2.1.A completion criteria required repository round-trips and safe storage, which are 2.1.B/2.1.C items in `BUILD-PLAN.md`. `CURRENT.md` has precedence, so those were delivered in the same milestone; next milestone is 2.1.D.

## ADR-024 — Legacy bridge is read-only, ID-less and type-locked to v1

Accepted (2026-09-27). The adapter reads `public/generated` through a confined, read-only store and maps each `catalog.json` to a project draft + file descriptors. It mints no IDs (they would change on every scan) and writes nothing; persisting into SQLite happens per project in a later migration step, so rollback is deleting rows. The Zod `LegacyCatalogSchema` and `lib/types.ts` `Catalog` are kept identical by a compile-time equality assertion instead of rewriting v1 types. Compositions and mockups map to **Output** (rendered deliverables); screenshots, sections, videos, thumbnails and covers map to **Asset**. v1 data with no Foundation home (`description`, `inspection`, capture options) is carried in `unmapped`, never dropped.

## ADR-025 — Local job queue semantics

Accepted (2026-09-27).

- **Atomic claim:** every queue write runs in a `BEGIN IMMEDIATE` transaction (write lock taken before reading), so claims are exclusive across processes, not only across connections. Verified with 4 real processes; a `deferred` transaction deadlocks on lock upgrade.
- **Destructive exclusivity:** `JOB_TYPE_POLICY` marks types that replace project state. The claim skips them while the project has an active destructive job, and a partial unique index (`project_id WHERE destructive AND status IN (preparing, running)`) makes it impossible at the database level.
- **Ownership:** a claim writes `lockedBy` + heartbeat. Only the owner may report progress or finish; a worker that lost the lock aborts its work and never overwrites the state someone else decided.
- **Cancellation:** a persisted request (`cancelRequestedAt`). Queued jobs are cancelled immediately; active ones are aborted through the handler's `AbortSignal` when the worker sees the flag (heartbeat or progress). If the handler finishes anyway, the job is `completed` — the work was committed.
- **Stale policy:** jobs whose heartbeat is older than `staleAfterMs` are marked `failed` (`STALE`), or `cancelled` if cancellation had been requested. No automatic requeue: capture is destructive and not assumed idempotent; retry is an explicit new job.
- **Worker hosting** (separate process vs. inside the Next server) is decided in 2.1.F, when the first real handler exists. `JobWorker` has no dependency on either.

## ADR-026 — Worker hosting and the first migrated slice

Accepted (2026-09-27).

- **Hosting:** the job worker starts inside the Next server process through `instrumentation.ts` (so `start.bat` keeps being the only thing to run) and can also run standalone (`npm run worker`). Both can coexist — the claim is atomic. `ATLAS_WORKER=off` disables the embedded one. Runtime and worker are singletons per process (kept on `globalThis` to survive dev HMR).
- **Graceful vs. hard stop:** SIGINT/SIGTERM stop the worker (current job → `failed/INTERRUPTED`); a hard kill leaves the job for stale recovery, which runs on start **and every `staleAfterMs`** — recovery only at start missed workers that died less than `staleAfterMs` before the restart.
- **Slice scope:** one desktop viewport screenshot per capture job, via the v1 engine routines. Screenshots are Assets; no Output is created until a render step exists.
- **Content-addressed capture keys** (`captures/<ab>/<sha256>.png`): recapturing identical pixels creates a new Asset record but shares bytes.
- **URL policy pulled forward** from 2.1.G: `local` (default — capturing localhost/dev sites is a real use case) and `hosted-safe` (DNS-resolved check of every address; Playwright request guard; redirect chain re-checked after navigation because Playwright does not route redirect hops). Limitation: in `hosted-safe`, a server-side redirect hop to a forbidden address is detected and the capture fails, but that hop's request has already been sent.

## ADR-027 — Hardening the v1 pipeline while it is still the main flow

Accepted (2026-09-27). 2.1.G hardened the v1 code in place (adapters and small hooks, no rewrite), because it remains the flow the studio uses until 2.3 migrates capture outputs.

- **Recovery over prevention for v1 recapture:** the existing backup lease stays; on server start, `.trash/<slug>-<ts>` backups are restored when the project folder has no valid catalog, or discarded when the new version is complete. A valid version is never replaced.
- **Warnings are data:** `catalog.json.warnings` (`CatalogWarning`, typed codes) — one entry per optional piece/step that failed or fell back, persisted and shown. The remaining silent `catch` blocks are only cleanup (closing browsers, removing temp files), best-effort waits (`wait-for-stability`, overlay dismissal), or catches that are the control flow itself (URL parse → invalid, file missing → not found).
- **One catalog reader:** `readCatalog` validates with `LegacyCatalogSchema`; invalid catalogs are logged with the reason and treated as absent instead of crashing a page. No real catalog loses keys through the schema (verified on the 9 existing projects).
- **Limits live in `lib/config.ts`** (env-overridable): `scrollMaxHeightPx`, `scrollMaxMs`, `maxFullPageHeightPx`, `actionTimeoutMs`, `generationTimeoutMs`.

## ADR-028 — Continuous execution through Atlas 3.0

Accepted (2026-09-27, owner). Phases 2.2–2.14 run back to back; the owner tests at the end. The phase discipline stays (one phase at a time, verification + docs + commit at each phase end); only the human stop between phases is waived. External credentials that do not exist in the repository (OpenAI API key, GitHub token) never block a phase: the feature ships behind its adapter with a deterministic/local fallback and is documented as "needs credential".

## ADR-029 — Project System choices (2.2)

Accepted (2026-09-27).

- **v1 library import pulled forward from 2.3** and run as a background job at startup: projects, sources, captures, assets (with lineage) and outputs (compositions/mockups) land in SQLite; bytes go to content-addressed keys (`assets/…`, `outputs/…`). Never writes to `public/generated`. `legacy_imports` makes it idempotent, remembers dismissals (deleting an imported project) and turns a v1 recapture into a new Capture. Failed imports are retried only when the catalog changes or on explicit sync.
- **Search** uses a derived, accent-free `search_text` column with escaped `LIKE` — no FTS engine needed at this scale.
- **Mutations from the UI are Server Actions** that call application services; every ID from the client is parsed with its Zod schema. Server Action body limit raised to 200 MB for uploads (per-file limit enforced by the service).
- **Local sources are dev-server URLs**, never filesystem paths (no machine paths in domain records).
- **Thumbnails** are generated on demand (fixed widths 320/640/1280, WebP) and cached in the storage `cache/` namespace, keyed by the original's SHA-256; deleting the last reference to bytes also deletes their thumbnails.

## ADR-030 — Capture system (2.3)

Accepted (2026-09-27).

- **One Capture per capture job**, typed `page` when it runs a `CapturePlan` (the plan is stored in `captures.params`) and `device` for the minimal viewport-only slice. Device dimensions stay in `lib/config.ts`; plans only name devices.
- **The v1 capture routines are reused as libraries** (overlays, stability, section detection/naming, smooth scroll, inspection, scroll guard) by a new buffer-based engine; nothing in the 2.x path writes to `public/generated`.
- **Partial failures are warnings, not errors**: an extra page or interaction state that fails is recorded in `job.result.warnings` and shown in the capture history; the capture still completes. Cancelation/timeout discards everything.
- **VisualProfile lives in `core/creative`** and is append-only by revision. Font lists drop system/emoji/generic families; traits are deterministic from the palette (the first sampled color is the dominant background). The Brand Adapter (2.4) consumes it.
- **Derived assets** (cover crop) are real Assets with `parentAssetId` and `metadata.origin = "derived"`; UI thumbnails stay a cache, not Assets.

## ADR-031 — Composition engine and rendering (2.4)

Accepted (2026-09-28).

- **Compositions are code, not data**: each `CompositionDefinition` is a versioned TypeScript recipe with a pure `build(ctx) → Artboard`. Instances store the recipe version and the VisualProfile revision they were made with (snapshot rule); the editor offers to move to a newer identity revision explicitly.
- **One visual implementation**: `src/render/artboard-view.tsx` (React, inline styles only, no Tailwind/Next) draws the preview in the browser and the final render. It will also back the Canvas (2.5) and motion (2.9).
- **Static render = Chromium running a bundle of the kernel**, built at runtime with esbuild and memoized per process. Next forbids `react-dom/server` in the server/instrumentation graph, and running the same client bundle guarantees preview = output. The page has no network: assets and fonts are served by route interception; everything else is aborted.
- **Fonts are a curated local set** (@fontsource, latin subset); project fonts that are not in the set fall back to a curated family (serif hint → Playfair Display, otherwise the Atlas default). The preview loads the same files through `/api/atlas/fonts/[file]` (closed list).
- **Outputs are immutable and outlive their instance**: deleting a composition keeps its renders in Publicar. Output thumbnails use the whole image (`fit: "whole"`); asset grid thumbnails keep the top crop.
- **Composition definitions never cross the server→client boundary** (they carry functions): client components resolve them by id from the same module.

## ADR-032 — Studio Canvas documents and revisions (2.5)

Accepted (2026-09-28).

- **One table for every creative document** (`creative_documents`) and one for revisions (`document_revisions`, JSON content validated by Zod on write and read). `kind` distinguishes canvas now and carousel/motion/presentation/case later.
- **A revision is a complete render input**: artboard + style (mode, accent, VisualProfile revision) + format. Assets and profile revisions are immutable, so re-rendering a revision is reproducible.
- **Autosave coalesces**: consecutive `edit` saves within 2 minutes rewrite the head revision, unless it is pinned. Rendering pins the revision; restoring creates a new revision. History is never rewritten backwards.
- **Optimistic concurrency**: saves carry the base revision; a stale base returns CONFLICT and the editor freezes until reload (no silent overwrite between tabs).
- **Zustand holds only the session** (content being edited, selection, undo stack). Undo coalesces changes with the same gesture key within 800 ms, so a drag or a typed word is one step.
- **The Studio runs full-screen at `/studio/[id]`**, outside the project layout, because it needs the whole viewport.
- **The canvas is constrained on purpose**: curated shadows, token colors first, local fonts. It is not a general-purpose design tool (PRINCIPLES → Taste over randomness).

## ADR-033 — Atlas Brain (2.6)

Accepted (2026-09-28).

- **AI is optional and off by default**: the OpenAI adapter is built only when `OPENAI_API_KEY` is set (and `ATLAS_AI` is not `off`). Every Brain feature has a deterministic fallback; plans show which one produced them.
- **Default model id `gpt-6-luna`** follows the docs ("GPT-6 Luna"). It is an assumption about the API identifier, overridable with `ATLAS_AI_MODEL`. No real call was made during development.
- **Structured Outputs with a strict JSON Schema generated from Zod**; keywords that providers may reject (`maxLength`, `minItems`…) are stripped from the schema sent, and Zod still enforces them on the way back.
- **The model chooses, never invents**: asset ids must come from the deterministic shortlist, compositions/formats/variants from the catalog; text over the slot limit is an error. Only slots the model omitted are filled by `autoBind`, and that is recorded as a note on the plan.
- **One repair, then fallback**: the validation errors are sent back once. If the repair still fails, valid items are kept with the rejected ones listed as warnings; if none is valid, the deterministic plan is used.
- **Plans are immutable** (revision = new plan with `parent_id`) and are applied only by an explicit user action, which creates CompositionInstance drafts. Nothing is rendered or published by the Brain.
- **Costs are never guessed**: prices come from env; without them usage records tokens and `estimated_cost_usd = null`. Budget `block` mode switches to the deterministic planner when the month limit is reached.
- **Reasoning router**: plan goals map to `creative`, while showcase sets, free requests and revisions map to `complex`. The adapter maps levels to effort (low/medium/high) in one place.

## ADR-034 — Creative System (2.7)

Accepted (2026-09-28).

- **CreativeSession = plan lineage** (a plan and its revisions via `parent_id`) plus the Creative Direction it follows; **CreativeJob = the `plan` job** with its goal. No separate tables until a phase needs state they cannot hold.
- **Creative memory is explicit data**, never hidden model state: rows in `creative_memory` (workspace when `project_id` is null). Learned signals only come from real decisions (apply/discard) and are visible and removable.
- **Precedence** is resolved in one pure function (`resolvePreferences`): project over workspace, manual over learned, then weight. The current request overrides everything in the prompt.
- **Avoided compositions are a validation rule** for model output (repairable error), not only a prompt hint.
- **Guardrails warn, never block**: `lintArtboard` is deterministic and applies to AI, rule-based and manual work alike.
- **Brand colors are adjusted for legibility** (mixed toward black/white only as much as needed for 4.5:1) in project/hybrid modes. A color the user picks explicitly (override) is kept, and the guardrail warns instead.

## ADR-035 — Multi-page documents (2.8)

Accepted (2026-09-28).

- **Content shape decides the kind**: canvas content has `artboard`, carousel content has `pages`; both live in `document_revisions` under `DocumentContentSchema`. The repository rejects content that does not match the document kind, so existing canvas revisions need no migration.
- **All pages of a carousel share size and style** (one Creative Direction per sequence). Per-page style would break the consistency rule of Media Kits.
- **The Studio edits a view**: the store keeps the whole document and exposes the active page as canvas-shaped content. Every existing editor component keeps working unchanged, and undo entries record the document and the page that was active.
- **Render = one Output per page**, in order, with `metadata.page` and `NN/total` labels. The ZIP route streams a render's Outputs in that order with sanitized names (never disk paths).

## ADR-036 — Motion foundation (2.9)

Accepted (2026-09-28).

- **Motion reuses the static document system**: `motion` is a third content shape (`scenes`) in `document_revisions`. Scenes hold ordinary Artboards; animation tracks reference layer ids (no parallel layer system).
- **Preset-driven, no keyframes** (MOTION-ENGINE V1 rule). A preset is a pure function from progress to deltas on x, y, scale, rotation, opacity, blur and image focus. Scale is applied as a CSS transform so it never changes layout.
- **One frame function for preview and render**: `sceneFrame` (pure) plus `MotionSceneView`/`MotionFrameView` in the render kernel. The browser player and the 2.10 video renderer draw the same frames.
- **Integrity over leniency**: tracks must reference existing layers (schema refine). The editor prunes tracks when a layer is deleted instead of saving invalid revisions.
- **Website Scroll animates `focusY`** of a full-page capture inside a browser frame; its duration follows the page height.

## ADR-037 — Video engine without Remotion (2.10)

Accepted (2026-09-28).

- **Adapter choice**: the first `MotionRenderer` is a Chromium frame renderer feeding FFmpeg, not Remotion. It reuses the exact kernel and bundle path already used for static renders and the browser preview (`MotionFrameView`), adds no webpack bundler or extra Chrome download, and keeps the domain vendor-neutral. MOTION-ENGINE allows Remotion as an *initial option*, and a Remotion adapter can still implement the same port later (its license is free for Coded by M's size, but that should be re-checked before adopting it).
- **Determinism**: frames are drawn at computed timestamps (`frame / fps`), with `flushSync`, then videos are seeked (`seeked` event) and images decoded before each screenshot. No real-time clock is involved, so a render is reproducible.
- **FFmpeg is infrastructure**: spawned with an argument list (no shell), resolved from `ATLAS_FFMPEG` or `PATH`, and its status is shown in Settings. JPEG frames are piped through stdin with backpressure. Output dimensions are forced even for yuv420p.
- **Audio** is one project asset per video (volume and fade-out), padded or cut to the exact document duration.
- **Captured motion** is any project video used inside a frame of a motion document. Static documents still accept only images (validation in the service).

## ADR-038 — Media Kits (2.11)

Accepted (2026-09-28).

- **A kit references drafts; it does not copy them**. Items point to real CompositionInstances and documents, so the user edits items in the usual editors, and the kit render uses each item's current state, pinning document revisions for traceability.
- **One Creative Direction per kit** (PRINCIPLES #5). The direction is snapshotted in the kit and applied to every item (style mode and accent), taken from a saved direction or derived from identity plus memory.
- **Kit generation is deterministic**: presets name curated compositions with alternatives; creative memory can veto one, and the alternative is recorded on the item. The Brain influences kits through saved directions (e.g. saved from a Brain plan) and memory, never by writing kit state directly.
- **Batch orchestration is one render job** (`target.kind = "kit"`). Static pieces share one browser, videos follow, and outputs carry `mediaKitId` and `kitItemId`. A kit stuck in `rendering` is released when its last job is no longer active.
- **Delivery**: the ZIP contains the latest kit render, with one numbered folder per item in preset order.

## ADR-039 — Presentations and document export (2.12)

Accepted (2026-09-28).

- **Export assembles, it never redraws**: PDF and PPTX are built from page images rendered by the same static renderer (kernel) as PNG outputs, so every format matches the preview exactly.
- **Libraries**: pdf-lib (PDF) and PptxGenJS (PPTX), both pure JavaScript and confined to `src/infrastructure/export` behind the `DocumentExporter` port.
- **PPTX slides are images plus speaker notes**. Editable native text in PPTX would need a second layout engine and could drift from the kernel; notes carry the talk track.
- **Presentations reuse the sequence model** (`slides` next to `pages` and `scenes`). The Statement composition fills the text-slide gap and is part of the curated catalog, so the guardrail sweep covers it.

## ADR-040 — Case Builder (2.13)

Accepted (2026-09-28).

- **A case is a CreativeDocument** (`kind = "case"`) with revisions, autosave and pinned render revisions like every other document. It is a structured editorial document (sections), not free-form MDX: each section type has a schema, and assets and outputs are referenced by id.
- **One view, three outputs**: `CaseView` in the render kernel drives the live preview, the web page, the PDF and the 1400px modules. The web export serializes the DOM rendered in Chromium and rewrites internal URLs to files packaged next to `index.html`, so it needs no runtime.
- **Behance-style modules** are 1400px-wide PNG slices of the same page, cut at section boundaries.
- **Copywriting is optional and bounded**: the `copy` job only fills empty text sections, and the `inventedFigures` guardrail rejects numbers that are not in the project material. Text the owner wrote is never overwritten.
- **v1 `case-draft.mdx` is not migrated automatically** (it is user-authored free text). It stays on disk, and the new outline is generated from project material.

## ADR-041 — Publish & Portfolio (2.14)

Accepted (2026-09-28).

- **An Export is a record plus a job**. The request validates ownership and destination, creates the record and enqueues a non-destructive `export` job. Every delivery starts from an explicit click, and neither the Brain nor any job starts one on its own.
- **Packages are not Outputs**. Outputs are render products; a package is a delivery of existing Outputs. The download ZIP is stored content-addressed under `exports/` and referenced by the Export record, and it is removed with the project.
- **Portfolio compatibility**: `portfolio.json` keeps the v1 manifest fields the site already consumes and adds `pieces` and `case`. The case web page ships as its ZIP; the site decides how to host it.
- **Destinations behind ports**: `FolderDestination` (confined to `ATLAS_EXPORT_DIR`, new timestamped folder per delivery, `wx` writes, never overwrites) and `GithubDestination` (one commit through the Git Data API on the configured branch and path, no force push). The GitHub token only comes from the environment and is never stored or shown.

## ADR-042 — Atlas 3.0 declared

Accepted (2026-09-28).

- The ROADMAP 3.0 criterion is met: the full loop works end-to-end, and the primary proof (Project URL → Generate Media Kit → Review → Render → Export) is covered by the e2e suite and by the owner's acceptance test.
- Tagged `v3.0.0`. The continuous-execution authorization of ADR-028 ends here. New scope requires a new owner decision.
- Known gaps, accepted: real OpenAI Responses calls and real GitHub delivery are implemented behind ports and tested with fakes, but have not been exercised against the live services. The v1 screens remain until an explicit retirement task.

## ADR-043 — v1 retirement: port first, then remove (3.1)

Accepted (2026-09-28).

- Two capabilities existed only in v1: authenticated capture and visual diff. The owner chose to port them before removing v1, so retiring v1 loses nothing.
- **Sessions are secrets, not assets**. They live in `<ATLAS_HOME>/auth/<projectId>.json` behind a `SessionStore` port, outside AssetStorage, never in SQLite, never exported, and are shown only as a summary (cookie count and domains). They are created by a manual headed login (`npm run atlas:login`), never by an automated flow. v1 sessions (`auth/<slug>.json`) are not copied automatically: the owner logs in again.
- **A diff is a derived Asset** (role `diff`), with lineage to both captures and the changed percentage in its metadata. It runs as a `diff` job, never inside a request.
- The v1 "recapture now and compare" button becomes two steps (capture, then compare the latest two captures). The capture is a real job with a plan and history, instead of an ad-hoc recapture.

## ADR-044 — v1 removed (3.1.C)

Accepted (2026-09-28).

- The v1 code is deleted, not archived in the tree. Git history (and the `v1-social-kit` branch) keeps it recoverable.
- The v1 library on disk stays readable forever through the importer. Its catalog schema is now a frozen definition in `src/modules/import/legacy`, and no code writes `catalog.json` anymore.
- Capture parameters keep the v1 environment variable names, so existing installations behave the same.
- Interrupted v1 generations are no longer recovered at boot. Leftover `.trash` folders are dot folders, which the importer ignores.

## ADR-045 — Atlas aligned to the Coded by M design system

Accepted (2026-09-28). This ADR implements ADR-013, which until now had only been declared.

- **The source is the owner's cbm-port@0.1.0 bundle.** Its README and DESIGN-LANGUAGE are copied into `docs/design-system/coded-by-m/`. Brand values are taken from it verbatim, never invented. The earlier cool-neutral and copper palette was Atlas-only and is gone.
- **The Atlas semantic layer keeps its class names.** `base`, `surface`, `line`, `accent`, `signal`, `ok`, `warn` and `bad` now map to the foundation in `app/globals.css`, so components did not need a rewrite. Grays use `cbm-gray-*` directly.
- **Red rarity is enforced by roles, not by hue.** `accent` became off-white emphasis that reveals the signal on hover. Solid red is reserved for the single primary action, focus, the active global-nav marker and errors. Project tabs and play buttons use structure (off-white), not the signal.
- **Accessibility over literal copying.** Readable text never uses gray-600 (2.3:1), and gray-400 is the floor. On brand color, onPrimary uses the warm poles (`#F5F2ED`/`#000F08`) only when they pass AA.
- **Generated pieces:** style tokens gain `radiusScale` and `frame`, and fonts gain `widthFactor`, all resolved at render time. Tokens are never persisted in documents, so existing documents are unaffected. Fonts are self-hosted (`public/fonts/cbm`, from the design system bundle), so renders stay offline and deterministic.

## ADR-046 — Three-step navigation

Accepted (2026-09-29, owner request: "muitas páginas, quero uma navegação mais óbvia e simples").

- **Global nav keeps two destinations** (Projetos, Portfólio). Jobs becomes an activity indicator, Ajustes becomes a gear, and Biblioteca is reached from Projetos and ⌘K.
- **The eight project tabs become Visão geral · 1 Material · 2 Criar · 3 Entregar.** They follow the product loop (capture → create → deliver). Screens are grouped, not rewritten, and URLs stay stable, so links, bookmarks and e2e keep working.
- **One recommended action.** The overview computes a single next step from the project state (a pure, tested function) instead of listing stats and generic recommendations.

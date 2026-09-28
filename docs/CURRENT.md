# CURRENT — Coded Atlas

## Active phase

**Owner acceptance test of Atlas 3.0.** All roadmap phases are implemented: 2.1–2.3 completed 2026-09-27; 2.4–2.14 completed 2026-09-28. Only fixes from the owner's test are in scope until 3.0 is declared.

**Owner authorization (2026-09-27):** execute the roadmap continuously from 2.2 through 2.14 (Atlas 3.0) without stopping between phases; the owner tests only at the end. Each phase still ends with typecheck/lint/test/build, `BUILD-PLAN.md` + this file updated and a commit.

## Objective

Introduce the new persistence/domain/job foundation while preserving useful behavior of the current Atlas.

## Current milestone

**Atlas 3.0 acceptance**: the owner runs the full loop (Import → Capture → Understand → Create → Motion → Render → Publish) on real projects. Not yet exercised on this machine: real OpenAI calls (no key) and real GitHub push (no token).

## State of the code (2026-09-27)

Delivered in 2.1.A (which also covered 2.1.B and 2.1.C, because the 2.1.A completion criteria required DB + storage):

- `src/shared` — `DomainError`, `parseOrThrow`, ULID IDs (branded per entity), structured logger.
- `src/core` — Zod schemas + factories for Project, Source, Asset (+ AssetRelation), Capture, Job (+ pure transition rules), Output; `StorageKey`; repository and `AssetStorage` ports. No framework/driver/Node I/O imports (enforced by `src/core/architecture.test.ts`).
- `src/infrastructure/db` — SQLite (`better-sqlite3`) + Drizzle, WAL, foreign keys, migration `0000_foundation` applied on open, `DB_SCHEMA_MISMATCH` on newer/edited migrations; repositories for all six entities with Zod validation on write and read.
- `src/infrastructure/storage` — `LocalAssetStorage`: key validation, root confinement (incl. junction/symlink), SHA-256, no-overwrite atomic publish, dedupe, staging with all-or-nothing commit.
- `ATLAS_HOME` (default `./.atlas`, git-ignored) holds `atlas.db` and `storage/`. `npm run db:migrate` initializes it.
- Vitest: `npm test` (302 tests after 2.1.G, `src/` and `lib/`). `npm run typecheck`.

Delivered in 2.1.D:

- `src/modules/import/legacy` — `LegacyCatalogSchema` (Zod, kept identical to `lib/types.ts` `Catalog` by a compile-time assertion), pure `mapLegacyCatalog` (→ project draft, url source, file descriptors split into Asset/Output, lineage, `unmapped` data) and `scanLegacyLibrary` with structured issues (error = project skipped, warning = included).
- `src/infrastructure/legacy/generated-dir-store.ts` — confined, read-only reader of `public/generated`.
- `npm run legacy:scan` (`--json` for the full report). Real library: 9/9 projects readable, 0 issues.
- No IDs are minted and nothing is written: importing into SQLite happens in the vertical slice / 2.3.

Delivered in 2.1.E:

- `JobRepository` queue operations (SQLite, `BEGIN IMMEDIATE`): `claimNext`, `markRunning`, `heartbeat`, `reportProgress`, `finish`, `requestCancel`, `recoverStale`. Only the lock owner can write progress/final state.
- Destructive policy per job type (`capture` is destructive): the claim skips a destructive job whose project already has one active, and a partial unique index enforces it in the database. Migration `0001_job_queue`.
- `src/workers/job-worker.ts` — `JobWorker`: runs in any Node process (no HTTP request involved), recovers stale jobs on start, heartbeats, passes cancellation / timeout / shutdown to handlers through an `AbortSignal`, never overwrites a job whose lock it lost.
- No real handler is registered yet and no process hosts the worker: that is 2.1.F.

Delivered in 2.1.F (Atlas 2.1 exit criteria pass end-to-end):

- `src/modules/capture` — `CaptureEngine` port, `queueUrlCapture` use case, capture job handler (staging → validate → commit → Asset + Capture; discard on cancel/error).
- `src/infrastructure/playwright/playwright-capture-engine.ts` — reuses v1 overlay/stability routines; closes Chromium on abort.
- `src/infrastructure/runtime.ts` (composition root, one per process) and `embedded-worker.ts`; the worker starts with the Next server (`instrumentation.ts`, disable with `ATLAS_WORKER=off`) or standalone (`npm run worker`). Stale jobs are recovered on start and every `staleAfterMs`.
- `/api/atlas/{captures, projects, projects/[id], jobs/[id]/events (SSE), jobs/[id]/cancel, assets/[id]/file}` and the verification page `/lab/foundation`.
- URL policy (`ATLAS_URL_POLICY=local|hosted-safe`) — pulled forward from 2.1.G because the new capture path needed it.

Delivered in 2.1.G (hardening, mostly on the v1 pipeline the product still runs on):

- v1 interrupted recaptures are restored on server start (`lib/storage/recover-generations.ts`); a v1 generation watchdog (`generationTimeoutMs`) aborts and rolls back.
- `lib/storage/paths.ts` validates slugs with the domain schema and confines every project path.
- `catalog.json` gains `warnings` (structured, persisted, shown on the project page); showcase pieces, extra pages, states, video, inspection, section detection, scroll limit and truncated full pages report instead of failing silently.
- `lib/storage/read-catalog.ts` is the only v1 catalog reader and validates at runtime.
- Infinite-scroll guard and full-page height cap; explicit Playwright action timeouts.

Delivered in 2.2 (Project System):

- DB-backed `/projects` library (search, filters, archive), `/projects/new`, project pages (Overview · Capture · Assets · Settings), global `/jobs` and `/settings`; v1 screens at `/legacy` and `/generate`.
- Project lifecycle with storage GC on delete; sources (site, local dev URL, GitHub, uploads); manual upload with byte-level format detection.
- The v1 library is imported automatically into SQLite/AssetStorage by a background `import` job (non-destructive, idempotent, ledger in `legacy_imports`).
- `npm run e2e` drives the real UI against a server with a temporary `ATLAS_HOME`.

Delivered in 2.3 (Asset & Capture System):

- Full capture pipeline as jobs (`CapturePlan`, Quick/Complete profiles): devices, full page, named sections, extra pages, interaction states, scroll video, inspection; derived 1.91:1 cover with lineage; warnings in the job result.
- `VisualProfile` (Understand) revisions from captures and from the v1 import; "Identidade visual" on the Overview.
- Global `/library`, asset detail page (lineage, set cover, download, remove upload). v1 `/generate` is no longer part of the main flow (still at `/generate` under v1).

Delivered in 2.4 (Composition Engine):

- `Artboard`/layer document model, 10 curated versioned compositions, 5 formats, style modes through the Brand Adapter, deterministic auto-binding, `CompositionInstance` (migration `0004_composition`).
- Single React render kernel used by the live preview and by the static renderer (Chromium runs an esbuild bundle of the kernel; no `react-dom/server` in the Next graph). Render jobs produce PNG/JPG/WebP Outputs.
- Project tabs **Criar** (gallery + quick inspector) and **Publicar** (outputs, download).

Delivered in 2.5 (Studio Canvas):

- `CreativeDocument` + revisions (migration `0005_documents`): optimistic concurrency, coalesced autosave, pinned rendered revisions, restore as a new revision.
- Full-screen Studio (`/studio/[id]`) with Zustand editor state, undo/redo, layers, add panel, drag/resize/snap canvas and inspector; render of a concrete revision.

Delivered in 2.6 (Atlas Brain):

- `ModelGateway` port + OpenAI Responses adapter (enabled only with `OPENAI_API_KEY`), deterministic Context Builder, `CreativePlan` with schema/domain validation, one repair and deterministic fallback, AI usage tracking and budget (migration `0006_brain`).
- `plan` job and project tab **Planos**; applying a plan creates drafts in Criar. Real OpenAI calls were not exercised (no key on this machine).

Delivered in 2.7 (Creative System):

- Workspace/project creative memory with learned signals and precedence, saved Creative Directions, manual VisualProfile revisions, deterministic creative guardrails (migration `0007_creative`). Brand Adapter now guarantees AA contrast for brand/muted text.

Delivered in 2.8 (Carousel & Multi-page Documents):

- `carousel` documents with ordered pages sharing one style, page operations, multi-page Studio (active page view + storyboard), carousel goal and plan → carousel, multi-output render with ZIP download per render.

Delivered in 2.9 (Motion Foundation):

- `motion` documents (scenes, preset-driven tracks, transitions), 12 pure presets, pure timeline/frame functions, auto-animation, Website Scroll, Studio scene strip/animation inspector/browser player, `MotionFrameView` in the render kernel.

Delivered in 2.10 (Video Engine):

- `MotionRenderer` port + Chromium/FFmpeg frame-accurate adapter (MP4/WebM, preview/final), video render jobs, captured motion in frames, basic soundtrack, VideoRecipes, FFmpeg status in Settings.

Delivered in 2.11 (Media Kits):

- `MediaKit` with presets (launch/portfolio/social), one Creative Direction per kit, generation into editable drafts, batch render job (`kit` target) with kit-tagged Outputs, ZIP delivery per item; "Generate Media Kit" is the Overview primary CTA.

Delivered in 2.12 (Presentation Studio):

- `presentation` documents with speaker notes, curated storyboard, Statement composition, Studio slide editing, PDF/PPTX export through the `DocumentExporter` port (pdf-lib, PptxGenJS).

Delivered in 2.13 (Case Builder):

- `case` documents with editorial sections, outline from project material, full-screen structured editor with live preview, optional Brain copywriting (`copy` job, invented-figures guardrail), web page ZIP / PDF / 1400px module outputs.

Delivered in 2.14 (Publish & Portfolio):

- `Export` records and `export` job (migration `0009_exports`), organized packages with `manifest.json`, portfolio export with v1-compatible `portfolio.json`, destinations download ZIP / local folder (`ATLAS_EXPORT_DIR`) / optional GitHub (`ATLAS_GITHUB_*`); "Criar pacote" in Publicar, global Portfólio page, destinations in Settings.

## Work allowed now

- nothing new until the owner authorizes 2.2 — only fixes to what 2.1 delivered;
- when 2.2 is authorized (ROADMAP): Project Library, Overview, project lifecycle, Sources, search, archive, URL/manual import, GitHub/local source groundwork.

## Work NOT allowed now

Do not implement Atlas Brain, OpenAI integration, Composition Engine, Canvas, Motion, Remotion, Media Kits, Presentation Studio, Case Builder rewrite, publishing integrations, cloud storage or desktop packaging.

## Preservation rule

Current capture/social/mockup/diff functionality must remain operational unless a migration task explicitly replaces it.

## Immediate sequence

1. ~~establish baseline test/build state;~~
2. ~~add new shared domain/Zod foundation;~~
3. ~~configure SQLite/Drizzle;~~
4. ~~create initial migrations;~~
5. ~~implement repositories;~~
6. ~~implement AssetStorage;~~
7. ~~create legacy adapter;~~
8. ~~migrate one narrow capture flow end-to-end (2.1.E jobs, 2.1.F slice);~~
9. ~~verify + harden (2.1.G);~~
10. expand only after passing criteria → phase 2.2, when authorized.

## Completion criteria

Phase 2.1 exit criteria (ROADMAP: create project → register source → capture → persist metadata in SQLite → store bytes through AssetStorage → reload project) pass end-to-end, through the running server. Criteria for 2.2 will be written when the phase starts.

## Agent rule

When this milestone is complete, update this file to the next milestone and stop.

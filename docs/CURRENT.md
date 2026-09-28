# CURRENT — Coded Atlas

## Active phase

**Atlas 2.1 — Foundation**

## Objective

Introduce the new persistence/domain/job foundation while preserving useful behavior of the current Atlas.

## Current milestone

**2.1.G — Hardening** (in progress)

## State of the code (2026-09-27)

Delivered in 2.1.A (which also covered 2.1.B and 2.1.C, because the 2.1.A completion criteria required DB + storage):

- `src/shared` — `DomainError`, `parseOrThrow`, ULID IDs (branded per entity), structured logger.
- `src/core` — Zod schemas + factories for Project, Source, Asset (+ AssetRelation), Capture, Job (+ pure transition rules), Output; `StorageKey`; repository and `AssetStorage` ports. No framework/driver/Node I/O imports (enforced by `src/core/architecture.test.ts`).
- `src/infrastructure/db` — SQLite (`better-sqlite3`) + Drizzle, WAL, foreign keys, migration `0000_foundation` applied on open, `DB_SCHEMA_MISMATCH` on newer/edited migrations; repositories for all six entities with Zod validation on write and read.
- `src/infrastructure/storage` — `LocalAssetStorage`: key validation, root confinement (incl. junction/symlink), SHA-256, no-overwrite atomic publish, dedupe, staging with all-or-nothing commit.
- `ATLAS_HOME` (default `./.atlas`, git-ignored) holds `atlas.db` and `storage/`. `npm run db:migrate` initializes it.
- Vitest: `npm test` (276 tests after 2.1.F). `npm run typecheck`.

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

The v1 pipeline (`/generate`, `/projects`, `catalog.json`, `public/generated`) is still the main flow and keeps working; the 2.x path runs beside it.

## Work allowed now

- hardening of the whole 2.1 surface (new foundation and the v1 pipeline it still depends on): transactional generation, central safe paths, URL policy, structured warnings, runtime validation of persisted JSON, infinite-scroll guard, explicit timeouts;
- document migration seams;
- everything already allowed in 2.1 (Zod, SQLite/Drizzle, migrations, IDs, Foundation schemas, `AssetStorage`).

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
9. verify + harden (2.1.G) ← now;
10. expand only after passing criteria.

## Completion criteria for 2.1.G

- An interrupted v1 generation (server killed mid-run) never leaves a project missing: the previous version is restored on next start.
- Every path built from a slug goes through the central validation + root confinement.
- URL policy covers the new and the v1 capture entry points, with tests.
- Optional-step failures in the v1 pipeline become structured warnings persisted in `catalog.json` and visible in the UI — no silent `.catch(() => [])` on meaningful work.
- v1 screens read `catalog.json` through the runtime schema.
- Infinite-scroll pages cannot hang the capture; long operations have explicit, configurable timeouts.
- typecheck, lint, test and build clean.

## Agent rule

When this milestone is complete, update this file to the next milestone and stop.

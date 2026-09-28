# CURRENT — Coded Atlas

## Active phase

**Atlas 2.1 — Foundation**

## Objective

Introduce the new persistence/domain/job foundation while preserving useful behavior of the current Atlas.

## Current milestone

**2.1.F — First migrated vertical slice** (not started — waiting for the owner to test 2.1.E)

## State of the code (2026-09-27)

Delivered in 2.1.A (which also covered 2.1.B and 2.1.C, because the 2.1.A completion criteria required DB + storage):

- `src/shared` — `DomainError`, `parseOrThrow`, ULID IDs (branded per entity), structured logger.
- `src/core` — Zod schemas + factories for Project, Source, Asset (+ AssetRelation), Capture, Job (+ pure transition rules), Output; `StorageKey`; repository and `AssetStorage` ports. No framework/driver/Node I/O imports (enforced by `src/core/architecture.test.ts`).
- `src/infrastructure/db` — SQLite (`better-sqlite3`) + Drizzle, WAL, foreign keys, migration `0000_foundation` applied on open, `DB_SCHEMA_MISMATCH` on newer/edited migrations; repositories for all six entities with Zod validation on write and read.
- `src/infrastructure/storage` — `LocalAssetStorage`: key validation, root confinement (incl. junction/symlink), SHA-256, no-overwrite atomic publish, dedupe, staging with all-or-nothing commit.
- `ATLAS_HOME` (default `./.atlas`, git-ignored) holds `atlas.db` and `storage/`. `npm run db:migrate` initializes it.
- Vitest: `npm test` (219 tests after 2.1.E). `npm run typecheck`.

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

Not wired yet: **nothing in the running app uses the new foundation.** The v1 pipeline (`app/`, `lib/`, `catalog.json`, `public/generated`) is unchanged, except that four legacy routes now validate slugs with the domain `SlugSchema`.

## Work allowed now

- first migrated vertical slice: create project → add URL source → queue a capture job → a worker runs one deterministic capture through the current engine → bytes stored via `AssetStorage` → Asset (and Output where appropriate) persisted → project reloads from the DB;
- a capture job handler that adapts the existing `lib/capture` engine (passing the job `AbortSignal` down to Playwright) without changing the v1 flow;
- deciding and implementing where the worker runs (separate `npm run worker` process and/or started with the Next server);
- minimal API/UI hooks needed to verify the slice, keeping existing screens working;
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
8. migrate one narrow capture flow end-to-end (~~2.1.E jobs~~, 2.1.F slice ← next);
9. verify;
10. expand only after passing criteria.

## Completion criteria for 2.1.F (= Atlas 2.1 exit criteria in ROADMAP.md)

- Create project → register URL source → queue capture → capture → metadata in SQLite → bytes through `AssetStorage` → reload project, working end-to-end against a local fixture site (not only live websites).
- At least the desktop viewport screenshot becomes an Asset with `storageKey`, SHA-256, dimensions and a Capture record; no absolute path persisted.
- Cancelling the job stops Playwright and leaves no partial Asset/bytes (staging discarded).
- The worker runs without an open HTTP request; closing the browser tab does not orphan the job.
- The existing v1 generation flow, library and project pages keep working.
- typecheck, lint, test and build clean; a real capture integration test documented.

## Agent rule

When this milestone is complete, update this file to the next milestone and stop.

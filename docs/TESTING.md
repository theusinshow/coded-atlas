# TESTING — Coded Atlas

## Goal

Protect capture, persistence, creative contracts and rendering behavior while Atlas migrates incrementally.

## Commands

```text
npm run typecheck   # tsc --noEmit
npm run lint
npm test            # Vitest: src/**/*.test.ts and lib/**/*.test.ts (includes real-Chromium tests against local fixtures)
npm run build
npm run legacy:scan         # read-only report of public/generated in the new model
npx tsx scripts/test-*.ts   # legacy v1 scripts (some capture real sites)
```

## Unit — Vitest

Test schemas, domain rules, slug/path validation, URL policy, composition compatibility, transformations, preset resolution, job transitions and cost calculations.

## Repository/integration

Use temporary SQLite DBs for migrations, CRUD, transactions, JSON validation, foreign keys, job claiming and cancellation.

Claim atomicity is tested with real concurrent Node processes (`src/infrastructure/db/__fixtures__/claim-race-worker.ts`, launched with `node --import tsx`), not only with multiple connections in one process.

## Storage integration

Use temporary directories for confinement, put/get/stat/delete, hashing, dedupe, staging and cleanup.

## Capture integration

Real Playwright fixtures for desktop/mobile, full page, sections, states, cancellation, infinite-scroll guard and overlay handling.

Avoid depending only on live public websites.

## Render integration

Verify dimensions, formats, transparency, deterministic compositions, video codec/dimensions and failure cleanup.

## E2E

Critical journeys evolve with phases: create project, import/capture, browse assets, generate composition, render and export.

## CI baseline

```text
npm ci
typecheck
lint
unit tests
build
```

Heavy Chromium/FFmpeg tests may run separately.

## Definition of done

A feature is complete when contract is validated, failure path tested, unrelated behavior preserved, docs updated, checks pass and manual verification is documented.

## Manual end-to-end checks used for 2.1 (repeat before closing a phase)

Run `next start` with a temporary `ATLAS_HOME` and a local fixture HTTP server (a page that answers, one that never answers):

1. `POST /api/atlas/captures` → follow `/api/atlas/jobs/<id>/events` → `completed`; asset bytes served by `/api/atlas/assets/<id>/file`.
2. Cancel a job stuck in navigation → `cancelled` within one heartbeat; no Playwright Chromium left running.
3. Kill the server mid-job and restart within 30 s → job becomes `failed/STALE` on the periodic recovery; the project accepts a new capture.
4. v1 `/api/generate` with showcase; with an unreachable extra page (warning); with `ATLAS_GENERATION_TIMEOUT_MS` small on a hanging page (timeout + rollback); killing the server mid-recapture (restored on restart).
5. Tests must not write to `public/generated` (compare the folder before/after `npm test`).

# CURRENT — Coded Atlas

## Active phase

**Atlas 2.1 — Foundation**

## Objective

Introduce the new persistence/domain/job foundation while preserving useful behavior of the current Atlas.

## Current milestone

**2.1.D — Legacy bridge** (not started — waiting for the owner to test 2.1.A)

## State of the code (2026-09-27)

Delivered in 2.1.A (which also covered 2.1.B and 2.1.C, because the 2.1.A completion criteria required DB + storage):

- `src/shared` — `DomainError`, `parseOrThrow`, ULID IDs (branded per entity), structured logger.
- `src/core` — Zod schemas + factories for Project, Source, Asset (+ AssetRelation), Capture, Job (+ pure transition rules), Output; `StorageKey`; repository and `AssetStorage` ports. No framework/driver/Node I/O imports (enforced by `src/core/architecture.test.ts`).
- `src/infrastructure/db` — SQLite (`better-sqlite3`) + Drizzle, WAL, foreign keys, migration `0000_foundation` applied on open, `DB_SCHEMA_MISMATCH` on newer/edited migrations; repositories for all six entities with Zod validation on write and read.
- `src/infrastructure/storage` — `LocalAssetStorage`: key validation, root confinement (incl. junction/symlink), SHA-256, no-overwrite atomic publish, dedupe, staging with all-or-nothing commit.
- `ATLAS_HOME` (default `./.atlas`, git-ignored) holds `atlas.db` and `storage/`. `npm run db:migrate` initializes it.
- Vitest: `npm test` (160 tests). `npm run typecheck`.

Not wired yet: **nothing in the running app uses the new foundation.** The v1 pipeline (`app/`, `lib/`, `catalog.json`, `public/generated`) is unchanged, except that four legacy routes now validate slugs with the domain `SlugSchema`.

## Work allowed now

- build the legacy read adapter (`catalog.json` → Zod legacy schema → Project/Source/Asset descriptors);
- keep existing project views working during migration;
- add tests around the adapter;
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
7. create legacy adapter; ← next
8. migrate one narrow capture flow end-to-end (2.1.E jobs + 2.1.F slice);
9. verify;
10. expand only after passing criteria.

## Completion criteria for 2.1.D

- Legacy `catalog.json` has a Zod schema covering every shape written by Atlas v0.1–v1.7 (optional fields included).
- Every project in `public/generated/` either parses or is reported with a structured, non-fatal reason.
- Adapter maps a legacy project to Project + Source + asset descriptors (storage keys relative, no absolute paths) **without writing or moving legacy files**.
- Existing `/projects` and `/projects/[slug]` views keep working.
- Tests cover valid, partial and corrupt legacy catalogs.
- typecheck, lint, test and build clean.

## Agent rule

When this milestone is complete, update this file to the next milestone and stop.

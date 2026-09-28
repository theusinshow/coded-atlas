# MIGRATION — Current Atlas → New Architecture

## Strategy

Incremental migration. Do not rewrite the product from zero.

## Current valuable capabilities to preserve

The existing repository already contains working concepts including desktop/mobile/full-page capture, sections, pages, states, thumbnails, cover, inspection, videos, mockups, 3D-style mockups, social kit, case draft, portfolio manifest, visual diff, project library, command palette and ZIP export.

These are assets, not technical debt to discard wholesale.

## Legacy model

```text
ProjectInput
↓
capture pipeline
↓
catalog.json
↓
public/generated/[slug]
```

## Target model

```text
Project + Sources
↓
Captures
↓
Assets
↓
Jobs
↓
Outputs
```

Persistent metadata: SQLite. Bytes: AssetStorage.

## Superseded legacy decisions

The following old rules are explicitly superseded:

- “no database”
- “no AI”
- “catalog.json is source of truth”
- “all generation occurs in one request”
- “public/generated is persistent application database”

They were correct for the original MVP, not for the new product.

## Legacy adapter

Implement a read adapter capable of mapping old `catalog.json` projects into the new application model without immediately rewriting their files.

Goals: existing projects remain visible, no destructive batch migration, migration per project and rollback possibility.

## Suggested migration order

1. introduce DB without changing current capture;
2. create Project/Source records for new runs;
3. register current generated files as Assets;
4. serve project library from new repositories;
5. migrate capture orchestration to Jobs;
6. move persistent bytes behind AssetStorage;
7. retire legacy writes only after equivalent functionality passes tests.

## Transactional recapture

Replace destructive recapture with stage → capture → validate → commit.

## Legacy `catalog.json`

May continue temporarily for compatibility/export/debugging, but must not remain authoritative.

## Foundation scope

Do not redesign Social Kit, Case, Motion or Mockups during 2.1 unless necessary to route them safely through the new foundation.

## Compatibility details found in the v1 code (2026-09-27)

Relevant for the legacy adapter (2.1.D) and the first migrated slice (2.1.F):

- **Identity is the slug.** v1 has no IDs: the folder name under `public/generated/` *is* the project. The adapter must mint a ULID per legacy project and keep the slug as a property; `/projects/[slug]` URLs must keep working.
- **`catalog.json` shape grew by version** (`version` field: `0.1.0` → `0.2.0`). Fields like `videos`, `pages`, `states`, `inspection`, `cover`, `compositions`, `mockups` are optional and absent in older catalogs. `list-projects.ts` currently skips unreadable catalogs silently — the adapter must report them instead.
- **Paths in `catalog.json` are public URLs** (`/generated/<slug>/...`). Mapping to storage keys means stripping `/generated/` and validating each segment; legacy file names contain uppercase-free, hyphenated names today, but that must be validated, not assumed.
- **Authored content lives next to generated files:** `case-draft.mdx` is user-written and survives reprocessing (`ensure-project-folder.ts` copies it forward). It is not a capture artifact and must never be deleted by a migration.
- **Reprocessing already uses a backup lease:** `ensure-project-folder.ts` moves the previous version to `public/generated/.trash/<slug>-<ts>` and restores it on failure/cancel. Folders starting with `.` are not projects.
- **Visual diff results** live in `public/generated/<slug>/diffs/` and depend on the previous capture existing on disk.
- **Authenticated capture state** (`auth/<slug>.json`) holds live cookies, lives outside `public/`, is git-ignored and must never be copied into `.atlas/` or exported.
- **Slug validation was inconsistent:** `/api/case`, `/api/export/[slug]`, `/api/zip/[slug]` and `DELETE /api/projects/[slug]` accepted any string (traversal-capable). Fixed in 2.1.A by validating with the domain `SlugSchema`; `lib/storage/paths.ts` still builds paths without `resolveWithin` (2.1.G).
- **Silent optional failures:** `generate-showcase.ts`, `inspect-site.ts` and `capture-device.ts` use `.catch(() => [])` / `.catch(() => undefined)`; extra pages/states failures only `console.warn`. These become structured warnings in 2.1.G.
- **Cancellation today** aborts the SSE request and closes Chromium, then rolls back the folder. It is not a persisted job; a server restart mid-generation leaves a `.trash` backup behind.
- **Legacy scripts leave backups behind:** `scripts/test-phase3.ts` (and other scripts that call `ensureProjectFolder` directly) never commit the lease, so a second run leaves `public/generated/.trash/<slug>-<ts>`. Harmless (dot-folders are ignored), but it is litter to clean when those scripts are retired.
- **Legacy scan result (2026-09-27):** 9 projects, catalogs `0.1.0` (3) and `0.2.0` (6), all valid against `LegacyCatalogSchema`, all referenced files present, ~183 MB total. Files on disk not referenced by `catalog.json` (e.g. `diffs/`, `case-draft.mdx`) are not file descriptors; `case-draft.mdx` is reported as `caseDraftPresent`.
- **2.1.G changes to v1 behaviour (all additive):** `catalog.json` may contain `warnings`; `projectDir()` throws for invalid slugs (the UI never produced them — only a legacy test script did); interrupted recaptures are restored at server start; very long pages get a truncated full page with a `FULLPAGE_TRUNCATED` warning; generations longer than `generationTimeoutMs` (10 min) are aborted and rolled back.
- **2.2:** migration steps 2–4 of the suggested order are done — new projects are created as Project/Source records, v1 generated files are registered as Assets/Outputs by the import job, and the project library (`/projects`) is served from the repositories. v1 screens moved to `/legacy`; `/generate` stays until the 2.3 capture pipeline replaces it.
- **3.1.A/B:** v1 authenticated capture (`scripts/login.mjs` → `auth/<slug>.json`) becomes `npm run atlas:login -- <slug>` → `<ATLAS_HOME>/auth/<projectId>.json` (log in again; v1 sessions are not copied). v1 monitoring (`/api/diff/[slug]`) becomes Capture → Comparar capturas (`diff` job, derived Asset).
- **2.14:** v1 export (`/api/export/[slug]`, `/api/zip/[slug]`) and the portfolio manifest (`lib/capture/build-portfolio-manifest.ts`) have 2.x equivalents: packages in Publicar and `portfolio.json` from the Portfólio page, with the same entry fields plus `pieces`/`case`. The v1 routes stay for legacy catalogs until the v1 screens are retired.
- **2.13:** the v1 case (`case-draft.mdx` + `/api/case`) is replaced by `case` documents (Projeto → Case). The MDX draft is user-written and is left untouched on disk; it is not converted. The v1 route stays reachable under `/legacy` until retirement.
- **2.8:** the v1 had no carousel; multi-page pieces are new in 2.x. The ZIP helper replaces ad-hoc zipping for new work; the v1 `/api/zip/[slug]` stays for legacy catalogs.
- **2.5:** manual refinement (WORKFLOWS → C) now happens in the Studio Canvas; there is no v1 equivalent to migrate.
- **2.4:** the v1 social kit / mockup pieces now have 2.x equivalents (Criar → render jobs → Outputs in Publicar). v1 pieces imported as Outputs are listed separately in Publicar. `/generate` and `/legacy` stay reachable under "v1" until Media Kits (2.11) and Case Builder (2.13) cover the rest.
- **2.3:** the capture flow is migrated to jobs (step 5 of the suggested order) and persistent bytes live behind AssetStorage (step 6). v1 `/generate` remains available under "v1" but the main flow is `/projects/[slug]/capture`. Legacy writes (step 7) retire when the v1 screens are removed after the 2.x equivalents of social kit/mockups/case ship (2.4, 2.13).

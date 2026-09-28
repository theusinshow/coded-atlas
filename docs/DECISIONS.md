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

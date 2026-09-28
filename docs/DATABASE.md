# DATABASE — Coded Atlas

## Choice

SQLite + Drizzle ORM.

## Purpose

SQLite persists metadata and workflow state. Media bytes remain in filesystem storage.

## Initial tables — Foundation

Implement only what the active phase requires:

- `projects`
- `sources`
- `assets`
- `asset_relations`
- `captures`
- `jobs`
- `outputs`

Future tables are documented but must not be created prematurely: visual profiles, creative sessions/plans/jobs, composition instances, creative documents/revisions, presets, render jobs, media kits, exports, creative memory and AI usage.

## Rules

- foreign keys enabled;
- WAL enabled;
- migrations versioned;
- IDs are stable ULIDs;
- slug is not identity;
- timestamps explicit;
- no media BLOBs;
- JSON only for nested structures that do not need frequent relational filtering;
- every JSON payload validated with Zod on boundary crossing.

## JSON policy

Use normal columns for identity, foreign keys, status, timestamps, searchable/filterable fields and common sorting fields.

Use JSON for layer trees, animation structures, flexible configs, creative direction and structured snapshots.

## Repositories

Domain/application code uses repository interfaces. Drizzle queries stay within infrastructure repositories/services.

## Transactions

Use transactions for state changes that must remain atomic.

## Migrations

Never edit a migration already considered applied in a real workspace. Create a new migration.

The app must detect schema mismatch and fail with an actionable error instead of corrupting data.

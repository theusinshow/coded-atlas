# STORAGE — Coded Atlas

## Principle

SQLite stores metadata. Filesystem stores bytes.

## Root

```text
.atlas/
├── atlas.db
├── storage/
│   ├── originals/
│   ├── captures/
│   ├── assets/
│   ├── renders/
│   ├── thumbnails/
│   ├── previews/
│   └── cache/
└── exports/
```

Exact folder names may evolve, but callers must not depend on them.

Implemented (2.1.A): the root is `ATLAS_HOME` (default `./.atlas`, git-ignored). `LocalAssetStorage` maps a key `a/b/c.png` to `<ATLAS_HOME>/storage/a/b/c.png`; `<storage>/.staging/` is its private work area (keys can never start with `.`). Content-addressed keys use `contentStorageKey(namespace, sha256, ext)` → `<namespace>/<ab>/<sha256>.<ext>`. Key rules: `docs/DECISIONS.md` ADR-021.

## AssetStorage

All file access goes through an abstraction with concepts equivalent to put, get, stat, copy, delete and exists.

V1 implementation: `LocalAssetStorage`.

Future-compatible implementations may include S3/R2, but do not implement them now.

## Storage key

Domain records store a `storageKey`, never a machine-specific absolute path.

## Hashing

Use SHA-256 for deduplication, cache keys, change detection, lineage and render invalidation.

## Immutability

Assets and Outputs are immutable. Editing creates a derived asset.

## Transactional generation

Never destroy the valid current project before replacement generation succeeds.

Use staging → execute → validate → commit.

## Legacy

`public/generated/[slug]` remains readable during migration through a legacy adapter. New code must not add new persistent responsibilities to that structure.

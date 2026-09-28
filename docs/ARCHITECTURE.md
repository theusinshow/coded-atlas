# ARCHITECTURE — Coded Atlas

## Macro architecture

```text
Next.js UI
   │
Application Layer
   │
Atlas Core
   ├── Projects
   ├── Assets
   ├── Creative
   ├── Documents
   ├── Jobs
   └── Events
   │
Modules
   ├── Import
   ├── Capture
   ├── Understand
   ├── Studio
   ├── Motion
   ├── Render
   └── Publish
   │
Infrastructure
   ├── SQLite / Drizzle
   ├── LocalAssetStorage
   ├── Playwright
   ├── Sharp
   ├── Remotion
   ├── FFmpeg
   └── OpenAI
```

## Dependency direction

Dependencies point inward.

```text
UI → Application → Domain
Infrastructure → Domain contracts
```

Domain must not import Next.js, React, Playwright, Sharp, FFmpeg, Remotion, OpenAI SDK or Drizzle.

## Suggested structure

```text
src/
├── app/
├── core/
│   ├── projects/
│   ├── assets/
│   ├── creative/
│   ├── documents/
│   ├── jobs/
│   └── events/
├── modules/
│   ├── import/
│   ├── capture/
│   ├── understand/
│   ├── studio/
│   ├── motion/
│   ├── render/
│   └── publish/
├── intelligence/
│   ├── brain/
│   ├── context/
│   ├── memory/
│   ├── guardrails/
│   └── gateways/
├── infrastructure/
│   ├── db/
│   ├── storage/
│   ├── playwright/
│   ├── sharp/
│   ├── remotion/
│   ├── ffmpeg/
│   └── ai/openai/
├── workers/
└── shared/
```

## Persistent truth

SQLite is the persistent source of truth for metadata and state. Filesystem is the source of bytes for media.

`catalog.json` becomes a legacy/export format, not authoritative application state.

## Job model

Capture, render and export are background jobs.

```text
UI
↓
create job
↓
worker claims job
↓
progress persisted
↓
SSE/event update
↓
job completed
```

A user disconnect must not orphan work. Cancellation must propagate to the underlying operation.

## Transaction boundaries

Operations that replace a valid project state must stage changes first.

```text
prepare temp state
↓
execute
↓
validate
↓
commit/rename
```

Never delete valid previous state before the new state is usable.

## External adapters

Use explicit adapters:

- `AssetStorage`
- `ModelGateway`
- `MotionRenderer`
- `StaticRenderer`
- `CaptureEngine`

Application code depends on interfaces, not vendor SDKs.

## Events

Typed events may include `project.created`, `source.synced`, `asset.created`, `capture.completed`, `visual-profile.created`, `creative-plan.approved`, `render.completed`, `output.created`, `media-kit.ready` and `export.completed`.

V1 can use an in-process bus plus persisted job/event state where necessary.

## Security boundaries

- URLs use explicit URL policy.
- Hosted-safe mode blocks private/loopback/link-local targets and revalidates redirects.
- Filesystem paths are confined to Atlas roots.
- Slugs never bypass ID/path validation.
- AI has no raw shell, SQL, filesystem or arbitrary network tool.
- Secrets never enter exported project data.

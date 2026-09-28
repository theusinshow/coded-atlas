# STACK — Coded Atlas

## Application

- Next.js App Router
- React
- TypeScript strict
- Tailwind CSS

Framework upgrade and domain migration are separate workstreams.

## Domain / validation

- TypeScript
- Zod
- ULID

A domain schema should be defined once and reused for TypeScript inference, runtime validation, AI Structured Outputs where appropriate and persistence-boundary validation.

## Database

- SQLite
- Drizzle ORM
- `better-sqlite3` initially
- WAL mode

## UI state

- SQLite = persistent truth
- Zustand = ephemeral editor/UI state

Never store persistent project truth only in Zustand.

## Storage

- local filesystem
- `AssetStorage` abstraction
- SHA-256 hashing

## Capture

- Playwright

## Static media

- HTML/CSS
- Playwright
- Sharp

## Motion/video

- React
- Remotion adapter
- FFmpeg

`MotionDocument` is an Atlas domain format. It must not become a Remotion-specific type.

## AI

- OpenAI Responses API
- GPT-6 Luna as default creative model
- `ModelGateway` abstraction
- Structured Outputs
- usage/cost tracking

## Background work

- Node workers
- SQLite-backed jobs
- SSE/event updates to UI

Do not add Redis/BullMQ until a real distributed-worker requirement exists.

## Tests

- Vitest
- Playwright Test
- focused real capture/render integration tests

## Explicit non-goals for now

PostgreSQL, Supabase, Firebase, Redis, Kafka, microservices, Kubernetes, mandatory Docker, desktop packaging and mandatory cloud storage.

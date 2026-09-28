# ROADMAP — Coded Atlas

## Rule

One phase at a time. A future phase appearing here does not authorize implementation while another phase is active in `CURRENT.md`.

## Milestone A — Foundation

### Atlas 2.1 — Foundation

Goal: replace fragile persistence/orchestration foundations without breaking current capture behavior.

Deliver:

- domain folder structure;
- Zod;
- SQLite + Drizzle + migrations;
- Project, Source, Asset, Capture, Output and Job;
- AssetStorage;
- structured logging;
- typed errors/warnings;
- transactional generation;
- real cancellation;
- project/job locking;
- safe path policy;
- URL policy;
- legacy catalog adapter;
- test foundation.

Exit criteria:

```text
create project
↓
register source
↓
capture
↓
persist metadata in SQLite
↓
store bytes through AssetStorage
↓
reload project
```

### Atlas 2.2 — Project System

Project Library, Overview, project lifecycle, Sources, search, archive, URL/manual import and GitHub/local source groundwork.

### Atlas 2.3 — Asset & Capture System

Formal Asset Library, Page/Section/State/Device captures, lineage, dedupe, migrate current capture outputs, thumbnails, cover and inspection.

## Milestone B — Creative

### Atlas 2.4 — Composition Engine

CompositionDefinition, variants, bindings, style tokens, brand adapter, curated compositions, Quick Create and static renderer.

### Atlas 2.5 — Studio Canvas

CanvasDocument, Layer, Transform, Inspector, selection, history, undo/redo and autosave.

### Atlas 2.6 — Atlas Brain

ModelGateway, OpenAI Responses adapter, ContextBuilder, structured outputs, smart asset selection, composition recommendation, CreativePlan and AI usage tracking.

### Atlas 2.7 — Creative System

CreativeSession, CreativeDirection, CreativeJob, VisualProfile evolution, project/workspace creative memory and guardrails.

### Atlas 2.8 — Carousel & Multi-page Documents

CreativeDocument abstraction, CarouselDocument, slide storyboard and multi-output static workflows.

## Milestone C — Motion

### Atlas 2.9 — Motion Foundation

MotionDocument, Scene, AnimationTrack, MotionPreset, scene strip, preset-driven motion and Website Scroll.

### Atlas 2.10 — Video Engine

VideoRecipe, storyboard, transitions, basic audio, captured motion, Remotion adapter and FFmpeg render pipeline.

### Atlas 2.11 — Media Kits

MediaKit, presets, shared CreativeDirection, Generate Media Kit and batch render orchestration.

## Milestone D — Publishing

### Atlas 2.12 — Presentation Studio

PresentationDocument, slide presets and PDF/PPTX/images.

### Atlas 2.13 — Case Builder

CaseDocument, sections and web/PDF/Behance-style output.

### Atlas 2.14 — Publish & Portfolio

Export, packages, portfolio integration and optional GitHub destination.

## Atlas 3.0

3.0 is earned when the complete loop is reliable:

```text
Import
↓
Capture
↓
Understand
↓
Create
↓
Motion
↓
Render
↓
Publish
```

Primary proof:

```text
Project URL
↓
Generate Media Kit
↓
Review
↓
Render
↓
Export
```

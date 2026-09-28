# DOMAIN MODEL — Coded Atlas

## Root flow

```text
Source
↓
Project
↓
Capture / Ingest
↓
Asset
↓
VisualProfile
↓
CreativePlan
↓
CreativeJob
↓
CreativeDocument
↓
RenderJob
↓
Output
↓
MediaKit
↓
Export
```

## Project

Root aggregate for one digital project. Key properties: stable ID, slug, name, client, category, status, cover asset, timestamps and schema version.

Project does not embed all assets/jobs/documents.

## Source

Origin of project material.

Types: `url`, `github`, `local`, `upload`.

A project may contain multiple sources.

## Asset

Reusable creative material.

Types may include image, screenshot, section, logo, icon, video, motion-clip, font, illustration, background and document.

Rules: immutable bytes, stable ID, `storageKey`, SHA-256 hash and optional lineage via `parentAssetId`.

## Capture

Represents an operation, not a file.

Types: page, section, state, device, motion.

A Capture references resulting Asset IDs.

## VisualProfile

Versioned understanding of a project: colors, typography, logos, visual traits, important sections, recommended assets, evidence and origin.

## CreativePlan

A proposal, not an output. Contains goal, Creative Direction, deliverables, selected assets, input snapshot and status.

## CreativeJob

Operational unit for creation.

Types: social-post, carousel, story, showcase, motion, video, presentation, case and media-kit.

## CompositionDefinition

Reusable composition recipe containing slots, layout, variants, style, constraints, capabilities and version.

## CompositionInstance

A CompositionDefinition bound to real project assets/text/style. It may render directly or materialize into a CanvasDocument.

## CreativeDocument

Family: StaticDocument, CarouselDocument, PresentationDocument, MotionDocument and CaseDocument.

## CanvasDocument

Editable static document containing dimensions, background, layers, source composition and revision.

## Layer

Shared primitive. Initial types: asset, text, shape, device, browser and group.

## MotionDocument / Scene

MotionDocument is temporal and composed of Scenes. Scenes contain duration, Layers, AnimationTracks, transitions and background.

## Preset

Types: brand, composition, motion, export, presentation and media-kit.

Scopes: Atlas, workspace, project.

## RenderJob

Turns a concrete document revision into one or more Outputs.

## Output

Immutable final file. Formats may include PNG, JPG, WebP, MP4, WebM, PDF and PPTX.

## MediaKit

Groups deliverables under one Creative Direction.

## Export

Represents preparation/delivery of Outputs to a destination.

## Versioning policy

Immutable: Asset, Output.

Revisioned: CanvasDocument, VisualProfile, CompositionDefinition, Preset, CreativePlan.

Stateful: Capture, CreativeJob, RenderJob, Export, MediaKit.

Simple mutable: Project, Source.

## Snapshot rule

Creative decisions capture versions of VisualProfile, assets, compositions and presets. Changing a preset tomorrow must not silently mutate old work.

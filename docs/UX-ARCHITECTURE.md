# UX ARCHITECTURE — Coded Atlas

## Global navigation

```text
Projetos · Social · Portfólio             Buscar (⌘K) · Atividade (jobs) · Ajustes
```

Only the places where work happens are primary links: projects, the Instagram planner (Social, 3.2.D) and the portfolio. Search, activity (a live count of queued/running jobs, linking to `/jobs`) and settings are utilities on the right. The asset library (`/library`) opens from Projetos and ⌘K. Do not promote every creation type to global navigation.

## Project navigation

The project is a three-step flow (owner decision 2026-09-29, ADR-046). Existing URLs are kept, and each step groups screens under a light sub-navigation:

```text
Visão geral · 1 Material · 2 Criar · 3 Entregar                 ⚙ Ajustes do projeto
                 │            │           └ publish
                 │            └ create (Início) · kits · cases · plans
                 └ assets · capture
```

Visão geral answers "what should I do now?" with a single **Próximo passo** (`src/modules/projects/next-step.ts`: capture → Media Kit → render → case → deliver) and the status of the three steps.

## Main journey

```text
New Project
↓
Import
↓
Capture
↓
Understand
↓
Project Overview
↓
Generate Media Kit
↓
Review Creative Plan
↓
Generate
↓
Review/Edit
↓
Render
↓
Export
```

## Progressive disclosure

```text
Quick
↓
Edit
↓
Animate
```

### Quick

Controls: composition, variant, assets, text, ratio and style.

### Edit

Constrained canvas: move, resize, crop, opacity, rotation, radius, shadow, background, text, alignment and asset replacement.

### Animate

Scene-based motion with presets.

## Overview

Must answer: what is this project, what sources exist, how much material exists, is it ready to create media, and what does Atlas recommend creating?

Primary CTA: `Generate Media Kit`.

Secondary CTA: `Create`.

## Assets

Visual grid with filters for screenshots, sections, mobile, images, logos, videos, motion and fonts.

Smart action: `Find strongest assets`.

## Create

Entry points: Social Post, Carousel, Story, Reel, Showcase Image, Showcase Video, Presentation, Case Study, Media Kit and Custom.

## Studio layout

```text
Left: Layers / Assets
Center: Preview / Canvas
Right: Inspector
Bottom when motion: Scenes / Timeline
```

## Jobs

Long work never blocks the app. Global Jobs screen shows queued, running, encoding, completed, failed and cancelled jobs.

## Publish

Contains finalized work: Outputs, Media Kits, Packages and Portfolio.

## Notifications

Notify meaningful events such as completed job, failed render and ready export. Do not toast every autosave or local edit.

## Command palette

Keep `Ctrl/Cmd + K` for navigation and common actions.

## Accessibility

Visible focus, keyboard navigation, semantic dialogs, focus management, reduced-motion support, sufficient contrast and labels for icon-only actions.

## Social (Instagram planner, 3.2.D)

`/social` is where the Coded by M Instagram is planned from pieces already rendered in any project.

- **Feed:** a preview of the profile grid (3 columns, 3:4 cells, newest first) with a status mark per post (draft, ready, posted) and a type mark (carousel, reel). Selecting a cell opens the editor beside it.
- **Stories:** 9:16 cards with an optional overlay for the areas the Instagram UI covers.
- **Editor:** Instagram-style preview (swipeable carousel), status (draft → ready → posted), blocking checks and warnings from the Instagram rules (`src/core/social/social-post.ts`), caption with counter (2,200), hashtags with counter (30), planned day, copy the final caption, download the pack (numbered pieces + `legenda.txt`), move within the grid, delete.
- **New post:** choose the type (Post, Carrossel, Reel, Story), then pick only the pieces that fit that type, grouped by project. For carousels, click order is slide order.
- **The Atlas never publishes.** "Publicado" is a manual mark made after posting.

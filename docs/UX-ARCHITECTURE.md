# UX ARCHITECTURE — Coded Atlas

## Global navigation

```text
Projects
Library
Jobs
Presets
Settings
```

Do not promote every creation type to global navigation.

## Project navigation

```text
Overview
Capture
Assets
Create
Publish
```

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

# COMPOSITION ENGINE — Coded Atlas

## Goal

Generate high-quality visual pieces from reusable curated systems.

## Core chain

```text
CompositionDefinition
+
Bindings
+
Variant
+
Style
↓
CompositionInstance
↓
Quick Render
or
CanvasDocument
```

## CompositionDefinition

Defines category, supported ratios, slots, layout, variants, style rules, constraints, capabilities, origin and version.

## Slots

Slots describe intent, not real assets.

Examples: `primaryScreenshot`, `secondaryScreenshot`, `projectLogo`, `title`, `subtitle`, `accentColor`.

Each slot declares type, role, required state, accepted asset types, preferred ratio, constraints and fallback.

## Binding

A CompositionBinding connects a slot to a real value.

```text
primaryScreenshot → asset_hero_desktop
secondaryScreenshot → asset_hero_mobile
projectLogo → asset_logo
title → "Zion Guincho"
```

## Variants

One composition may expose multiple curated layouts. Do not duplicate a template only to move one device.

## Layout

Prefer constraints and normalized geometry over fixed pixel assumptions. Rendering may resolve to HTML/CSS. Do not build a proprietary CSS/layout engine.

## Style tokens

Prefer semantic references such as `project.background`, `brand.primary`, `text.primary`, `font.display` and `shadow.device`.

## Style modes

- `project`
- `atlas`
- `hybrid`

Default: `hybrid`.

## Brand Adapter

Maps project VisualProfile + preset into concrete tokens. A project must retain its identity even when rendered through Coded by M composition systems.

## Capabilities

Definitions state compatibility: motion, text, brand adaptation, supported ratios, min/max assets and multi-page support.

## Constraints

Examples: safe area, title line limit, logo max size, primary asset coverage and required desktop/mobile slots.

## Materialization

`CompositionInstance → CanvasDocument`

Materializing allows manual divergence while retaining source composition ID/version.

## Small overrides

Not every change requires Canvas. CompositionInstance may support text, visibility, style and limited layout overrides.

## Initial curated families

Showcase, Mobile, Editorial, Feature, Detail, Comparison, Typography, Color, Grid, Intro, Outro, Presentation and Case.

## Initial compositions

1. Desktop Hero
2. Desktop + Mobile
3. Floating Devices
4. Editorial Split
5. Mobile Stack
6. UI Details Grid
7. Single Feature
8. Typography + Colors
9. Project Reveal
10. Project Closing

## Anti-slop rule

AI selects among curated composition systems. AI does not invent arbitrary layout markup as the normal generation path.

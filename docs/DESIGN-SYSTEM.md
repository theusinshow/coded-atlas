# DESIGN SYSTEM — Coded Atlas

## Source

The Atlas design system derives from the **Coded by M design system**.

Do not invent exact brand values when they are not available in the current repository. When implementation begins, copy/map the canonical Coded by M tokens from their real source.

## Architecture

```text
Coded by M Foundation Tokens
            ↓
Atlas Semantic Tokens
            ↓
Atlas Components
```

## Foundation categories

Reuse typography, spacing, grid, radius, borders, shadows, colors, motion, iconography, interaction states and dark mode from Coded by M.

## Atlas semantic layer

Examples:

- `atlas.canvas.background`
- `atlas.panel.background`
- `atlas.timeline.track`
- `atlas.timeline.playhead`
- `atlas.layer.selected`
- `atlas.asset.hover`
- `atlas.render.running`
- `atlas.render.failed`
- `atlas.job.queued`
- `atlas.focus`

These map to foundation tokens; they do not create a second brand.

## Product components

- App Shell
- Project Card
- Asset Card/Grid
- Canvas
- Layer Row
- Inspector
- Composition Card
- Preset Card
- Scene Strip
- Timeline
- Render Job Row
- Creative Direction Card
- Media Kit Item

## Visual principles

Dark mode first, strong hierarchy, controlled contrast, minimal decorative color, restrained borders, clear selected/focus states, technical precision, deliberate whitespace and functional motion.

## Rule for agents

If a needed component already exists in Coded by M, reuse it. If not, define semantic role, map foundation tokens, implement reusable component and document states.

## AI-slop guard rails

Discourage arbitrary gradients, floating decorative spheres, excessive glow, unrelated illustrations, glass cards everywhere, fake metrics, decorative badges without meaning, excessive pill UI and visual noise.

## Project media vs Atlas UI

Atlas UI uses Coded by M. Generated media may use project, Atlas or hybrid style. Default generated-media mode: `hybrid`.

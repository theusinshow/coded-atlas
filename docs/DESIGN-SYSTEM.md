# DESIGN SYSTEM — Coded Atlas

## Source

The Atlas design system derives from the **Coded by M design system** (cbm-port@0.1.0, delivered by the owner on 2026-09-28). A copy of its canonical guidance lives in `docs/design-system/coded-by-m/`: `README.md` (hard rules) and `DESIGN-LANGUAGE.md` (visual grammar, production values). When they disagree with anything here, they win.

**Core:** a deep base, warm structure and a single signal that cuts. There is no pure black or white, `border-radius` is 0, and red is rare (at most 2–3 per screen).

## Mapping (implemented)

| Foundation (Coded by M) | Atlas token / usage |
|---|---|
| `#000F08` base | `--color-base` (page) · `background` of the Coded by M style |
| `#070B08` forest | `--color-surface` (panels, cards) |
| `#0A120C` SURFACE.frame | `--color-surface-2` (inputs, hover) |
| `#1A2418` border-active / `#111511` border | `--color-line` (control borders must stay legible) / `--color-line-soft` |
| `#F5F2ED` off-white | text; `--color-accent` = emphasis in structure |
| `#FB3640` signal / `#C42030` red-dark | `--color-signal`/`-dark`: primary action, focus (2px, offset 3), active marker, error; `--color-accent-bright` = link hover ("hover reveals") |
| gray-100/200/400/600/800 | `cbm-gray-*` utilities. Readable text never goes below gray-400 (AA 4.7:1); gray-600 is decorative only |
| Panchang (display) · Satoshi (body) | `font-display` (page titles, primary button, wordmark) · `font-sans`; files in `public/fonts/cbm/` |
| micro-label: Satoshi 500 uppercase, wide tracking | `LABEL_CLASS`, `SectionTitle`, eyebrow (signal @ 0.7 with a short rule) |

**Atlas semantic status** (`--color-ok`, `--color-warn`): the Coded by M system defines no green or yellow. These are desaturated warm tones used only for job/render state, never as decoration. `--color-bad` is the signal red.

**Generated media, "Coded by M" style** (`ATLAS_TOKENS`, `src/core/creative/tokens.ts`):
- Colors are the same palette. Fonts are Panchang for display and Satoshi for body and labels.
- `radiusScale: 0` gives square corners. `frame: "cbm"` draws the cbm-port BrowserFrame: one signal dot, an off-white 15% edge and a red corner mark.
- Panchang is 49% wider than the grotesk the compositions were drawn for, measured in Chromium. The kernel compensates the type size through `widthFactor` so lines keep their designed width.
- The hybrid style keeps the Coded by M neutrals and shape and adds the project's brand color and display font. The project style keeps the project's own radii and a neutral frame.

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

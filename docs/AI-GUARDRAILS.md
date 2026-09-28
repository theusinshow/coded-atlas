# AI GUARDRAILS — Coded Atlas

## Purpose

Keep AI useful, bounded and consistent with the Coded by M creative standard.

## Never allow AI to

- write directly to SQLite;
- write raw files;
- execute shell commands;
- call FFmpeg directly;
- access arbitrary URLs through unrestricted HTTP;
- delete projects;
- publish autonomously;
- invent IDs not supplied/created through valid services;
- bypass schema validation;
- emit arbitrary production HTML/CSS as the normal composition mechanism.

## Validation chain

```text
Model output
↓
JSON/schema validation
↓
domain validation
↓
compatibility validation
↓
application action
```

If invalid, request repair or fall back deterministically. Never silently coerce structurally invalid output.

## Creative guardrails

Discourage arbitrary gradients, excessive glow, glassmorphism everywhere, random decorative geometry, generic AI SaaS cards, fake metrics, unrelated imagery, overuse of accent, inconsistent typography and over-animation.

## Curated generation

The model chooses available assets, curated compositions, variants, presets, recipes and supported formats. It should not invent a new visual language for every output.

## Explainability

Store compact rationale where useful: why an asset was selected, why a composition fits, why a storyboard uses a sequence.

Rationale is not executable state.

## User approval

Drafts/previews may run at configured autonomy level. Publishing and destructive actions require explicit user action.

## Prompt structure

Prefer stable system core, stable product rules, stable tools/schemas, workspace rules, project context and current request, in that order.

## Evals

Maintain representative fixtures covering landing page, e-commerce, dashboard, portfolio, industrial/service and architecture/design sites.

Evaluate validity, asset selection, composition compatibility, consistency, latency, tokens and cost.

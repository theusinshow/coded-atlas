# ATLAS BRAIN — Coded Atlas

## Role

Atlas Brain is the product's **Creative Director**. It makes judgments and creates structured plans. It does not execute low-level media operations.

## Architecture

```text
Creative Request
↓
Context Builder
↓
Reasoning Router
↓
Model Gateway
↓
GPT-6 Luna
↓
Structured Output
↓
Schema Validation
↓
Domain Validation
↓
Application Services
```

## Model abstraction

Domain code depends on `ModelGateway`, not directly on OpenAI SDK.

Initial implementation: `OpenAIResponsesGateway → GPT-6 Luna`.

## Context Builder

Send only context required for the current task.

Context packs: Project, Visual, Social, Motion and Presentation.

## Asset shortlist

Do deterministic filtering before multimodal reasoning: remove duplicates, invalid/low-quality assets, filter by ratio/type, prioritize important sections and cap shortlist.

## Structured Outputs

Machine-operational Brain outputs use schemas.

Examples: CreativePlan, AssetSelection, Storyboard, CompositionRecommendation and CreativeDirection.

Freeform prose may exist as explanation, never as control protocol.

## Tools

### Read

Project overview, visual profile, asset search/details, composition search/details, preset search and recipe search.

### Safe write

Create draft, request capture, request preview and revise Creative Plan.

### Not allowed

Raw filesystem, raw SQL, shell, arbitrary process spawn, unrestricted network, direct Git writes, destructive delete and autonomous publishing.

## Reasoning router

Conceptual levels: routine, creative and complex. Map them to model effort centrally.

## Creative memory

Workspace memory stores Coded by M preferences. Project memory stores approved/rejected patterns for one project.

Precedence:

```text
Current request
>
Project memory
>
Workspace memory
>
Atlas defaults
```

## Creative consistency

Media Kit items share one Creative Direction.

## Cost tracking

Record model, task, effort, input tokens, cached tokens, output tokens, estimated cost, latency and result status.

Support budget warnings/limits.

## Fallback

Atlas remains functional without AI. Capture, manual composition, edit, render and export must continue to work.

# BUILD PLAN — Coded Atlas 2.x

The complete roadmap lives in `ROADMAP.md`. The currently authorized scope lives in `CURRENT.md`.

> **Status (2026-09-27):** 2.1.A–**2.1.F concluídos e verificados** — o critério de saída da
> fase 2.1 (ROADMAP) passa de ponta a ponta. Próximo: **2.1.G — Hardening**.
> O Atlas v1 (captura, vitrine, diff, case, ZIP) segue funcionando sem alteração de comportamento.

## Baseline (antes de qualquer mudança — 2026-09-27, commit `ac93441`)

Ambiente: Windows 11, Node 24.15.0, npm 11.12.1, Next 15.5.19.

| Verificação | Resultado |
|---|---|
| `npm install` | OK |
| `npx tsc --noEmit` | OK, 0 erros |
| `npm run lint` | OK, 0 warnings (aviso: `next lint` depreciado no Next 16) |
| `npm run build` | OK, 14 rotas |
| `npm test` | **não existia** (sem framework de testes) |
| `npx tsx scripts/test-section-name.ts` | 21/21 |
| `npx tsx scripts/test-delete-project.ts` | 10/10 |
| `npx tsx scripts/test-reprocess.ts` | 16/16 |
| `npx tsx scripts/test-portfolio-manifest.ts` | 16/16 |
| `npx tsx scripts/test-phase1.ts` | 19/19 |
| `npx tsx scripts/test-phase3.ts` (captura real, example.com) | PNG gerado, 7.2s |

Não executados no baseline (dependem de sites reais/rede e demoram): `test-phase2/4–8`,
`test-capture-options`, `test-multipage`, `test-states`. Nenhuma falha preexistente conhecida.

## Atlas 2.1 — Foundation

### 2.1.A Baseline + scaffolding

- [x] Record baseline build/type/lint/test status.
- [x] Add/normalize `src/` architecture without mass-moving unrelated code. (`src/{core,infrastructure,shared}`; `app/ lib/ components/` intactos)
- [x] Add Zod. (v4)
- [x] Add ULID utility. (`src/shared/id.ts`, monotônico, IDs com brand por entidade)
- [x] Define Project schema.
- [x] Define Source schema.
- [x] Define Asset schema. (+ `AssetRelation`)
- [x] Define Capture schema.
- [x] Define Job schema. (+ tabela de transições pura)
- [x] Define Output schema.
- [x] Add domain error base. (`DomainError`, `src/shared/errors.ts`)
- [x] Add structured logger abstraction. (`src/shared/logger.ts`)

### 2.1.B Database

- [x] Add Drizzle.
- [x] Configure SQLite. (`better-sqlite3`, `src/infrastructure/db/client.ts`)
- [x] Enable foreign keys.
- [x] Enable WAL.
- [x] Create first migration. (`0000_foundation.sql`, 7 tabelas; aplicada ao abrir o banco; detecção de schema divergente)
- [x] Add ProjectRepository.
- [x] Add SourceRepository.
- [x] Add AssetRepository.
- [x] Add JobRepository. (create/get/list/transition atômica; claim/lock fica para 2.1.E)
- [x] Add OutputRepository.
- [x] Add temporary-database tests. (+ `CaptureRepository`)

### 2.1.C Storage

- [x] Define `AssetStorage`.
- [x] Implement `LocalAssetStorage`.
- [x] Add root confinement. (validação da key + `resolveWithin` + realpath contra junction/symlink)
- [x] Add SHA-256 hashing.
- [x] Add staging support. (commit tudo-ou-nada, discard)
- [x] Add storage tests.

### 2.1.D Legacy bridge

- [x] Define legacy catalog schema. (`src/modules/import/legacy/catalog-schema.ts`; asserção de compilação contra `lib/types.ts`)
- [x] Read existing catalog safely. (`GeneratedDirStore`: confinado, somente leitura, limite de 5 MB, pastas `.` ignoradas)
- [x] Map legacy project metadata. (→ `NewProjectInput` + source url; `description`/`inspection`/`options` preservados em `unmapped`)
- [x] Map legacy generated files to asset descriptors. (Asset vs Output, storage key `legacy/<slug>/…`, linhagem de thumbnail/capa, presença no disco)
- [x] Preserve existing project views during migration. (telas v1 intocadas; `npm run legacy:scan` para o relatório)

### 2.1.E Job foundation

- [x] Persist job states. (lock, heartbeat, progresso, pedido de cancelamento, resultado/erro no SQLite; migration `0001_job_queue`)
- [x] Implement safe claim/lock. (`claimNext` em `BEGIN IMMEDIATE`; corrida real entre 4 processos testada)
- [x] Implement cancellation signal contract. (`requestCancel` persistido → heartbeat/progresso → `AbortSignal` do handler → `cancelled`)
- [x] Implement progress updates. (`ctx.progress`, só o dono grava)
- [x] Prevent concurrent destructive jobs for same project. (filtro no claim + índice único parcial no banco)
- [x] Recover/mark stale jobs after abnormal shutdown. (`recoverStale` no start do worker: `failed/STALE`, ou `cancelled` se havia pedido)

### 2.1.F First migrated vertical slice

- [x] Create project. (`queueUrlCapture`; reaproveita o projeto pelo slug)
- [x] Add URL source. (sem duplicar a mesma URL)
- [x] Queue capture. (`POST /api/atlas/captures` → 202 com IDs; nada roda na request)
- [x] Capture one deterministic asset path through current engine. (`PlaywrightCaptureEngine` reaproveita `dismissOverlays`/`waitForPageStability` do v1; viewport desktop do `lib/config.ts`)
- [x] Store via AssetStorage. (staging → validação PNG → commit; chave `captures/<ab>/<sha256>.png`)
- [x] Persist Asset. (+ Capture com status e `coverAssetId` do projeto)
- [x] Create Output where appropriate. (não se aplica: a fatia não renderiza peça final — screenshot é Asset; Output entra com render)
- [x] Reload from DB. (`GET /api/atlas/projects/[id]`, bytes em `GET /api/atlas/assets/[id]/file`)
- [x] Verify UI compatibility. (telas v1 intactas; página de verificação `/lab/foundation`)

### 2.1.G Hardening

- [ ] Transactional generation.
- [ ] Central safe path validation. (parcial: nova fundação confinada; rotas legadas `case`, `export`, `zip`, `DELETE projects` agora validam slug — `lib/storage/paths.ts` ainda não passa por `resolveWithin`)
- [ ] URL policy. (entregue junto com 2.1.F: `local`/`hosted-safe`, DNS, guard de requisições e redirects no Playwright, entrada do `/api/generate` v1 — falta fechar no 2.1.G)
- [ ] Structured warnings.
- [ ] Runtime schema validation for persisted JSON. (feito para o SQLite novo e para a leitura do `catalog.json` pelo adapter; as telas v1 ainda fazem `JSON.parse(...) as Catalog`)
- [ ] Infinite-scroll guard.
- [ ] Explicit timeouts for long external processes. (parcial: `timeoutMs` por handler de job aborta o signal → `failed/TIMEOUT`; falta aplicar aos processos do pipeline)
- [ ] Build/lint/type/tests clean.

## Verificação de 2.1.A (2026-09-27)

| Comando | Resultado |
|---|---|
| `npm run typecheck` | OK |
| `npm run lint` | OK, 0 warnings |
| `npm test` | 6 arquivos, 160 testes OK |
| `npm run build` | OK |
| `npm run db:migrate` (ATLAS_HOME vazio, 2×) | 1ª: 1 migration aplicada, WAL, 7 tabelas; 2ª: nada a aplicar |
| scripts legados offline + `test-phase3` | mesmos resultados do baseline |
| `next start` + `/api/projects`, `/projects`, `/projects/estudio-lentz` | 200, projetos legados listados |
| `/api/case`, `/api/export`, `DELETE /api/projects` com `../` | 400 (antes: aceitavam) |
| `/api/export/estudio-lentz`, `/api/zip/estudio-lentz` | 200 |

## Verificação de 2.1.D (2026-09-27)

| Comando | Resultado |
|---|---|
| `npm run typecheck` | OK (inclui a asserção schema ↔ `lib/types.ts`; mutação proposital quebra a compilação) |
| `npm run lint` | OK, 0 warnings |
| `npm test` | 8 arquivos, 188 testes OK (mutação removendo o realpath do store derruba 2 testes) |
| `npm run build` | OK |
| `npm run legacy:scan` na biblioteca real | 9 pastas, 9 projetos legíveis (v0.1.0 e v0.2.0), 0 arquivos ausentes, 0 ressalvas |
| `next start`: `/projects`, `/projects/good-fella`, `/projects/example-com`, `/api/projects`, `/api/export/mj`, `/lab/coded-atlas` | 200; 9 projetos listados |
| scripts legados offline | mesmos resultados do baseline |

## Verificação de 2.1.E (2026-09-27)

| Comando | Resultado |
|---|---|
| `npm run typecheck` | OK |
| `npm run lint` | OK, 0 warnings |
| `npm test` | 10 arquivos, 219 testes OK; suíte rodada 3× seguidas sem falha intermitente |
| corrida de claim (4 processos Node reais, 40 jobs) | cada job reservado 1×, ≥3 processos participando; 5 execuções OK |
| mutação `immediate → deferred` | teste de corrida falha (`database is locked`) 3/3 |
| upgrade de banco do 2.1.A (só `0000`) | recebe `0001`, dados preservados, jobs antigos com `destructive = false` |
| `npm run build` | OK |
| `npm run db:migrate` (ATLAS_HOME vazio) | 2 migrations aplicadas |
| scripts legados offline, `npm run legacy:scan` | mesmos resultados; 9/9 projetos |

## Verificação de 2.1.F (2026-09-27)

| Comando | Resultado |
|---|---|
| `npm run typecheck` / `npm run lint` | OK / 0 warnings |
| `npm test` | 13 arquivos, 276 testes OK (2 execuções; inclui Chromium real contra site local) |
| `npm run build` | OK (6 rotas `/api/atlas/*`, `/lab/foundation`) |
| `next start` + worker embutido, `ATLAS_HOME` temporário | job enfileirado pela API → `completed`; PNG 2880×1800 servido com ETag = SHA-256 |
| cancelar job preso na navegação pela API | `cancelled` em ~3 s (intervalo de heartbeat); 0 Chromium do Playwright sobrando |
| fechar conexões SSE durante o job | job continua (acompanhar ≠ executar) |
| matar o servidor à força no meio do job e religar em < 30 s | job órfão → `failed/STALE` 30 s depois; nova captura do mesmo projeto conclui |
| scripts legados offline, `legacy:scan`, `/projects`, `/generate` | inalterados |

## Phase completion rule

Do not start 2.2 until 2.1 exit criteria in `ROADMAP.md` pass.

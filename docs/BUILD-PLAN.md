# BUILD PLAN — Coded Atlas 2.x

The complete roadmap lives in `ROADMAP.md`. The currently authorized scope lives in `CURRENT.md`.

> **Status (2026-09-27):** fases **2.1, 2.2 e 2.3 concluídas**. Execução contínua até o Atlas 3.0
> autorizada pelo Matheus (ADR-028) — ele testa só no final. Próxima: **2.4 — Composition Engine**.
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

- [x] Transactional generation. (2.x: staging do AssetStorage; v1: lease de backup + **recuperação na inicialização** de recapturas interrompidas — antes o projeto sumia se o servidor morresse no meio)
- [x] Central safe path validation. (`lib/storage/paths.ts` → `projectDir`/`authStatePath` validam o slug com o schema do domínio e confinam com `resolveWithin`; nova fundação já confinada)
- [x] URL policy. (`local`/`hosted-safe`: DNS, guard de requisições e cadeia de redirects no Playwright; entrada do `/api/generate` v1 e da captura 2.x)
- [x] Structured warnings. (`CatalogWarning` no `catalog.json` + bloco "Concluído com avisos" na página do projeto; um aviso por peça/etapa opcional que falha ou usa fallback)
- [x] Runtime schema validation for persisted JSON. (SQLite novo + `readCatalog` único no v1: páginas, biblioteca, case, diff, export, vitrine)
- [x] Infinite-scroll guard. (`scrollToBottom` para em `scrollMaxHeightPx`/`scrollMaxMs`; full page cortada em `maxFullPageHeightPx`, com aviso)
- [x] Explicit timeouts for long external processes. (`actionTimeoutMs` em todo contexto Playwright; watchdog `generationTimeoutMs` na geração v1 → `RENDER_TIMEOUT` + rollback; `timeoutMs` por job 2.x)
- [x] Build/lint/type/tests clean.

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

## Verificação de 2.1.G (2026-09-27)

| Comando | Resultado |
|---|---|
| `npm run typecheck` / `npm run lint` | OK / 0 warnings |
| `npm test` | 16 arquivos, 302 testes OK (2 execuções); agora inclui `lib/**/*.test.ts` |
| `npm run build` | OK |
| scripts legados offline | OK (`test-reprocess` passou a usar slug válido: o antigo `__test_reprocess__` é recusado pela validação central) |
| `legacy:scan` | 9/9 projetos |
| E2E v1 pelo servidor: geração com seções + vitrine | `done`, catálogo sem avisos, página 200 |
| E2E v1: página extra fora do ar | `done` + aviso `PAGE_CAPTURE_FAILED` no catálogo e na página |
| E2E v1: recaptura presa com `ATLAS_GENERATION_TIMEOUT_MS=6000` | `RENDER_TIMEOUT` em 6 s; versão anterior intacta; nenhum backup sobrando |
| E2E v1: servidor morto no meio de uma recaptura | projeto some da biblioteca (bug antigo); ao religar → `restored`, página 200 |
| Testes não escrevem em `public/generated` | conferido antes/depois da suíte |

Projetos de teste criados nos E2E foram removidos pela API; `public/generated` ficou com os 9
projetos originais.

## Atlas 2.2 — Project System (concluída 2026-09-27)

- [x] Project Library do banco: busca sem acento/caixa (texto normalizado), filtros (categoria, ativos/arquivados), ordenação.
- [x] Project Overview: capa, origens, contagem de material, prontidão, recomendações, atividade recente.
- [x] Navegação do projeto: Visão geral · Captura · Assets (+ Ajustes do projeto).
- [x] Ciclo de vida: editar, arquivar/restaurar, excluir definitivo com confirmação digitada, sem job ativo, com GC de bytes órfãos (preserva compartilhados, apaga miniaturas).
- [x] Sources: site (URL), dev local (URL http do servidor de dev — nunca caminho de disco), GitHub (`owner/repo` normalizado; base para leitura futura), uploads.
- [x] Importação manual (upload) com formato decidido pelos bytes, dedupe por SHA-256, staging tudo-ou-nada.
- [x] Biblioteca v1 importada automaticamente como job (`import`), não destrutiva, idempotente, com ledger (dispensados não voltam; recaptura v1 vira nova Capture). Arquivos em chaves endereçadas por conteúdo.
- [x] Miniaturas WebP sob demanda (320/640/1280) cacheadas no AssetStorage.
- [x] Telas globais: Jobs (cancelar, auto-atualização) e Ajustes (instalação, sincronizar v1).
- [x] v1 movido para `/legacy` (+ `/generate`), link discreto "v1" na navegação; `/` → `/projects`.
- [x] Migration `0002_project_system`.

Verificação 2.2: typecheck/lint OK; `npm test` 319 testes (17 arquivos); build OK; servidor com `ATLAS_HOME` vazio importou a biblioteca v1 real em ~3 s (9 projetos, 214 arquivos, 0 faltando, capas definidas); todas as rotas 200 e 404 para projeto inexistente; `npm run e2e` (Chromium na UI real: criar projeto com captura imediata, upload, editar, arquivar/restaurar, excluir) — 7/7 passos.

## Atlas 2.3 — Asset & Capture System (concluída 2026-09-27)

- [x] Captura completa como job (`CapturePlan`, perfis Rápido/Completo + ajustes): desktop/mobile, página inteira (com teto), seções nomeadas pelo DOM (fallback por rolagem), páginas extras, estados de interação, vídeo de scroll, inspeção. Engine reaproveita as rotinas do v1 sem caminhos de disco; abort fecha o Chromium; vídeo temporário sempre apagado.
- [x] Transacional: todos os bytes na staging → commit → registros; falhas parciais (página 404, seletor inexistente, `javascript:`) viram avisos no resultado do job, visíveis no histórico.
- [x] Understand: `VisualProfile` revisionado (paleta normalizada, fontes da marca sem genéricas/emoji, tecnologias, traços dark/light/colorful/monochrome/high-contrast); criado pela captura e pela importação v1. Painel "Identidade visual" na visão geral.
- [x] Capa derivada 1.91:1 (recorte inteligente) com linhagem para o screenshot de origem; "Usar como capa" em qualquer imagem.
- [x] Biblioteca global `/library` (texto, tipo, device, projeto, paginação) e detalhe do asset (metadados, origem, linhagem, baixar original, remover upload).
- [x] Dedupe por conteúdo (chaves `captures/`, `videos/`, `uploads/`, `assets/`, `outputs/`).
- [x] Migration `0003_understand`.

Verificação 2.3: typecheck/lint OK; `npm test` 328 testes (18 arquivos; captura completa com Chromium real, cancelamento no meio sem sobras); build OK; `npm run e2e` 10/10 passos contra servidor com `ATLAS_HOME` temporário (captura completa pela UI com página extra + estado, detalhe/capa, identidade, biblioteca).

## Phase completion rule

Do not start 2.2 until 2.1 exit criteria in `ROADMAP.md` pass.

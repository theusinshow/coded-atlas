# BUILD PLAN — Coded Atlas 2.x

The complete roadmap lives in `ROADMAP.md`. The currently authorized scope lives in `CURRENT.md`.

> **Status (2026-09-27):** 2.1.A concluído e verificado. O critério de saída de 2.1.A em
> `CURRENT.md` exigia banco + repositórios + storage, então os itens de 2.1.B e 2.1.C foram
> entregues junto. Próximo: **2.1.D — Legacy bridge** (aguardando teste do Matheus).
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

- [ ] Define legacy catalog schema.
- [ ] Read existing catalog safely.
- [ ] Map legacy project metadata.
- [ ] Map legacy generated files to asset descriptors.
- [ ] Preserve existing project views during migration.

### 2.1.E Job foundation

- [ ] Persist job states. (tabela + transições prontas desde 2.1.A; falta o worker usar)
- [ ] Implement safe claim/lock.
- [ ] Implement cancellation signal contract.
- [ ] Implement progress updates.
- [ ] Prevent concurrent destructive jobs for same project.
- [ ] Recover/mark stale jobs after abnormal shutdown.

### 2.1.F First migrated vertical slice

- [ ] Create project.
- [ ] Add URL source.
- [ ] Queue capture.
- [ ] Capture one deterministic asset path through current engine.
- [ ] Store via AssetStorage.
- [ ] Persist Asset.
- [ ] Create Output where appropriate.
- [ ] Reload from DB.
- [ ] Verify UI compatibility.

### 2.1.G Hardening

- [ ] Transactional generation.
- [ ] Central safe path validation. (parcial: nova fundação confinada; rotas legadas `case`, `export`, `zip`, `DELETE projects` agora validam slug — `lib/storage/paths.ts` ainda não passa por `resolveWithin`)
- [ ] URL policy.
- [ ] Structured warnings.
- [ ] Runtime schema validation for persisted JSON. (feito para o SQLite novo; falta `catalog.json` legado → 2.1.D)
- [ ] Infinite-scroll guard.
- [ ] Explicit timeouts for long external processes.
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

## Phase completion rule

Do not start 2.2 until 2.1 exit criteria in `ROADMAP.md` pass.

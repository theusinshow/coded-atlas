# BUILD PLAN — Coded Atlas 2.x

The complete roadmap lives in `ROADMAP.md`. The currently authorized scope lives in `CURRENT.md`.

> **Status (2026-09-28):** **Atlas 3.0 declarado** (tag `v3.0.0`, ADR-042) e **3.1 — v1 retirement
> concluída** (captura autenticada e diff visual portados; telas, rotas e pipeline do v1 removidos).
> Nenhuma fase seguinte autorizada ainda (ver `CURRENT.md`).
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

## Atlas 2.4 — Composition Engine (concluída 2026-09-28)

- [x] Documento visual: `Artboard` + layers (asset, text, shape, device/celular, browser, group) validados por Zod; molduras de navegador/celular com geometria compartilhada (`core/documents/devices.ts`).
- [x] `CompositionDefinition` versionada (slots com intenção, variantes, formatos, capacidades, `build` pura) e as 10 composições curadas: Desktop Hero, Desktop + Mobile, Floating Devices, Editorial Split, Mobile Stack, UI Details Grid, Single Feature, Typography + Colors, Project Reveal, Project Closing.
- [x] Formatos: Post 1:1, Post 4:5, Story 9:16, Paisagem 16:9, Capa 1.91:1.
- [x] Style tokens + modos (Projeto / Coded by M / Híbrido) pelo Brand Adapter a partir do VisualProfile, com contraste garantido; fontes curadas locais (@fontsource).
- [x] Auto-binding determinístico (captura mais recente, seções em ordem de página, textos do projeto) e `CompositionInstance` com snapshot da versão da receita e da revisão da identidade. Migration `0004_composition`.
- [x] Kernel de render único (`src/render/artboard-view.tsx`): o mesmo componente desenha o preview ao vivo e o render final.
- [x] Render estático em job (`render`): Chromium roda o bundle do kernel (esbuild) na dimensão exata, sem rede (assets/fontes por interceptação), Sharp gera PNG/JPG/WebP → Outputs imutáveis com metadados rastreáveis.
- [x] UI: aba **Criar** (galeria já preenchida com o material do projeto, filtro por formato, peças salvas) e editor com inspetor rápido (formato, variante, estilo, cor de destaque, troca de imagem por slot, textos, salvar/renderizar/excluir, acompanhamento do job); aba **Publicar** (renders e peças do v1, miniatura inteira, download com nome legível).

Verificação 2.4: typecheck/lint OK; `npm test` 350 testes (20 arquivos; render real com Chromium em PNG/JPG/WebP na dimensão exata); build OK; `npm run e2e` 12/12 passos (inclui criar composição → ajustar → renderizar → baixar em Publicar com 1080×1350 conferido); revisão visual das composições em 4:5, 9:16 e 16:9 com a biblioteca v1 real.

## Atlas 2.5 — Studio Canvas (concluída 2026-09-28)

- [x] `CreativeDocument` (kind `canvas`) + `document_revisions`: cada revisão é uma entrada de render completa (artboard + estilo + formato). Migration `0005_documents`.
- [x] Concorrência otimista (CONFLICT entre abas), autosave coalescido numa janela de 2 min, revisão fixada ao renderizar (nunca reescrita), restaurar = revisão nova.
- [x] Criação: canvas em branco (5 formatos) ou "Editar no canvas" a partir de uma composição (congela o artboard da receita e guarda a origem).
- [x] Studio em tela cheia (`/studio/[id]`): camadas (ordem, visibilidade, trava), adicionar texto/formas/navegador/celular/imagens do projeto, canvas com seleção, arrasto, redimensionar (8 alças, Shift mantém proporção, funciona com rotação), ímã nas bordas/centros com guias, zoom.
- [x] Inspetor: posição/tamanho/rotação/raio/opacidade/sombra/desfoque; texto (fonte, tamanho, peso, entrelinha, espaçamento, alinhamento, cor por token ou hex, caixa alta); forma (tipo, preenchimento, contorno); imagem/celular/navegador (trocar imagem, encaixe, foco vertical, moldura/tema, endereço); documento (fundo, textura, modo de estilo, cor de destaque, identidade).
- [x] Estado efêmero em Zustand; undo/redo com agrupamento de gestos (arrasto e digitação viram um passo); atalhos (Ctrl+Z/Y, setas, Ctrl+D, Delete, Ctrl+[ ]).
- [x] Render de uma revisão concreta pelo mesmo job/kernel; Outputs rastreiam documento + revisão; Publicar abre o canvas da revisão.
- [x] Operações de árvore de layers puras em `core/documents/layer-tree.ts` (base para Motion).

Verificação 2.5: typecheck/lint OK; `npm test` 362 testes (22 arquivos; revisões/coalescência/conflito/fixação/restauração e render de revisão com Chromium real); build OK; `npm run e2e` 14/14 passos (abrir composição no canvas, adicionar texto, autosave rev 2, arrastar e desfazer, renderizar e abrir em Publicar).

## Atlas 2.6 — Atlas Brain (concluída 2026-09-28)

- [x] `ModelGateway` (port no domínio) + `OpenAIResponsesGateway` (Responses API, Structured Outputs estrito, esforço por nível, imagens como miniaturas WebP 640px). A SDK só existe em `src/infrastructure/ai/openai/`.
- [x] Context Builder determinístico: lista curta sem duplicatas (fica o registro de papel mais forte), sem imagens pequenas/derivadas, priorizada e com teto; catálogo de composições; packs de projeto e identidade.
- [x] `CreativePlan` (objetivo, direção, ranking de assets com motivo, peças com composição/formato/variante/ligações/porquê), imutável, revisões via `parent_id`. Migration `0006_brain`.
- [x] Cadeia de validação: schema → domínio (IDs só da lista curta, formato/variante suportados, limites de texto) → 1 reparo com os erros → aproveita itens válidos com aviso → fallback determinístico. Nada é corrigido em silêncio.
- [x] Router de raciocínio (routine/creative/complex) e registro de uso em `ai_usage` (tokens, cache, custo só com preço configurado, latência, status); orçamento mensal warn/block.
- [x] Job `plan` (não bloqueia a UI). Aba **Planos**: pedir plano (objetivo, formatos, observações, quantidade), ver peças com preview real, material mais forte, avisos, revisar com feedback, aplicar tudo ou uma peça (vira rascunho em Criar), descartar. Ajustes mostram status, consumo do mês e últimas chamadas.
- [x] Sem `OPENAI_API_KEY` tudo funciona com as regras do Atlas (badge "IA desligada").

Verificação 2.6: typecheck/lint OK; `npm test` 379 testes (23 arquivos; gateway falso para sucesso/reparo/fallback/orçamento/revisão/aplicar; adapter OpenAI contra fetch simulado verificando request e parsing); build OK; `npm run e2e` 15/15 passos (plano sem IA → preview → criar peça). **Chamada real à OpenAI não verificada** (sem chave nesta máquina).

## Atlas 2.7 — Creative System (concluída 2026-09-28)

- [x] Memória criativa em dois escopos (Coded by M em Ajustes; projeto em Planos): preferir/evitar/nota sobre composição, estilo, tom ou geral. Sinais aprendidos: aplicar peça reforça a composição; descartar plano sem aplicar conta contra. Precedência pedido > projeto > workspace > padrões (manual vence sinal no mesmo escopo).
- [x] A memória alimenta o Brain (prompt + validação: composição evitada é erro reparável) e o planejador determinístico (evitadas saem, preferidas sobem, estilo preferido).
- [x] Direções criativas salvas (a partir de um plano ou à mão) e escolhidas ao pedir planos — o estilo do plano segue a direção (base dos Media Kits).
- [x] Evolução do VisualProfile: "Corrigir identidade" cria revisão manual; decisões antigas ficam na revisão usada.
- [x] Guardrails criativos determinísticos (contraste, texto que não cabe, texto minúsculo, imagem vazia, elemento fora, excesso de destaque, tudo oculto) no editor rápido, no Studio (clique seleciona a camada) e nas peças do plano.
- [x] Brand Adapter garante contraste AA para a cor de marca e o texto suave (mantendo o tom); varredura prova que as 10 composições × 5 formatos × variantes × 3 estilos saem sem avisos.
- [x] Migration `0007_creative`.

Verificação 2.7: typecheck/lint OK; `npm test` 390 testes (24 arquivos); build OK; `npm run e2e` 17/17 passos (corrigir identidade, memória do projeto, salvar e escolher direção).

## Atlas 2.8 — Carousel & Multi-page Documents (concluída 2026-09-28)

- [x] `CarouselDocument` (kind `carousel`) na mesma tabela de revisões: páginas ordenadas do mesmo tamanho com um estilo só; schema recusa tamanhos diferentes/ids repetidos; tipo do conteúdo casa com o tipo do documento.
- [x] Operações puras de página (adicionar, duplicar com ids novos, mover, renomear, remover — nunca vazio).
- [x] Studio multi-página: o store guarda o documento e edita a VISTA da página ativa (canvas, camadas e inspetor inalterados); storyboard com miniaturas, título da página, ←/→, duplicar, + página, remover — tudo com undo/autosave.
- [x] Criação: carrossel em branco (N páginas), objetivo **Carrossel** no planejador (abre com Project Reveal, fecha com Project Closing) e "Montar como carrossel" em qualquer plano (uma página por peça, mesmo formato, direção do plano).
- [x] Render multi-saída: uma peça por página, na ordem, `page` no metadata e rótulo `NN/total`; Publicar agrupa por render e baixa tudo em ZIP (`/api/atlas/jobs/[id]/outputs`, nomes seguros).
- [x] `buildZip` e `safeFileName` reutilizáveis (Export da 2.14).

Verificação 2.8: typecheck/lint OK; `npm test` 398 testes (25 arquivos; render de carrossel com Chromium real → 3 Outputs ordenados; store do Studio com vista da página); build OK; `npm run e2e` 18/18 passos (plano de carrossel → Studio → + página → render → ZIP).

## Atlas 2.9 — Motion Foundation (concluída 2026-09-28)

- [x] `MotionDocument` (kind `motion`, mesma tabela de revisões): cenas com duração, artboard (o MESMO modelo de camadas), faixas de animação por preset e transição de entrada; schema valida tamanho igual, ids, faixas apontando para camadas existentes e teto de 2 min.
- [x] 12 presets do docs como funções puras (x, y, escala, rotação, opacidade, desfoque + foco vertical): Fade Up, Slide Left/Right, Scale In, Smooth Zoom, Float, Parallax, Browser Reveal, Device Float, Stack Reveal, Website Scroll, UI Focus; 4 curvas.
- [x] Linha do tempo pura (`sceneAt`, `trackDelta`, `sceneFrame`) — o mesmo cálculo no preview e no render de vídeo; escala vira transform; transições cruzadas (a cena anterior fica por baixo).
- [x] `autoAnimate` determinístico por tipo de camada (página inteira em moldura ganha scroll).
- [x] Criação: "Animar" (canvas/carrossel → vídeo; páginas viram cenas), "Animar" no editor rápido, vídeo em branco e **Website Scroll** a partir da página inteira capturada (duração pela altura).
- [x] Studio como extensão do Canvas: tira de cenas (duração, total), seção da cena (duração, transição, animar automaticamente), animação da camada (presets filtrados por tipo, atraso, duração, intensidade, curva), player no navegador (play/pausa, scrub, repetir). Apagar camada poda as animações dela.
- [x] Kernel: `MotionSceneView`/`MotionFrameView` em `src/render` (reuso no render de vídeo).

Verificação 2.9: typecheck/lint OK; `npm test` 409 testes (26 arquivos); build OK; `npm run e2e` 19/19 passos (Website Scroll → preview → faixa de scroll; Animar documento → preset Float → autosave).

## Atlas 2.10 — Video Engine (concluída 2026-09-28)

- [x] Porta `MotionRenderer` (neutra) + adapter `ChromiumFfmpegMotionRenderer`: o Chromium roda o bundle de motion do kernel (o MESMO `MotionFrameView` do preview), cada quadro é posicionado no tempo exato e capturado em JPEG, o FFmpeg codifica pelo stdin (H.264/MP4 com faststart ou VP9/WebM). Sem relógio real, sem rede, abort mata FFmpeg e navegador, temporários sempre apagados.
- [x] Qualidades: **preview** (metade da resolução, 15 fps, encoder rápido) e **final** (resolução/fps do documento).
- [x] Render job aceita `mp4`/`webm` (só documentos de motion) além de PNG/JPG/WebP (pôsteres por cena); Outputs com duração, dimensões e qualidade.
- [x] **Movimento capturado**: vídeos do projeto (ex.: scroll gravado na captura) dentro de molduras de motion — `<video>` com seek quadro a quadro (rotas com Range/206), repetição se mais curto; o player sincroniza também.
- [x] **Trilha básica**: asset `audio` (MP3/WAV/OGG/M4A reconhecidos pelos bytes), volume e fade-out; `apad` + duração exata; o player toca junto.
- [x] **VideoRecipe**: Website Reveal Reel, Vitrine rápida, Mobile first — passos sem material são pulados e informados.
- [x] UI: menu de render com MP4/WebM + qualidade, trilha no inspetor, "Vídeo por receita" em Criar, vídeos tocáveis em Publicar, status do FFmpeg em Ajustes.

Verificação 2.10: typecheck/lint OK; `npm test` 418 testes (28 arquivos; render real MP4 H.264+AAC 1,6 s com vídeo capturado no celular e WebM VP9 preview conferidos com ffprobe; quadro extraído conferido visualmente); build OK; `npm run e2e` 20/20 passos (receita → MP4 preview → Publicar).

## Atlas 2.11 — Media Kits (concluída 2026-09-28)

- [x] `MediaKit` (stateful): preset + snapshot da UMA direção criativa + itens que apontam para rascunhos reais (instância, carrossel, vídeo) + status do render. Migration `0008_media_kits`.
- [x] Presets: **Kit de lançamento** (post, carrossel, story, capa OG, reel), **Kit de portfólio** (16:9 ×3, identidade, vídeo vitrine), **Kit social** (1:1, 4:5, 9:16, carrossel, reel mobile).
- [x] "Gerar Media Kit" (CTA principal da Visão geral + aba **Kits**): direção salva ou automática (identidade + memória); memória veta composição preferida → alternativa anotada; itens sem material ficam anotados.
- [x] Orquestração de render em lote: um job `render` com alvo `kit` — peças estáticas num navegador só, depois vídeos; documentos na revisão atual fixada; sem vídeo, itens de vídeo saem como pôsteres; Outputs marcados com `mediaKitId`/`kitItemId`; status do kit (renderizando/renderizado/falhou) e desbloqueio se o job morreu.
- [x] Entrega: ZIP do último render do kit, uma pasta por item na ordem do preset.

Verificação 2.11: typecheck/lint OK; `npm test` 424 testes (29 arquivos); build OK; `npm run e2e` 21/21 passos (Visão geral → Kit social → render em lote com MP4 preview → ZIP com pastas por item).

## Atlas 2.12 — Presentation Studio (concluída 2026-09-28)

- [x] `PresentationDocument` (kind `presentation`): slides 16:9 do mesmo tamanho, um estilo, **notas do apresentador** por slide; operações de sequência genéricas (páginas/cenas/slides).
- [x] Storyboard curado a partir do material: Capa, Contexto, O site, Responsivo, Detalhes, Destaque, Identidade visual, Encerramento — slides sem material pulados e informados; notas escritas com os dados do projeto; direção salva opcional.
- [x] Composição nova **Statement** (slide de texto: título + parágrafo, variantes lado a lado/empilhado) — passa na varredura de guardrails em todos os formatos/estilos.
- [x] Studio: tira de slides, notas no inspetor, menu de render por tipo (apresentação: PDF/PPTX/PNG; carrossel e canvas também exportam PDF).
- [x] Exportação: porta `DocumentExporter` + `PdfPptxExporter` (pdf-lib / PptxGenJS, JS puro) montando o arquivo a partir das páginas já renderizadas pelo kernel — PDF com metadados (autor Coded by M), PPTX com uma imagem por slide e as notas.

Verificação 2.12: typecheck/lint OK; `npm test` 430 testes (30 arquivos; PDF real de 3 páginas conferido com pdf-lib e PPTX com slides + notas); build OK; `npm run e2e` 22/22 passos (Montar apresentação → notas → PDF + PPTX em Publicar).

## Atlas 2.13 — Case Builder (concluída 2026-09-28)

- [x] `CaseDocument` (kind `case`): capa e dados (título, subtítulo, categoria, ano, cliente, URL, imagem de capa) + seções editoriais — texto, imagem enquadrada (browser/celular/sem moldura), galeria, peça do Atlas (Output renderizado), identidade visual e ficha técnica.
- [x] Esboço a partir do material do projeto (substitui o `case-draft.mdx` do v1): Contexto → primeira dobra desktop → Desafio → mobile → Solução → galeria de seções → identidade → ficha; seções sem material puladas.
- [x] Editor estruturado em tela cheia (`/cases/[id]`): lista de seções (adicionar/reordenar/remover), inspetor por tipo, preview ao vivo com o mesmo `CaseView` do render, undo/redo, autosave com revisões; aba **Case** no projeto.
- [x] Brain opcional (job `copy`): escreve só trechos de texto vazios, com o contexto do projeto; guardrail `inventedFigures` rejeita números que não estão no material; nada é publicado sozinho.
- [x] Saídas (render job, revisão fixada): **página web** (ZIP com `index.html` + assets, DOM serializado do kernel, sem referências internas), **PDF** paginado 1400×1980 e **módulos PNG de 1400px** estilo Behance.

Verificação 2.13: typecheck/lint OK; `npm test` 438 testes (ZIP web sem `atlas.render`, PDF com páginas conferidas, guardrail de números inventados); build OK; `npm run e2e` 23/23 passos (montar case → escrever trecho → exportar web ZIP + PDF).

## Atlas 2.14 — Publish & Portfolio (concluída 2026-09-28)

- [x] `Export` (stateful, migration `0009_exports`): pacote (um projeto) ou portfólio (vários), destino, peças, status e resultado; job `export` não destrutivo; nada sai sem clique.
- [x] Pacote organizado: pastas por tipo (`imagens/`, `videos/`, `documentos/`, `web/`), nomes legíveis e únicos, `manifest.json` (projeto, dimensões, duração, SHA-256).
- [x] Portfólio: uma pasta por projeto + `portfolio.json` com os campos do manifesto do v1 (slug, nome, categoria, url, thumbnail/thumbnailMobile, capa, accent, paleta, stack, hasVideo, data) + peças e case web.
- [x] Destinos: **ZIP** guardado no storage (download em `/api/atlas/exports/[id]/file`), **pasta local** (`ATLAS_EXPORT_DIR`, confinada, nunca sobrescreve) e **GitHub** opcional (um commit via Git Data API; `ATLAS_GITHUB_*`).
- [x] UI: "Criar pacote" em Publicar (peças marcadas onde estão), histórico de entregas, página global **Portfólio** (nav + ⌘K), destinos em Ajustes. Excluir o projeto apaga os ZIPs dos pacotes dele.

Verificação 2.14: typecheck/lint OK; `npm test` 448 testes (32 arquivos; ZIP real, pasta real com confinamento, GitHub com fetch falso conferindo blobs → tree → commit → ref, falha 401 registrada, GC do ZIP); build OK; `npm run e2e` 24/24 passos (pacote ZIP com manifest em Publicar + portfólio numa pasta local). Push para o GitHub real não exercitado (sem token nesta máquina).

## Phase completion rule

Do not start 2.2 until 2.1 exit criteria in `ROADMAP.md` pass.

## Atlas 3.0 — declarado (2026-09-28)

- [x] Loop completo Import → Capture → Understand → Create → Motion → Render → Publish.
- [x] Prova principal do ROADMAP: URL do projeto → Gerar Media Kit → Revisar → Renderizar → Exportar (`npm run e2e`, 24 passos).
- [x] Teste de aceite do Matheus concluído.
- Pendências conhecidas (fora do critério): chamada real à OpenAI e push real ao GitHub não exercitados nesta máquina; commits só locais (repositório remoto arquivado).

## Atlas 3.1 — v1 retirement (concluída 2026-09-28)

Decisão do Matheus: portar antes, remover depois (ADR-043).

### 3.1.A Captura autenticada no 2.x (concluída 2026-09-28)

- [x] `SessionStore` (porta) + `FileSessionStore` em `<ATLAS_HOME>/auth/<projectId>.json` (fora do AssetStorage, permissão 600, nunca exportada; resumo sem valores).
- [x] `npm run atlas:login -- <slug> [url]`: navegador visível, login manual (MFA/social), Enter salva a sessão.
- [x] Job de captura usa a sessão em todo contexto do navegador; resultado registra `authenticated`.
- [x] Aba Captura: estado da sessão (ativa/anônima), comando para criar ou renovar, "Remover sessão". Excluir o projeto apaga a sessão.

### 3.1.B Diff visual no 2.x (concluída 2026-09-28)

- [x] Job `diff` entre duas capturas do mesmo projeto e device (viewport, página inteira, seção, página extra, estado): pixelmatch com os parâmetros do v1, redimensiona o "depois" se a altura mudou, teto de 24 MP.
- [x] Resultado = Asset derivado (imagem de diferença, `changedPercent`, `comparedTo` = antes, `parentAssetId` = depois); o mesmo par reaproveita o resultado.
- [x] Aba Captura: "Comparar capturas" (padrão: penúltima × última do mesmo grupo) e resultados antes/depois/diferença.

Verificação 3.1.A+B: typecheck/lint OK; `npm test` 457 testes (34 arquivos; captura autenticada com Chromium real contra um site com cookie, diff real com Sharp/pixelmatch); build OK; `npm run e2e` 25/25 passos.

### 3.1.C Remoção do v1 (concluída 2026-09-28)

- [x] Removidos: telas `/legacy`, `/generate`, `/lab/coded-atlas`; rotas `/api/generate`, `/api/projects`, `/api/case`, `/api/diff`, `/api/export`, `/api/zip`, `/api/showcase`; `lib/` (pipeline de geração, storage do catálogo, mockups, diff, validação v1); componentes só do v1; `scripts/login.mjs` e `scripts/test-*.ts`; recuperação de geração v1 no boot; links "v1" da navegação, ⌘K, Ajustes e Visão geral.
- [x] Movidos para `src/`: rotinas de captura (`src/infrastructure/playwright/routines/`), parâmetros de captura (`src/infrastructure/capture-settings.ts`, mesmas variáveis `ATLAS_*`), categorias de projeto (`src/core/projects/categories.ts`). O schema do `catalog.json` (importador) virou a definição congelada.
- [x] Mantidos: importação somente leitura da biblioteca v1 (`public/generated`, `ATLAS_OUTPUT_DIR`) e `npm run legacy:scan`.
- [x] Testes do v1 portados: nomes de seção e guarda de scroll infinito (Vitest).

Verificação 3.1.C: typecheck/lint OK; `npm test` 451 testes (33 arquivos; os testes que só cobriam o código v1 removido saíram junto); build OK; `npm run e2e` 25/25 passos; rotas v1 respondem 404; os 9 projetos v1 continuam importados e `legacy:scan` lê a biblioteca; `public/generated` intacto.

## Manutenção pós-3.1

- [x] 2026-09-28 — pasta de entrega com carimbo no horário local (antes UTC); cartões compactos (Portfólio, kits, composição) mostram o nome da peça. Verificação: typecheck/lint OK, `npm test` 451 (carimbo testado em dois fusos), build OK, `npm run e2e` 25/25.
- [x] 2026-09-28 — **Alinhamento ao design system da Coded by M** (ADR-045): tokens reais (base `#000F08`, off-white `#F5F2ED`, sinal `#FB3640`, cinzas quentes), Satoshi + Panchang self-hosted, radius 0, foco no sinal, raridade do vermelho por papel; primitivos, nav global e abas no estilo do DS; estilo "Coded by M" das peças com a mesma paleta/fontes, cantos retos, BrowserFrame do cbm-port e compensação de largura da Panchang (também no Case). Verificação: typecheck/lint OK, `npm test` 451, build OK, `npm run e2e` 25/25, folha de contato de todas as composições (post e story) e prints das telas principais conferidos.
- [x] 2026-09-28 — **Troca de slug** (Ajustes do projeto → Endereço): valida formato e unicidade, identidade continua sendo o ID; a exclusão passou a dispensar a pasta v1 certa pelo ID do projeto (antes usava o slug atual). Verificação: typecheck/lint OK, `npm test` 452 (troca de slug + recaptura v1 + exclusão). Limpeza dos dados locais do Matheus (aprovada): 4 projetos duplicados/de teste excluídos, 2 renomeados, 1 referência arquivada; backup em `.atlas/backups/`.

# Coded Atlas — Plano Mestre de Implementação

Regras herdadas do `CLAUDE.md`: fases em ordem, **parar ao fim de cada fase para o Matheus
testar**, atualizar `docs/BUILD-PLAN.md` (registro) e `docs/architecture.md` + `lib/types.ts`
(contratos) **antes** do código de cada fase que muda contrato. Critério de fechamento de fase:
`tsc --noEmit` limpo, `next build` limpo, script de teste da feature, verificação visual.

Legenda: Prio P0–P3 · Risco B/M/A (baixo/médio/alto).

---

## Fase 0 — Estabilidade e decisão

Objetivo: o que existe fica mais barato e confiável; o rumo fica decidido e documentado.

| # | Tarefa | Objetivo | Arquivos | Dep. | Risco | Aceite | Prio |
|---|---|---|---|---|---|---|---|
| 0.1 | Decisão de produto | Aceitar/ajustar `PRODUCT_VISION.md`; revisar guard rail 7 | `CLAUDE.md`, `docs/product.md` | — | B | Docs atualizados e commitados | **P0** |
| 0.2 | Commitar captura autenticada + diff logado | Versionar WIP; diff usa sessão | `auth-state.ts`, `login.mjs`, `api/diff/[slug]/route.ts`, README | — | B | Diff de app logado não mostra tela de login | P1 |
| 0.3 | Perfil Rápido padrão (QW1) | Captura ≤ 15 s; extras sob demanda | `types.ts (CaptureOptions.profile)`, `route.ts`, `url-input.tsx`, nova `api/showcase/[slug]` | — | M (toca contrato) | Geração padrão sem `mockups/`, `compositions/`, `videos/`; botão gera extras; reprocess herda | **P0** |
| 0.4 | Limpeza em falha (QW2) | Sem pastas órfãs | `route.ts`, `storage/*` | — | B | Forçar erro → nenhuma pasta nova sobra; pasta pré-existente intacta | P1 |
| 0.5 | Cancelamento real (QW4) | Abortar no servidor | `route.ts`, `capture-device.ts` | — | B | Cancelar → Chromium fecha em < 2 s; nada sobrescrito | P2 |
| 0.6 | Aviso de URL duplicada (QW3) | Evitar capturas repetidas | `url-input.tsx` | — | B | Colar URL existente mostra aviso com link | P1 |
| 0.7 | Higiene (QW12–QW15) | Tipos na fonte única, código `VALIDATION`, `.tmp`, bind localhost | vários | — | B | `tsc` limpo; `start.bat` só em 127.0.0.1 | P2 |

**Parar para teste.**

## Fase 1 — Fundação da biblioteca

Objetivo: storage e engine prontos para múltiplas portas de entrada, sem mudar a UI.

| # | Tarefa | Objetivo | Arquivos | Dep. | Risco | Aceite | Prio |
|---|---|---|---|---|---|---|---|
| 1.1 | Contratos | `Reference`, `SectionKind`, `Project` em `lib/types.ts` + seção no `architecture.md` | `types.ts`, `architecture.md` | 0.1 | M | Revisado pelo Matheus antes do código | **P0** |
| 1.2 | Rota de arquivos | Servir `ATLAS_LIBRARY_DIR` e `public/generated` por `app/files/[...path]`; marcar `/` e `/projects` como dinâmicas (o build atual as pré-renderiza — em `next start` a lista fica congelada no momento do build) | `app/files/[...path]/route.ts`, `lib/library/paths.ts`, `config.ts`, `app/page.tsx`, `app/projects/page.tsx` | 1.1 | M (traversal) | `next start` exibe captura nova e lista atualizada; `../` retorna 400; teste de traversal | **P0** |
| 1.3 | Extrair pipeline | `runCapturePipeline(input, onProgress, signal)` | `lib/capture/capture-project.ts`, `route.ts` | — | M | `route.ts` < 60 linhas; `test-phase*` passam; SSE idêntico | P1 |
| 1.4 | Store de referências | Escrita atômica de pasta + `meta.json`; ULID; lixeira | `lib/library/store.ts` | 1.1 | M | Script cria/lê/move-para-lixeira 100 refs sem corromper | **P0** |
| 1.5 | Índice Estágio A | Boot a partir dos sidecars; atualização incremental; texto + facetas | `lib/library/index.ts` | 1.4 | M | 10k refs sintéticas: boot < 1,5 s, consulta < 20 ms | P1 |
| 1.6 | Fila de captura | 1 Chromium, N jobs, status consultável | `lib/ingest/queue.ts` | 1.3 | M | 5 URLs enfileiradas processam em série; status via `GET /api/jobs` | P2 |

**Parar para teste.**

## Fase 2 — Captura sem fricção

Objetivo: guardar uma referência leva segundos, de qualquer origem.

| # | Tarefa | Objetivo | Arquivos | Dep. | Risco | Aceite | Prio |
|---|---|---|---|---|---|---|---|
| 2.1 | Ingestão de imagem | `POST /api/references` (multipart): original + preview + thumb + sha256 + cores + tema | `lib/ingest/image.ts`, `app/api/references/route.ts` | 1.4 | B | PNG colado vira referência no Inbox em < 1 s | **P0** |
| 2.2 | Ctrl+V e drag-and-drop globais | Colar imagem ou URL em qualquer tela | `components/paste-capture.tsx`, `layout.tsx` | 2.1 | B | Win+Shift+S → Ctrl+V → card no Inbox; URL colada abre captura | **P0** |
| 2.3 | Section Explode | Captura de URL gera N referências de seção | `lib/ingest/url.ts`, `section-name.ts` (mapear → `SectionKind`) | 1.3, 2.1 | M | URL real → tela "seções encontradas" → Enter salva marcadas com `section` certo | **P0** |
| 2.4 | Metadados de origem | Título, favicon, domínio, viewport | `inspect-site.ts`, `lib/ingest/url.ts` | 2.3 | B | Card mostra favicon + domínio + título | P1 |
| 2.5 | Vídeo por upload | mp4/webm + poster gerado no browser (canvas) | `paste-capture.tsx`, `ingest/image.ts` | 2.1 | B | Vídeo arrastado tem poster e toca no hover | P2 |
| 2.6 | Duplicatas | sha256 exato + mesma URL/seção; dHash opcional | `lib/library/index.ts` | 1.5 | B | Colar a mesma imagem avisa e oferece abrir a existente | P1 |
| 2.7 | Migração não destrutiva | Seções dos catálogos existentes viram referências | `scripts/migrate-catalogs.ts` | 2.3 | B | Rodar 2× não duplica; nada em `public/generated` é apagado | P1 |
| 2.8 | Importar pasta | Trazer screenshots espalhados | `scripts/import-folder.ts` (+ UI depois) | 2.1 | B | Pasta com 200 imagens → 200 refs no Inbox; repetidas ignoradas | P2 |

**Parar para teste.**

## Fase 3 — Biblioteca de uso diário

Objetivo: reencontrar em segundos; organizar sem esforço.

| # | Tarefa | Objetivo | Arquivos | Dep. | Risco | Aceite | Prio |
|---|---|---|---|---|---|---|---|
| 3.1 | Vocabulário e navegação | Referências · Projetos · Catálogos; home = Inbox/Recentes | `app-nav.tsx`, `app/page.tsx`, rotas | 2.x | B | Nenhuma tela usa "projeto" para site capturado | P1 |
| 3.2 | Grid masonry | CSS columns, slider de tamanho, card mínimo (imagem, domínio, seção, nota) | `components/ref-grid.tsx`, `ref-card.tsx` | 1.5 | B | 500 refs rolam a 60 fps; tamanho persiste | **P0** |
| 3.3 | Quick Look | Espaço, ←/→, painel com nota/tags/URL/DNA, edição inline | `components/quick-look.tsx` | 3.2 | B | Navegar 50 refs só com teclado | **P0** |
| 3.4 | Inbox + triagem | Status; atalhos `S T P E A`; "próximo" automático | `ref-grid.tsx`, `app/api/references/[id]` | 3.3 | B | Triar 20 refs em < 2 min sem mouse | P1 |
| 3.5 | Busca + facetas | Texto (nota, título, domínio, tags, seção, descrição) + seção/tag/domínio/tema/origem/data | `components/ref-filters.tsx`, `index.ts` | 1.5 | B | "hero escura saas" com tags corretas retorna em < 100 ms | **P0** |
| 3.6 | Ações em lote | Tag, seção, projeto, arquivar, excluir (lixeira), exportar | `ref-grid.tsx`, API batch | 3.2 | B | Selecionar 20 → taggear em 1 ação; desfazer exclusão | P1 |
| 3.7 | Paleta com ações | Buscar refs + executar verbos, mostrando atalhos | `command-palette.tsx` | 3.4 | B | Toda ação da tabela de atalhos está na paleta | P1 |
| 3.8 | Timeline leve | Cabeçalhos por mês no grid ordenado por data | `ref-grid.tsx` | 3.2 | B | — | P3 |

**Parar para teste.** Marco: o Atlas substitui a pasta Downloads para referências.

## Fase 4 — Projetos

Objetivo: referências viram decisão e briefing.

| # | Tarefa | Objetivo | Arquivos | Dep. | Risco | Aceite | Prio |
|---|---|---|---|---|---|---|---|
| 4.1 | Projeto com slots | Criar projeto, slots editáveis, estados candidata/escolhida/rejeitada, notas, direção | `lib/library/projects.ts`, `app/p/[id]/page.tsx` | 3.x | M | Montar *Stige Escadas* com 5 slots em < 10 min | **P0** |
| 4.2 | Comparar | 2–4 refs lado a lado, rolagem sincronizada | `components/compare.tsx` | 3.6 | B | `C` com 3 selecionadas abre comparação | P2 |
| 4.3 | Pack `DESIGN_REFERENCES.md` | Exportar Markdown + `img/` para pasta escolhida | `lib/export/pack.ts`, API | 4.1 | B | Pack abre no Claude Code com imagens resolvidas; inclui restrições | **P0** |
| 4.4 | Copiar contexto | Mesmo conteúdo no clipboard (caminhos absolutos locais) | `lib/export/pack.ts` | 4.3 | B | Colar no Claude Code → agente vê imagens | P1 |
| 4.5 | Uso registrado | `usedIn` ao exportar; filtros | `index.ts` | 4.3 | B | — | P2 |

**Parar para teste.**

## Fase 5 — Integração com agentes

| # | Tarefa | Objetivo | Arquivos | Dep. | Risco | Aceite | Prio |
|---|---|---|---|---|---|---|---|
| 5.1 | Servidor MCP | `search_references`, `get_reference`, `get_project_brief` | `mcp/server.ts` (importa `lib/library`) | 4.3 | M | Claude Code lista heroes e vê as imagens | P1 |
| 5.2 | `annotate_reference` | Escrita de descrição/tags/seção pelo agente | `mcp/server.ts`, `store.ts` | 5.1 | M (escrita concorrente) | Agente triagem 20 refs do Inbox; Atlas reflete sem reiniciar | P1 |
| 5.3 | Skill/slash `atlas-triage` e `atlas-brief` | Comandos prontos no repo | `.claude/skills/*` | 5.2 | B | Um comando descreve e taggeia o Inbox | P2 |

**Parar para teste.**

## Fase 6 — Atlas Clipper (extensão)

| # | Tarefa | Objetivo | Arquivos | Dep. | Risco | Aceite | Prio |
|---|---|---|---|---|---|---|---|
| 6.1 | API pronta para extensão | CORS restrito à origem da extensão; token local simples | `app/api/references/route.ts`, `middleware.ts` | 2.1 | M (segurança local) | Página web qualquer não consegue postar | P1 |
| 6.2 | Recorte de região | Atalho → seleção → popup "por quê" → Inbox | `extension/` (MV3) | 6.1 | M | Referência de página logada em < 5 s | P1 |
| 6.3 | Elemento + página | Picker de elemento; página inteira via Section Explode | `extension/` | 6.2 | M | — | P2 |
| 6.4 | Fila offline | Reenviar quando o Atlas voltar | `extension/` | 6.2 | B | Captura com Atlas desligado chega ao ligar | P3 |

**Parar para teste.**

## Fase 7 — Inteligência opcional

| # | Tarefa | Objetivo | Arquivos | Dep. | Risco | Aceite | Prio |
|---|---|---|---|---|---|---|---|
| 7.1 | Design DNA | Tipografia, paleta por área, raio, sombras, container, tema | `inspect-site.ts` → `lib/capture/design-dna.ts`, `types.ts` | 2.3 | M | 5 sites conhecidos com escala tipográfica correta | P2 |
| 7.2 | DNA no pack e comparação | — | `pack.ts`, `compare.tsx` | 7.1, 4.3 | B | — | P2 |
| 7.3 | Auto-tag por API (opcional) | Desligado por padrão; vocabulário fechado | `lib/ai/*`, `config.ts` | 1.6 | M (custo) | Sem env → zero chamadas; com env → tags válidas | Exp |
| 7.4 | Similaridade visual | Embeddings locais + força bruta | `lib/ai/embeddings.ts` | 1.5 | A | "Similar" útil em 10 amostras julgadas pelo Matheus | Exp |
| 7.5 | Originality Check | Seção do WIP × refs do slot | `app/p/[id]/check` | 4.1, 7.1 | M | — | Exp |

---

## As 10 primeiras tarefas

1. **0.1** Decisão de produto + revisão do guard rail 7.
2. **0.3** Perfil Rápido como padrão (extras de vitrine sob demanda).
3. **0.4** Limpeza de pasta em falha (e remover as 5 órfãs atuais, com o OK do Matheus).
4. **0.2** Commitar captura autenticada + diff logado.
5. **1.1** Contratos `Reference`/`SectionKind`/`Project` em `types.ts` e `architecture.md`.
6. **1.2** Rota `/files` + `ATLAS_LIBRARY_DIR` (biblioteca fora do repo).
7. **1.3** Extrair `runCapturePipeline` do route handler.
8. **1.4 + 1.5** Store de referências + índice em memória.
9. **2.1 + 2.2** Ingestão de imagem + Ctrl+V/drag-and-drop global.
10. **2.3** Section Explode.

Ao fim da tarefa 10 o Atlas já cumpre a promessa central: colar ou capturar → referência
classificada e encontrável.

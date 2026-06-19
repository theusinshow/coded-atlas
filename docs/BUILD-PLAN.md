# BUILD-PLAN — Coded Atlas (MVP v0.1)

Checklist **vivo** da construção. O Claude Code deve marcar cada fase como concluída
(`[x]`) e escrever uma nota de 1 linha ao terminá-la. Detalhes de cada fase estão na
seção "Ordem de Implementação" do `docs/architecture.md`.

**Status atual:** v0.4 concluída — gerador de case draft. Aguardando teste do Matheus.
**Última fase concluída:** v0.4 — `generateCaseDraft` + `/api/case` + `CaseDraftSection`. `next build` ✓ 6 rotas, zero erros.

---

## Fases

- [x] **Fase 0 — Fundação**
  Scaffold + `lib/types.ts` + `lib/config.ts` + `lib/errors.ts`.
  _Verifica:_ os tipos compilam e refletem exatamente os contratos do `architecture.md`.
  _Status:_ `npx tsc --noEmit` → zero erros. Chromium instalado via postinstall.

- [x] **Fase 1 — Validação**
  `validate-url`, `validate-project-input`, `slugify`.
  _Status:_ 19/19 casos passando via `npx tsx scripts/test-phase1.ts`. Zero erros de tipo.

- [x] **Fase 2 — Storage**
  `paths`, `ensure-project-folder`, `write-json`.
  _Status:_ 11/11 casos passando via `npx tsx scripts/test-phase2.ts`. Overwrite limpa a pasta (sem merge de execuções). `.gitignore` já configurado na Fase 0.

- [x] **Fase 3 — Engine: primeira captura** ⚠️ momento de verdade
  Capturar SÓ o screenshot desktop (viewport), testado por um script CLI.
  _Status:_ `desktop-1440x900.png` real gerado (36 KB). Browser fechado no `finally`. Guard rails de caminho público verificados.

- [x] **Fase 4 — Engine: capturas completas**
  Adicionar mobile + full page (desktop e mobile), com scroll-to-bottom prévio.
  _Status:_ 4 PNGs reais (35–50 KB cada). scroll-to-bottom com lazy-load. Eventos de progresso reais por passo. Browser fechado em finally.

- [x] **Fase 5 — Thumbnails (Sharp)**
  Gerar `thumb-main.webp` e `thumb-mobile.webp` a partir dos screenshots.
  _Status:_ 640×400 e 320×640 WebP quality-82, caminhos públicos verificados. Erros Sharp → AtlasError(STORAGE_FAILED).

- [x] **Fase 6 — Catálogo**
  `build-catalog` + escrever `catalog.json`.
  _Status:_ 17/17 verificações. Interface Catalog respeitada. absPath nunca no JSON. videos ausente. sections=[]. round-trip sem perda.

- [x] **Fase 7 — API síncrona**
  Rota `/api/generate` (runtime nodejs) que orquestra a engine e devolve o `Catalog`.
  _Status:_ POST real 12.6s → ResultEvent. URL inválida → 400 INVALID_URL amigável. `next build` OK. Browser fechado em finally.

- [x] **Fase 8 — API com stream (SSE)**
  Converter a rota para transmitir eventos de progresso por etapa.
  _Verifica:_ os eventos de progresso chegam na ordem certa até o `result`.
  _Status:_ `ReadableStream` SSE com 9 eventos reais. Progress monotônico. Erro retorna `{step:"error"}` no stream. OK do Matheus.

- [x] **Fase 9 — UI: /generate**
  Formulário + consumo do stream + estados de progresso reais.
  _Verifica:_ ao gerar, a tela mostra os passos de verdade, não animação falsa.
  _Status:_ `UrlInput` + `GenerationStatus` + page com máquina de estados. SSE consumer conforme architecture.md. OK do Matheus.

- [x] **Fase 10 — UI: /projects/[slug]**
  Server Component que lê o `catalog.json` e exibe galerias separadas (desktop/mobile).
  _Verifica:_ a página renderiza dados + screenshots a partir do JSON.
  _Status:_ Server Component com `fs.readFile().catch(() => notFound())`. Galerias desktop/mobile, DeviceFrame, AssetDownloads. OK do Matheus.

- [x] **Fase 11 — Landing + polish**
  Página `/` e acabamento visual premium (escuro/técnico Coded by M).
  _Verifica:_ a checklist completa "Definition of Done — MVP" do `architecture.md` passa.
  _Status:_ Landing com grid técnico, título mono, "Como funciona", estrutura de saída. `globals.css` com scrollbar e selection escuros. `next build` ✓.

---

- [x] **v0.4 — Gerador de case**
  `lib/capture/generate-case.ts` + `POST /api/case` + `CaseDraftSection`.
  _Verifica:_ clicar "Gerar rascunho" em `/projects/[slug]` → baixar `case-draft.mdx` com frontmatter, capturas e inspeção.
  _Status:_ `next build` ✓. Arquivo salvo em `public/generated/[slug]/case-draft.mdx`. Server detecta se já existe e pré-popula o estado.

---

## Regras de atualização

- Só marcar `[x]` depois que o critério "_Verifica_" passou de fato.
- Ao concluir uma fase, atualizar **Status atual** e **Última fase concluída** no topo.
- Não avançar de fase sem o OK do Matheus.

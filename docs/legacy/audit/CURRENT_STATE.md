# Coded Atlas — Estado Atual (auditoria 2026-09-27)

> Auditoria feita lendo 100% do código (`app/`, `components/`, `lib/`, `scripts/`), os 5 docs
> em `docs/`, o histórico git e os **dados reais** em `public/generated/`.
> Os documentos irmãos: `UX_AUDIT.md`, `FEATURE_MATRIX.md`, `QUICK_WINS.md`,
> `../product/*`, `../architecture/FUTURE_ARCHITECTURE.md`, `../implementation/MASTER_PLAN.md`.

---

## Resumo em uma frase

O Coded Atlas hoje é um **gerador de pacote de apresentação para sites que a Coded by M
entregou** (URL → screenshots, mockups, composições, case draft). Ele **não é** — ainda — uma
biblioteca de referências visuais. A missão nova descreve um produto diferente, e essa é a
descoberta mais importante desta auditoria.

---

## O que é o Coded Atlas atualmente

- **Job atual (declarado em `docs/product.md`):** "transformar um site finalizado em catálogo
  visual premium para case de portfólio". Direção: **saída** (mostrar o meu trabalho).
- **Job pedido na missão:** "capturar referências de outros sites, organizar, entender, comparar
  e transformar em decisões de design". Direção: **entrada** (aprender com o trabalho dos outros).

São dois jobs com frequência, unidade e custo aceitável completamente diferentes:

| | Vitrine (existe) | Referência (pedido) |
|---|---|---|
| Frequência | 1–2×/mês (quando um site é entregue) | várias vezes por dia |
| Unidade | um **site inteiro** (projeto) | um **recorte** (hero, footer, card, interação) |
| Tempo aceitável de captura | 1–3 min tudo bem | < 5 s ou não é usado |
| Metadados | nome, cliente, categoria de projeto | por que salvei, tipo de seção, estilo, onde usar |
| Saída | mockups, composições, case, manifesto | busca, comparação, pack para o agente |

**Evidência de que o produto atual não entrou no fluxo diário:** a última captura em
`public/generated/` é de **2026-06-27** — três meses sem uso. O último commit é de 2026-06-20.

## Arquitetura atual

```txt
Next.js 15 (App Router) · React 19 · TS · Tailwind v4 · Playwright · Sharp · pixelmatch · archiver
Sem banco · sem auth · sem cloud · sem IA (decisão registrada em docs/ROADMAP.md, v1.6 descartada)

app/
  page.tsx                  landing interna + 6 recentes (Server)
  generate/page.tsx         formulário + consumo SSE (Client)
  projects/page.tsx         biblioteca (Server → ProjectsLibrary Client)
  projects/[slug]/page.tsx  catálogo de um projeto (Server, 614 linhas, 15 seções empilhadas)
  lab/coded-atlas/page.tsx  vitrine do experimento
  api/generate              POST SSE — ORQUESTRA TODO O PIPELINE (199 linhas)
  api/{zip,export,diff}/[slug], api/case, api/projects(/[slug])
lib/
  types.ts                  fonte única (Catalog, ProjectInput, ...)
  config.ts                 constantes (viewports, delays, mockups, composições)
  capture/*                 engine: device, página extra, estados, seções, nomes de seção,
                            overlays, estabilidade, inspeção, thumbnails, capa, composições,
                            mockups, case draft, manifesto
  mockup/render-3d.ts       mockup 3D via CSS 3D fotografado pelo Playwright
  diff/visual-diff.ts       pixelmatch
  storage/*                 paths, pastas, listagem (lê todos os catalog.json), delete
scripts/                    test-*.ts (asserts manuais via tsx) + login.mjs (sessão autenticada, WIP)
```

**Persistência:** `public/generated/<slug>/catalog.json` + arquivos. `listProjects()` lê e
parseia **todos** os `catalog.json` a cada request de `/`, `/projects` e `/api/projects`.
Assets servidos como estáticos do `public/`.

**Qualidade de base:** `tsc --noEmit` limpo, zero `TODO/FIXME`, guard rails respeitados
(runtime nodejs, browser fechado em `finally`, caminhos públicos, config centralizada),
testes-script por feature. É um código **limpo e disciplinado** — o problema não é qualidade de
código, é **encaixe de produto**.

## Funcionalidades existentes

| Área | Feature | Onde |
|---|---|---|
| Captura | viewport + full page desktop (1440×900@2x) e mobile (390×844@3x) | `capture-device.ts` |
| Captura | seções por DOM (header/section/footer/article) com fallback por scroll | `detect-sections.ts` |
| Captura | nomes de seção heurísticos (Hero, Sobre, Serviços, Planos, FAQ…) | `section-name.ts` |
| Captura | vídeo WebM de scroll | `capture-device.ts`, `record-scroll.ts` |
| Captura | páginas extras (paths) | `capture-page.ts` |
| Captura | estados de interação (clicar seletor CSS) | `capture-states.ts` |
| Captura | dispensar cookie banners/chats/popups | `dismiss-overlays.ts` |
| Captura | espera inteligente (fontes, imagens, animações) | `wait-for-stability.ts` |
| Captura | sessão autenticada via `scripts/login.mjs` (**não commitado**) | `auth-state.ts` |
| Inspeção | paleta, fontes, tech stack, og:image | `inspect-site.ts` |
| Saída | thumbnails WebP, capa 1.91:1 (og:image ou smart crop) | `generate-thumbnails/cover.ts` |
| Saída | composições 1:1, 9:16, 16:9 | `generate-compositions.ts` |
| Saída | mockups browser/phone (SVG+Sharp) e 3D (CSS 3D) | `generate-mockups.ts`, `render-3d.ts` |
| Saída | case-draft.mdx, portfolio.json, ZIP | `generate-case.ts`, APIs |
| Monitoramento | diff visual de recaptura (viewport desktop) | `api/diff`, `visual-diff.ts` |
| Biblioteca | busca (nome/cliente/URL/categoria/slug), filtro por categoria, sort, seleção em lote (excluir, ZIPs) | `projects-library.tsx` |
| Navegação | Ctrl/Cmd+K (projetos + 4 ações), lightbox 1×/real, toast de geração persistente | componentes |
| Gestão | reprocessar (preserva case draft), excluir com guarda de path traversal | APIs |

## Funcionalidades incompletas

- **Captura autenticada** (`auth-state.ts`, `scripts/login.mjs`): WIP não commitado; só via CLI,
  invisível na UI; o slug precisa bater exatamente; **`api/diff` não usa a sessão** (recaptura de
  site logado sempre compara com a tela de login).
- **Cancelar geração** (`generate/page.tsx:124`): aborta só o `fetch`. O servidor continua
  capturando até o fim e sobrescreve a pasta.
- **Diff visual:** guarda só o último `after.png`; sem histórico; a base muda a cada reprocess.
- **Estados de interação:** exigem digitar seletor CSS em textarea (`Nome | seletor`).
- **Push para o GitHub do portfólio:** fora de escopo (documentado).
- **`architecture.md` descreve `lib/capture/capture-project.ts › runCapturePipeline`, que não
  existe** — a orquestração vive dentro do route handler. A engine não é reutilizável por CLI,
  extensão ou fila sem passar pelo HTTP.
- `docs/ROADMAP.md` marcava v1.4 itens 5 e 6 como pendentes, embora entregues (**corrigido**).

## Fluxos principais (reconstruídos)

1. **Gerar:** `/generate` → colar URL → nome sugerido pelo domínio → categoria (dropdown de tipos de
   projeto) → toggles vídeo/seções → [detalhes: cliente, descrição, páginas, estados] → Gerar →
   SSE com fases → "Ver catálogo". **Duração real: 9 s a 183 s** (mediana ≈ 60 s).
2. **Consultar:** `/projects` → grid de cards (3 col) → busca textual por metadados → página do
   projeto (15 blocos verticais).
3. **Reaproveitar:** baixar arquivo solto, ZIP, portfolio.json ou case-draft.mdx.
4. **Monitorar:** "Verificar agora" no fim da página do projeto → diff.

## Limitações

- **Unidade errada para referências:** não existe captura de uma seção/elemento/região; não
  existe colar imagem, arrastar arquivo, subir vídeo.
- **Zero metadados de intenção:** não há notas, tags, "por que salvei", tipo de seção como
  filtro, coleção/projeto de destino.
- **Busca só por metadados do formulário.** Nomes de seção detectados (o dado mais útil para
  referência) não entram na busca nem na listagem.
- **Um slug = um site = uma pasta sobrescrita.** Recapturar apaga a anterior
  (`ensure-project-folder.ts:38`).
- **Custo por captura: ~18 MB** (medido: 249 MB / 14 pastas; vídeo ≈ 12 MB/projeto; full page PNG
  a 2×/3×). 1.000 capturas ≈ 18 GB.
- **Assets obrigatoriamente dentro de `public/`.** `ATLAS_OUTPUT_DIR` fora de `public/` quebra a
  UI (os caminhos `/generated/...` deixam de ser servidos). Em `next start`, arquivos criados em
  `public/` depois do build **não são servidos** pelo Next (comportamento documentado do
  framework) — o fluxo "build de produção" do README não funciona para capturas novas.

## Problemas arquiteturais

1. **Pipeline dentro do route handler** (`app/api/generate/route.ts:63-195`) — contraria o
   princípio 1 do `architecture.md` ("pipeline antes de interface").
2. **Storage acoplado ao `public/`** — impede biblioteca fora do repo (backup, sync, disco externo)
   e quebra em modo produção.
3. **Listagem O(n) por request** (`list-projects.ts:21`) — ok para 14, lento para 5.000+.
4. **Falha deixa pasta órfã.** Dados reais: **5 de 14 pastas não têm `catalog.json`** (`2`, `321`,
   `code-by-m`, `lp-interiories`, `teste`) ≈ **65 MB (26% do disco usado)**, invisíveis na UI e
   nunca limpas.
5. **Tudo roda sempre:** capa, 3 composições, 2 mockups flat, 2 mockups 3D rodam em toda geração
   (`route.ts:146-159`), mesmo quando só se quer o screenshot.
6. **Sem fila:** duas gerações simultâneas abrem dois Chromium; nenhuma proteção.
7. Tipos fora da fonte única: `DiffResult` em `components/visual-diff.tsx:5`, `ProjectSummary` em
   `lib/storage/list-projects.ts:6`.
8. Erros de validação usam o código `UNKNOWN` (`validate-project-input.ts:8-37`) — a taxonomia não
   tem `VALIDATION`.

## Problemas de UX

Detalhados em `UX_AUDIT.md`. Os críticos:

- Capturar uma referência custa **formulário + ~60 s + página de 15 blocos**.
- Metadados obrigatórios geram lixo. Dados reais: projeto `231` com categoria `321`; `Mj` com
  categoria `1`; `good-fella` com categoria `good-fella`. O usuário digita qualquer coisa para
  passar do formulário — sinal claro de campo que não serve ao seu objetivo.
- Mesma URL capturada 3× sob slugs diferentes (`mj`, `mj-engenharia`, `mj-engenharia-flame`) sem
  aviso.
- Página do projeto prioriza **peças de apresentação** (capa, composições, mockups) acima das
  **capturas e seções** — ordem certa para vitrine, errada para pesquisa.

## Problemas de UI

A UI está **acima da média** e já evita a maior parte do "AI slop": cantos retos, sem gradientes,
sem glassmorphism decorativo, acento cobre disciplinado, tokens OKLCH. Os problemas são outros:

- **Hero de landing dentro do app** (`app/page.tsx:12-46`: "Transforme uma URL em um catálogo
  visual…") — a home deveria ser a biblioteca.
- **Baixa densidade:** `max-w-4xl` numa coluna com `pt-16` entre 15 blocos na página do projeto;
  `max-w-6xl` e 3 colunas na biblioteca. Desperdiça monitores largos — ferramenta visual precisa
  de grid fluido de 4–8 colunas com tamanho ajustável.
- **Micro-labels mono em caixa-alta 10–11px com `tracking-widest` em todo lugar** — cansa a leitura
  e perde hierarquia.
- Ícones via glifos Unicode (`⌕ ↻ ✓ ↗`) — renderização inconsistente no Windows.
- Lightbox sem ←/→ entre imagens, sem metadados, sem abrir a próxima.

## Dívida técnica

| Item | Evidência | Peso |
|---|---|---|
| Orquestração no route handler | `api/generate/route.ts` | Alto (bloqueia extensão/CLI/fila) |
| Assets presos em `public/` | `paths.ts:52`, `config.ts:4` | Alto |
| Pastas órfãs em falha | 5/14 pastas | Médio |
| Cancelar não cancela no servidor | `generate/page.tsx:124` | Médio |
| Listagem O(n) | `list-projects.ts` | Baixo agora, alto em escala |
| Tipos fora de `lib/types.ts` | `visual-diff.tsx:5`, `list-projects.ts:6` | Baixo |
| Código `UNKNOWN` em validação | `validate-project-input.ts` | Baixo |
| `.tmp` de vídeo nunca removido | `capture-device.ts:208` | Baixo |
| Paleta amostrada de 13 elementos (1 por seletor) | `inspect-site.ts:39` | Baixo (qualidade de dado) |
| `next dev` escuta na rede local (API de delete aberta na LAN) | `start.bat:4` | Baixo |
| Testes sem runner (scripts com asserts manuais) | `scripts/test-*.ts` | Baixo |
| Paleta de comando com lista congelada na 1ª abertura | `command-palette.tsx` | **Corrigido** |

## Oportunidades

1. **A engine de seções é o ativo mais valioso para o novo job.** Ela já corta um site em
   "Hero / Serviços / Planos / Depoimentos / Rodapé" com screenshot por seção. Isso *é* uma
   referência atômica. Uma captura de site pode virar N referências já classificadas —
   organização automática, sem IA.
2. **A inspeção de DOM** (cores, fontes, stack) é a semente de um "Design DNA" determinístico e
   único: tokens reais extraídos do site vivo, não chutados por IA a partir de pixels.
3. **O Playwright + sessão autenticada** resolve páginas logadas (SaaS, dashboards) — mas uma
   extensão de navegador resolve melhor e com menos atrito.
4. **O usuário já vive no Claude Code.** A integração de maior valor não é colocar IA dentro do
   Atlas — é expor a biblioteca ao agente (pack Markdown e/ou servidor MCP) e deixar o agente
   ser a inteligência. Isso respeita a decisão "Atlas sem IA embutida".
5. **A vitrine continua útil** como o fim do ciclo: o site que eu entrego vira catálogo de
   portfólio *e* referência própria ("o que eu já fiz").

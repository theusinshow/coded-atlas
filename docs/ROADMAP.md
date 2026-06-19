# ROADMAP — Coded Atlas (pós-v1.0)

Plano vivo das próximas evoluções. Cada item é fechado e testável de forma isolada,
no mesmo espírito do `BUILD-PLAN.md`. Marcar `[x]` só quando o critério de aceite passar.

**Status:** v1.1, v1.2 e v1.3 concluídas (lightbox, paleta de comando, seleção em lote,
opções de captura por geração). Roadmap pós-v1.0 zerado.

**Como usar:** atacar uma versão por vez, na ordem sugerida. Ao concluir um item,
mover o detalhe correspondente para o `BUILD-PLAN.md` (registro do que foi feito) e
marcar aqui. A ordem é uma recomendação — pode ser repriorizada.

**Legenda de esforço:** `P` ≈ uma sessão · `M` ≈ algumas sessões · `G` = grande / depende de coisa externa.

**Guard rails mantidos em tudo:** `lib/types.ts` é a fonte única; rota de captura em
`runtime = "nodejs"`; nenhum caminho absoluto no JSON/UI; navegador fechado em `finally`;
viewports/delays/timeouts só em `lib/config.ts`; nada de `any` solto; visual escuro/cobre
da Coded by M (ver `design.md` › "Sistema visual (v1.0)").

---

## v1.1 — Visualização e navegação rápida

> Puro frontend, sem dependências externas, alto valor no uso diário. Começar por aqui.

- [x] **1. Lightbox das capturas** `P`
  _Objetivo:_ ver screenshots/seções/capa em tela cheia, com zoom e navegação por teclado.
  _Escopo:_ componente `components/lightbox.tsx` (client) acionado por clique em qualquer
  imagem da galeria/seções/capa; overlay escuro, `Esc` fecha, `←/→` navega, foco preso no overlay.
  _Arquivos:_ `lightbox.tsx`, `generated-gallery.tsx`, `app/projects/[slug]/page.tsx`.
  _Aceite:_ clicar numa captura abre em tela cheia; teclado funciona; acessível (role=dialog,
  foco gerenciado); fecha sem vazar scroll-lock.

- [x] **2. Paleta de comando (Cmd/Ctrl+K)** `P`–`M`
  _Objetivo:_ buscar e abrir qualquer projeto e disparar ações sem mouse.
  _Escopo:_ `components/command-palette.tsx` montado no layout; índice de projetos via um
  endpoint leve `GET /api/projects` (lista o `ProjectSummary[]`); ações fixas (Gerar, Biblioteca,
  Laboratório) + resultados de projeto (abrir, reprocessar). Navegação por setas/Enter.
  _Arquivos:_ `command-palette.tsx`, `app/api/projects/route.ts`, `app/layout.tsx`.
  _Depende de:_ nada. (Reaproveita `listProjects`.)
  _Aceite:_ `Cmd/Ctrl+K` abre; digitar filtra; Enter abre o projeto; `Esc` fecha; funciona em
  qualquer página.

---

## v1.2 — Operações em lote

> Ganho de produtividade quando a biblioteca cresce. Reaproveita exclusão e ZIP existentes.

- [x] **3. Seleção múltipla na biblioteca** `M`
  _Objetivo:_ selecionar vários projetos e excluir / baixar ZIP / exportar manifests de uma vez.
  _Escopo:_ modo de seleção em `ProjectsLibrary` (checkbox por card, barra de ações fixa com
  contagem); excluir em lote chama `DELETE /api/projects/[slug]` em sequência com confirmação
  única; baixar em lote dispara os ZIPs (ou um endpoint `POST /api/zip` multi-slug — avaliar).
  _Arquivos:_ `projects-library.tsx`, `project-catalog-card.tsx` (variante selecionável),
  opcional `app/api/zip/route.ts`.
  _Depende de:_ exclusão (v1.0, pronto) e ZIP (pronto).
  _Aceite:_ selecionar N projetos, excluir todos com uma confirmação; contagem correta; estado
  limpa após a ação; nada é excluído sem confirmar.

---

## v1.3 — Controle de captura por geração

> Mais poder no formulário: decidir o que capturar em cada projeto, em vez de só via env.

- [x] **4. Opções de captura por geração** `M`
  _Objetivo:_ ligar/desligar **vídeo** e **seções** (e, se valer, escolher profundidade) por
  projeto, direto no formulário, sem mexer em variáveis de ambiente.
  _Escopo:_ estender `ProjectInput` com um `options?: { video?: boolean; sections?: boolean }`
  (opcional, em `lib/types.ts` — fonte única); a rota `/api/generate` passa essas opções para
  `captureDevice`, que hoje lê `config.captureVideo`/`config.captureSections` (passam a ser o
  **default**, sobrescrito pela opção do request); UI: toggles na seção "detalhes" do `UrlInput`.
  Persistir as opções no `catalog.json` (campo já coberto pelos opcionais) para o reprocess herdar.
  _Arquivos:_ `lib/types.ts`, `app/api/generate/route.ts`, `lib/capture/capture-device.ts`,
  `components/url-input.tsx`, `lib/capture/build-catalog.ts`.
  _Depende de:_ nada (a engine já tem os dois caminhos atrás de flags).
  _Risco:_ toca a fonte única de tipos e a engine — fazer com teste do contrato e do reprocess.
  _Aceite:_ gerar com vídeo desligado não cria `videos/` nem o campo `videos`; reprocessar herda
  as opções salvas; `catalog.json` continua batendo com `Catalog`.

---

## Ordem sugerida e dependências

```txt
v1.1  Lightbox  ──►  Cmd+K            (independentes, rápidos)
v1.2  Seleção múltipla                (usa exclusão + ZIP já prontos)
v1.3  Opções de captura por geração   (toca tipos + engine; testar contrato)
```

> Publicação automática no GitHub do portfólio ficou **fora do roadmap** (decisão do Matheus).
> A publicação segue manual assistida: baixar/copiar `portfolio.json` + `case-draft.mdx`.

Critério para fechar cada versão: `next build` limpo, type-check sem erro, teste(s) do que
for testável isoladamente e verificação visual (screenshot) das telas afetadas — o mesmo
padrão usado até aqui.

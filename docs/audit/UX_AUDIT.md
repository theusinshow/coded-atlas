# Coded Atlas — Auditoria de UX

Princípio usado em cada item: **o Atlas deve reduzir trabalho cognitivo, não virar mais uma
ferramenta a administrar.** Prioridades: P0 crítico · P1 muito importante · P2 relevante ·
P3 nice-to-have. Evidência = arquivo:linha ou dado real de `public/generated/`.

---

## 1. Fluxos simulados

### 1.1 Capturar uma referência ("vi uma hero boa no site X")

Hoje: copiar URL → abrir `localhost:5000` → `/generate` → colar URL → sair do campo (autofill do
nome) → escolher categoria (tipos de *projeto*, não de seção) → Gerar → esperar **9–183 s** →
"Ver catálogo" → rolar até "Seções capturadas" (8º bloco) → achar a hero.

**~9 passos, ~1–3 min, e a hero não fica marcada como "o que me interessou".** Nenhum lugar para
escrever por que salvei. Se a hero só aparece após interação, ou está atrás de login, não dá.

Alvo: **atalho no navegador → recorte → (opcional) 1 frase → pronto. < 5 s.** Todo o resto
(domínio, título, favicon, tipo de seção, cores, data) acontece sozinho.

### 1.2 Consultar ("hero escura minimalista de SaaS com tipografia grande", em 500 refs)

Hoje: **impossível.** A busca (`projects-library.tsx:31-43`) cobre só nome, categoria, URL,
cliente e slug. Não há tags, notas, tipo de seção, cor dominante nem descrição. Nomes de seção
detectados existem no `catalog.json` mas não são indexados.

Alvo imediato (sem IA): filtros facetados — tipo `Hero` + tema `escuro` + categoria do site
`SaaS` + texto livre nas notas. Alvo posterior: descrição textual por referência (manual ou
gerada pelo agente) entra no índice de texto → a frase acima vira busca de palavras-chave com boa
precisão, sem embeddings.

### 1.3 Revisitar (salvei há 4 meses)

Hoje consigo: de qual site veio (URL), quando (data). Não consigo: **por que salvei, qual
seção era, o que achei interessante, onde usaria.** O card mostra nome/cliente/categoria —
campos pensados para portfólio.

Alvo: a nota "por que salvei" é o campo mais importante do produto. Deve ser o único campo
pedido na captura e aparecer em destaque no card e no Quick Look.

### 1.4 Criar projeto (`Projeto / Cliente / Zion Guincho`)

Hoje: não existe coleção. "Projeto" no Atlas significa "site capturado". Colisão de vocabulário:
o usuário diria "projeto" para o *site que está criando*, o app usa para o *site que capturou*.

Alvo: **Projeto** = trabalho do cliente (Zion Guincho), com slots por seção (Hero, Sobre, Serviços,
CTA, Rodapé), referências candidatas/escolhidas/rejeitadas e nota de direção. O que hoje é
"projeto" passa a se chamar **Captura** (de site) ou **Catálogo** (vitrine).

### 1.5 Comparar 3 heroes lado a lado

Hoje: impossível — a unidade é o site e não há seleção de imagens.
Alvo: selecionar N referências → `Comparar` → colunas sincronizadas (mesma largura, rolagem
sincronizada opcional).

### 1.6 Estudar padrões ("que padrões aparecem nas minhas heroes?")

Hoje: impossível. Alvo realista: filtro `Hero` → selecionar tudo → "Enviar ao Claude Code"
(pack ou MCP). O agente faz a síntese; o Atlas fornece dados bem estruturados. Um painel interno
de "detecção de padrões" é caro e pior que o agente que o usuário já usa.

### 1.7 Usar com IA ("analise essas 15 referências…")

Hoje: baixar 15 arquivos de 15 páginas, arrastar para o chat, digitar o contexto na mão.
Alvo: selecionar 15 → `Copiar contexto` / `Exportar pack` → `DESIGN_REFERENCES.md` + pasta de
imagens no projeto atual. Ou, via MCP, o agente pede direto: `atlas.search({section:"hero"})`.

---

## 2. Achados

| # | Fluxo | Problema | Impacto | Evidência | Solução | Prio |
|---|---|---|---|---|---|---|
| U1 | Todos | O produto resolve o job "vitrine", não o job "referência" pedido | Ferramenta não entra no dia a dia | Última captura 27/jun; `docs/product.md` | Adotar modelo **Referência** como entidade de primeira classe; vitrine vira um modo | **P0** |
| U2 | Capturar | Captura leva 9–183 s e sempre gera capa, 3 composições, 4 mockups, vídeo | Nenhum designer espera 1 min por uma referência | `route.ts:146-159`; `meta.durationMs` reais | Perfil **Rápido** (viewport + full page + seções, sem vídeo/mockups); extras sob demanda | **P0** |
| U3 | Capturar | Não dá para capturar região, elemento, estado visto na tela, página logada | O que mais interessa (um componente) não é capturável | ausência de feature | Colar/arrastar imagem (curto prazo) + extensão (médio prazo) | **P0** |
| U4 | Capturar | Campos obrigatórios irrelevantes (nome, slug, categoria de projeto) | Metadados lixo; atrito | `231`/`321`, `Mj`/`1`, `good-fella`/`good-fella` | Só URL obrigatória; nome = título da página; slug interno; categoria opcional | **P1** |
| U5 | Revisitar | Não existe "por que salvei" / notas / tags | Referência perde sentido em semanas | `lib/types.ts` (sem campo) | Campo `note` + `tags` + `section` em cada referência | **P0** |
| U6 | Consultar | Busca só em metadados de formulário | Biblioteca vira pasta de prints | `projects-library.tsx:31-43` | Índice de texto (título, domínio, notas, tags, nomes de seção, descrição) + facetas | **P1** |
| U7 | Organizar | Sem coleções/projetos de cliente | Não serve para um trabalho específico | ausência | Projetos com slots por seção | **P1** |
| U8 | Organizar | Duplicatas silenciosas | Lixo e confusão | `mj`, `mj-engenharia`, `mj-engenharia-flame` = mesma URL | Aviso "já capturado em…" + hash de imagem | **P1** |
| U9 | Organizar | Falhas deixam pastas órfãs invisíveis | 26% do disco usado sem dono | 5 pastas sem `catalog.json` | Limpar pasta ao falhar; listar "incompletas" | **P1** |
| U10 | Capturar | Cancelar não cancela o servidor | Captura "fantasma" sobrescreve depois | `generate/page.tsx:124`; `route.ts` ignora `req.signal` | Checar `req.signal` entre passos e abortar | **P2** |
| U11 | Consultar | Página do projeto é um scroll de 15 blocos, peças de apresentação primeiro | Achar a seção leva rolagem longa | `projects/[slug]/page.tsx:142-426` | Abas (Capturas · Seções · Vitrine · Dados) ou âncoras fixas; seções primeiro | **P2** |
| U12 | Consultar | Lightbox sem ←/→, sem metadados, sem nota | Revisão lenta | `zoom-image.tsx` | Quick Look global: Espaço abre, ←/→ navega, painel lateral com nota/tags/URL | **P1** |
| U13 | Consultar | Grid fixo 3 colunas, cards altos com metadados de portfólio | Baixa densidade visual | `projects-library.tsx:178` | Masonry com slider de tamanho; card mínimo (imagem + domínio + seção) | **P1** |
| U14 | Todos | Home é uma landing com hero | Clique extra toda vez; "app que parece site" | `app/page.tsx:12-46` | `/` = biblioteca (Inbox/Recentes) com campo de captura no topo | **P2** |
| U15 | Todos | Poucos atalhos (só Ctrl+K) | Uso diário lento | `command-palette.tsx` | Sistema de atalhos (ver §3) | **P2** |
| U16 | Lote | Ações em lote só excluir e baixar ZIPs | Organizar 20 itens exige 20 páginas | `projects-library.tsx:94-105` | Taggear, mover para projeto, arquivar, exportar pack | **P1** |
| U17 | Capturar | Estados exigem seletor CSS digitado | Só quem inspeciona DOM usa | `url-input.tsx` (`Nome \| seletor`) | Manter para vitrine; para referência, extensão captura o que está na tela | **P3** |
| U18 | Capturar | Captura logada só via CLI, sem UI, e diff ignora sessão | Feature escondida | `scripts/login.mjs`; `api/diff/[slug]/route.ts:54` | Botão "Entrar e salvar sessão" na UI; diff usar `authContextOptions` | **P2** |
| U19 | Usar com IA | Nenhuma saída pensada para agentes | Designer re-explica tudo ao Claude | ausência | Pack `DESIGN_REFERENCES.md` + MCP | **P1** |
| U20 | Todos | Paleta de comando com lista congelada após 1ª abertura | Projeto novo não aparece no Ctrl+K | `command-palette.tsx` | Recarregar a cada abertura | **Corrigido** |
| U21 | Todos | Vocabulário "projeto" colide com o projeto do cliente | Ambiguidade permanente | UI inteira | Renomear: Referência · Captura/Catálogo · Projeto (cliente) | **P1** |
| U22 | Feedback | Toast "Pode fechar esta aba" mas, fechada, nunca recebe `done` | Toast fica "gerando" até ficar stale (8 min) | `generation-toast.tsx`, `generate/page.tsx:196` | Status no servidor (job em memória) consultável | **P3** |

---

## 3. Sistema de atalhos proposto

Coerência: **uma tecla = um verbo** na biblioteca; **G + letra = ir para**; **Ctrl/Cmd** só para
globais. Nunca ativos com foco em campo de texto.

| Contexto | Tecla | Ação |
|---|---|---|
| Global | `Ctrl/Cmd+K` | Paleta de comando (buscar tudo + ações) |
| Global | `Ctrl/Cmd+V` | Colar imagem/URL → nova referência no Inbox |
| Global | `/` | Focar busca |
| Global | `N` | Nova captura por URL |
| Global | `G I` · `G L` · `G P` · `G C` | Inbox · Biblioteca · Projetos · Catálogos (vitrine) |
| Grid | `J/K` ou setas | Mover seleção |
| Grid | `Espaço` | Quick Look |
| Grid | `X` | Marcar/desmarcar (seleção múltipla) · `Shift+clique` intervalo |
| Grid | `T` | Adicionar tag |
| Grid | `S` | Definir tipo de seção (menu: Hero, Navbar, Pricing…) |
| Grid | `P` | Adicionar a projeto |
| Grid | `E` | Editar nota ("por que salvei") |
| Grid | `A` | Arquivar (sai do Inbox) |
| Grid | `C` | Comparar selecionados |
| Grid | `Shift+E` | Exportar pack / copiar contexto |
| Grid | `Del` | Excluir (com desfazer, não modal) |
| Grid | `+` / `-` | Tamanho dos cards |
| Quick Look | `←/→` | Anterior/próxima · `Esc` fecha · `Z` zoom 1:1 · `O` abre a URL de origem |

Todas as ações também na paleta de comando, com o atalho exibido ao lado — é assim que atalhos
são descobertos.

---

## 4. Revisão "AI slop"

| Padrão | Presente? | Onde |
|---|---|---|
| Cards demais / tudo em container | Moderado | Página do projeto embrulha cada imagem em borda + fundo |
| Gradientes, glow, glassmorphism | Não (só `backdrop-blur` funcional em overlays) | — |
| Radius enorme | Não (cantos retos — bom) | — |
| Hero desnecessária dentro do app | **Sim** | `app/page.tsx`, `/lab` no menu |
| Estatísticas inúteis | Leve | "640 × 400 / 320 × 640", "v0.2.0", duração em s no hero do projeto |
| Texto explicativo excessivo | Moderado | Empty states e landing com passos 01/02/03 |
| Badges sem função | Leve | Badge de categoria sobre toda thumbnail |
| Excesso de espaço vertical | **Sim** | `space-y-16` + `pt-16` em 15 blocos |
| Micro-labels mono caixa-alta | **Sim, excessivo** | Quase todo título de bloco |

Direção: manter a paleta e os cantos retos (são a identidade Coded by M); **cortar** landing
interna, espaçamento vertical e labels decorativos; **ganhar** densidade, grid fluido e
superfícies que somem quando a imagem está na tela (a imagem é o conteúdo).

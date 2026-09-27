# Coded Atlas — Big Bets

Cinco apostas. Cada uma passa no critério "me ajuda a criar sites melhores ou mais rápido?" e
se apoia em algo que **já existe** no código. Ordem = ordem recomendada de execução.

---

## 1. Section Explode — um site vira N referências classificadas

**Problema.** Capturar um site inteiro para guardar a hero dele é desperdício, e classificar à
mão cada pedaço é o motivo de bibliotecas de referência morrerem.

**Solução.** A captura por URL (perfil Rápido) já detecta e nomeia seções (`detect-sections.ts` +
`section-name.ts`). Cada seção passa a ser salva como uma **Referência** própria, com
`section: "hero" | "pricing" | ...` pré-preenchido, domínio, título, data, cores. O usuário
mantém as que interessam com um toque (ou todas vão para o Inbox em grupo).

**Valor.** Organização automática, sem IA, a partir de um ativo pronto. Uma URL colada → filtro
"Hero" já funciona.

**Complexidade.** Baixa-média (depende da entidade Referência). **Dependências:** modelo de
Referência, storage novo. **Prioridade:** P0 dentro da Fase 2.

**MVP.** Após capturar uma URL, tela "Seções encontradas" em grid; `Enter` salva as marcadas no
Inbox; a heurística de nome mapeada para um vocabulário fixo de seções.

**Riscos.** Heurística falha em sites sem semântica (fallback por scroll gera "fatias" sem nome) →
nesses casos, marcar `section: unknown` e deixar a triagem (ou o agente) nomear.

---

## 2. Atlas MCP — a biblioteca como memória do seu agente

**Problema.** O Claude Code não sabe o que você já viu e gostou. Você re-explica a cada projeto.

**Solução.** Um servidor MCP local (stdio, TypeScript, lê a mesma pasta da biblioteca):

- `search_references({ text?, section?, tags?, domain?, project?, limit })`
- `get_reference(id)` → metadados + imagem (recurso de imagem)
- `get_project_brief(projectId)` → o mesmo conteúdo do `DESIGN_REFERENCES.md`
- `annotate_reference(id, { description?, tags?, section? })` — **escrita**, usada para triagem

**A jogada:** a triagem inteligente ("descreva e taggeie meu Inbox") vira um comando no Claude
Code que usa sua assinatura existente, lê as imagens via MCP e escreve de volta. **Auto-tagging e
descrição visual sem uma linha de IA no Atlas** — respeita a decisão de manter o app
determinístico e evita chave de API, custo e prompt dentro do produto.

**Valor.** Altíssimo para o fluxo real do usuário. É o diferencial que nenhuma ferramenta de
referência tem hoje.

**Complexidade.** Média. **Dependências:** entidade Referência + índice (Fases 1–3).
**Prioridade:** P1. **MVP:** 2 tools de leitura (`search`, `get`) + 1 de escrita (`annotate`) +
um slash command/skill `atlas-triage` no repo.

**Riscos.** Imagens grandes estouram contexto → servir sempre o `preview` (≤ 1600 px WebP), nunca
o full page original.

---

## 3. Project Board → `DESIGN_REFERENCES.md`

**Problema.** Referências só geram valor quando viram decisão num projeto concreto. Moodboards
livres viram bagunça; listas planas não dizem "isto é para a hero".

**Solução.** **Projeto** (ex.: *Stige Escadas*) com **slots** fixos por seção do site que você está
construindo (Hero · Sobre · Produtos · Projetos · CTA · Rodapé — editáveis). Cada referência no
slot tem estado (candidata / escolhida / rejeitada) e uma nota curta: *"pegar: tipografia enorme
+ foto vertical; não pegar: o carrossel"*. Uma nota de **direção** no topo.

Exportar gera, dentro do repo do cliente:

```md
docs/design-references/
├─ DESIGN_REFERENCES.md
└─ img/hero-01-linear.webp …

# Design References — Stige Escadas
Direção: premium, arquitetônico, fotografia vertical, muito respiro.

## Hero
### Linear — linear.app (capturado 2026-09-12)
![](img/hero-01-linear.webp)
- Pegar: headline gigante com tracking negativo, CTA único.
- Não copiar: gradiente de fundo, ilustração do produto.
…
## Restrições
- Não reproduzir layout, texto ou assets de nenhuma referência 1:1.
- Paleta e tipografia próprias do cliente prevalecem.
```

**Valor.** Transforma o Atlas de biblioteca passiva em ferramenta de projeto, e liga direto ao
Claude Code. **Complexidade:** Média. **Dependências:** Referência + tags/seção.
**Prioridade:** P1. **MVP:** projeto com slots, arrastar/`P` para adicionar, estados, notas,
"Exportar pack" (pasta escolhida) e "Copiar contexto".

**Riscos.** Virar canvas. Regra: slots são **listas ordenadas**, não posições livres.

---

## 4. Atlas Clipper — extensão de navegador

**Problema.** A referência está na aba aberta, às vezes logada, às vezes num estado específico
(menu aberto, hover). Mandar a URL para um Playwright headless captura *outra coisa*.

**Solução.** Extensão Chrome MV3 (Edge/Arc/Brave compatíveis) que conversa com
`http://127.0.0.1:<porta>`:

- `Alt+Shift+S` → recortar região da aba (via `chrome.tabs.captureVisibleTab` + crop);
- `Alt+Shift+E` → escolher elemento (overlay de hover, captura o `boundingRect`);
- `Alt+Shift+A` → página inteira pelo Atlas: envia só a URL e o servidor captura com Playwright
  (Section Explode). Cookies **nunca** saem da extensão — para página logada, usa-se o recorte;
- popup mínimo: campo "por quê" + seção + projeto recente. `Enter` salva.

Envia imagem + URL + título + favicon + viewport + seletor aproximado. Tudo cai no Inbox.

**Valor.** É o que torna a promessa "< 5 s" real e resolve páginas logadas sem `login.mjs`.
**Complexidade:** Média (a API do Atlas precisa existir; a extensão em si é pequena).
**Dependências:** endpoint de ingestão (`POST /api/references`), CORS restrito à extensão,
pipeline fora do route handler. **Prioridade:** P1 (Fase 6, após o núcleo provar valor com
Ctrl+V). **MVP:** só recorte de região + nota.

**Riscos.** Atlas precisa estar rodando → mensagem clara na extensão ("Atlas offline — iniciar
start.bat") e fila local no `chrome.storage` para reenviar.

---

## 5. Design DNA determinístico

**Problema.** Descrever o estilo de uma referência ("tipografia grande, raio pequeno, sombras
suaves") é subjetivo; IA olhando pixels chuta valores.

**Solução.** Estender `inspect-site.ts` para medir no DOM vivo, por frequência e área:

- escala tipográfica (tamanhos/pesos/line-height distintos de h1–h6, p, botões);
- famílias (já existe);
- paleta com peso por área coberta (hoje: 13 amostras);
- raios, sombras e bordas mais frequentes;
- largura do container, gutters, espaçamento vertical entre seções;
- densidade (texto/área) e tema claro/escuro.

Painel compacto na referência de URL + export como CSS custom properties / tema Tailwind **para
estudo**, e comparação de DNA entre 2–4 referências ("Linear usa 3 tamanhos; Vercel usa 5").

**Valor.** Alto para aprender e para briefings objetivos ao agente; único no mercado de
ferramentas de referência. **Complexidade:** Média. **Dependências:** nenhuma de arquitetura
(roda na captura por URL). **Prioridade:** P2. **MVP:** tipografia + paleta por área + raio +
tema, exibidos na referência e incluídos no pack.

**Riscos.** Export de tokens incentiva cópia → o pack rotula como "medido em X, para estudo" e
a seção de restrições se aplica. Motion **não** é mensurável de forma confiável — fora do escopo.

---

## Apostas descartadas (e por quê)

| Ideia | Motivo |
|---|---|
| Ask Atlas (chat interno) | Duplica o Claude Code; o MCP entrega o mesmo com o agente certo |
| Canvas/moodboard livre | Figma já existe; custo alto; vira ferramenta a administrar |
| Embeddings + vector DB agora | Sem volume que justifique; texto indexado resolve a maior parte |
| Versionamento de sites de terceiros | Não ajuda a projetar; diff fica para sites próprios |
| App desktop (Tauri/Electron) | localhost + extensão cobrem; manutenção dobrada |

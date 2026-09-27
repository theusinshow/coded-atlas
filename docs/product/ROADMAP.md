# Coded Atlas — Roadmap de Produto (pós-auditoria)

> Substitui, para o futuro, o `docs/ROADMAP.md` (v1.1–v1.7, **fechado** — mantido como histórico).
> Execução detalhada em `docs/implementation/MASTER_PLAN.md`.

## Agora — tornar o que existe útil e preparar a virada

Objetivo: parar de pagar custos desnecessários e decidir o rumo.

- **Decisão de produto:** aceitar (ou ajustar) `PRODUCT_VISION.md` — o Atlas passa a ter
  Referências como núcleo e a vitrine como modo. Revisar guard rail 7 do `CLAUDE.md`.
- Quick wins QW1–QW16 (`docs/audit/QUICK_WINS.md`), com destaque para:
  perfil **Rápido** como padrão, limpeza de pastas órfãs, aviso de URL duplicada, cancelamento
  real, seções primeiro na página do projeto, home = biblioteca.
- Commitar a captura autenticada (WIP) e aplicá-la ao diff.

## Próximo — o núcleo de referências (consolida o fluxo)

- Biblioteca fora do repo (`ATLAS_LIBRARY_DIR`) servida por rota própria.
- Pipeline extraído do route handler + fila de 1 worker.
- Entidade **Referência** (nota, seção, tags, origem, status) + índice em memória.
- **Colar/arrastar** imagem e vídeo → Inbox. Captura por URL no perfil Rápido com
  **Section Explode**.
- Migração não destrutiva dos catálogos existentes (seções viram referências).
- **Inbox + triagem por teclado**, grid masonry com tamanho ajustável, **Quick Look**,
  busca textual + facetas, ações em lote, paleta de comando com ações.
- **Projetos de cliente** com slots por seção → **`DESIGN_REFERENCES.md`** + "Copiar contexto".

## Depois — integração profunda e captura na fonte

- **Atlas MCP** (search/get/brief/annotate) + skill `atlas-triage` para Claude Code.
- **Atlas Clipper** (extensão): região, elemento, página → Inbox.
- **Design DNA** determinístico + comparação entre referências.
- Comparar lado a lado; patterns como "tags com página"; importar pasta de screenshots.
- Virtualização do grid (quando passar de ~2k referências).

## Experimental — validar valor antes de investir

- Auto-tag por API na ingestão (desligado por padrão).
- Similaridade visual por embeddings locais ("Similar in Atlas").
- **Originality Check** (ver abaixo).
- Índice Estágio B (`node:sqlite` + FTS5) — só com > 10k referências.
- Canvas de moodboard — só se o Project Board comprovadamente não bastar.

---

## Features que você não mencionou

### 1. Originality Check (antes de entregar)

- **Problema:** o risco real de trabalhar com referências é entregar algo parecido demais.
- **Solução:** capturar o site em desenvolvimento (o Atlas já captura `localhost:5173`, ver
  `estudio-lentz`), fatiar em seções e comparar cada seção com as referências do slot
  correspondente no Projeto: lado a lado + similaridade (dHash/embeddings) + DNA
  (mesma escala tipográfica? mesma paleta?).
- **Valor:** protege reputação e reforça o princípio "referência não é cópia".
- **Complexidade:** Média. **Dependências:** Projetos, Section Explode, DNA.
- **Prioridade:** Experimental. **MVP:** tela lado a lado seção × referências do slot, sem score.

### 2. O próprio trabalho como referência

- **Problema:** soluções que você já projetou (e funcionaram) ficam presas em cada repo.
- **Solução:** todo Catálogo de vitrine gera também referências com `tags: ["coded-by-m"]` e o
  cliente. Filtro "Meu trabalho".
- **Valor:** consistência de estúdio, reuso de padrões próprios, briefing mais rápido.
- **Complexidade:** Baixa (é o Section Explode aplicado à vitrine). **Dependências:** Referência.
- **Prioridade:** P2. **MVP:** flag no formulário da vitrine "também salvar como referências".

### 3. Uso registrado ("onde isso foi usado")

- **Problema:** não se sabe quais referências de fato influenciaram projetos — nem quais nunca
  serviram.
- **Solução:** ao exportar um pack, cada referência "escolhida" ganha `usedIn: [projeto, data]`.
  Filtros "nunca usadas há 6 meses" (candidatas a arquivar) e "mais usadas" (seus padrões reais).
- **Valor:** a biblioteca aprende o seu gosto sem IA; limpeza guiada por dado.
- **Complexidade:** Baixa. **Dependências:** Projetos + pack. **Prioridade:** P2.
- **MVP:** campo `usedIn` + dois filtros.

### 4. Redescoberta

- **Problema:** referência não vista é referência perdida.
- **Solução:** faixa discreta na home: "de 3 meses atrás" / "no mesmo tipo de seção que você
  abriu por último" (4 cards).
- **Valor:** combate esquecimento com custo zero de atenção.
- **Complexidade:** Baixa. **Dependências:** Referência + índice. **Prioridade:** P3.
- **MVP:** 4 referências aleatórias de > 60 dias com nota.

### 5. Briefing de seção avulsa

- **Problema:** às vezes você só quer passar *uma* referência ao agente, sem montar projeto.
- **Solução:** no Quick Look, `Shift+C` copia um bloco Markdown da referência (imagem em
  caminho absoluto local + nota + DNA + restrição anti-cópia) pronto para colar no Claude Code.
- **Valor:** o caminho mais curto referência → implementação.
- **Complexidade:** Baixa. **Dependências:** Referência. **Prioridade:** P1 (sai junto com o pack).
- **MVP:** botão + atalho.

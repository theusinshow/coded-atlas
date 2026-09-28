# CLAUDE.md — Coded Atlas

## Missão

O **Coded Atlas** é uma ferramenta interna da **Coded by M** para transformar sites, softwares e produtos digitais em mídia de apresentação de alto nível.

O Atlas não é um code reviewer, IDE, auditor de front-end, gerenciador de projeto ou SaaS genérico. Seu foco é:

**Import → Capture → Understand → Create → Render → Publish**

Saídas-alvo: screenshots, mockups, social posts, carrosséis, stories, reels, showcase videos, motion, apresentações, case studies, assets para portfólio e pacotes para cliente.

## Fonte da verdade e precedência

Antes de implementar qualquer alteração, leia nesta ordem:

1. `docs/CURRENT.md`
2. `docs/ROADMAP.md`
3. `docs/PRODUCT.md`
4. `docs/ARCHITECTURE.md`
5. documento específico do domínio afetado.

Em conflito:

1. `CURRENT.md` define o que pode ser implementado agora.
2. `ARCHITECTURE.md` prevalece em decisões técnicas.
3. `PRODUCT.md` prevalece em decisões de escopo.
4. `DESIGN-SYSTEM.md` e `UX-ARCHITECTURE.md` prevalecem em UI/UX.
5. `DECISIONS.md` registra decisões de alto impacto.

## Regra de fase

NUNCA implemente features de uma fase futura apenas porque aparecem na documentação.

Ao terminar uma tarefa:

1. executar type-check;
2. executar lint;
3. executar testes relevantes;
4. executar build quando aplicável;
5. registrar o que foi alterado em `docs/BUILD-PLAN.md`;
6. atualizar `docs/CURRENT.md`;
7. listar como verificar;
8. parar antes de iniciar a próxima fase.

## Princípios obrigatórios

- Local-first.
- TypeScript strict.
- Sem `any` solto.
- Contratos de domínio validados em runtime com Zod.
- SQLite é a fonte persistente de verdade.
- Filesystem guarda arquivos pesados; nunca BLOBs de mídia no SQLite.
- Toda escrita de arquivo passa por `AssetStorage`.
- IDs internos são estáveis; slug nunca é identidade.
- Assets e Outputs são imutáveis.
- Jobs pesados não rodam dentro de request longa de UI.
- Playwright, Sharp, FFmpeg e Remotion são infraestrutura, nunca domínio.
- IA nunca escreve direto em banco, filesystem, shell ou Git.
- Atlas Brain produz estruturas validadas; application services executam.
- Render nunca depende da UI estar aberta.
- Preview e render final são conceitos separados.
- O software continua utilizável sem IA.
- Não criar infraestrutura cloud sem necessidade real.
- Não criar abstrações especulativas fora do roadmap ativo.

## Design

A interface deriva do design system da **Coded by M**. Nunca invente uma linguagem visual paralela.

Se um padrão existir na Coded by M, reutilize-o. Se um componente novo for necessário para o Atlas, ele deve usar foundation tokens da Coded by M, criar semantic tokens do Atlas quando necessário, ser reutilizável e documentado.

## Anti-AI-slop

A IA seleciona e combina sistemas visuais curados. Ela não inventa HTML/CSS arbitrário para cada geração.

Correto:

`CreativeRequest → CreativePlan → CompositionDefinition → CompositionInstance → Render`

Errado:

`prompt → HTML aleatório → render`

## Limites de produto

Fora do Atlas: code review, auditoria de qualidade de código, performance audit como produto, correção automática de código, PR review, IDE agent, CRM e gestão comercial.

## Stack alvo

- Next.js + React + TypeScript
- Tailwind CSS
- Zustand para estado efêmero de UI/editor
- Zod
- SQLite + Drizzle ORM + `better-sqlite3`
- Playwright
- Sharp
- Remotion + FFmpeg
- OpenAI Responses API atrás de `ModelGateway`
- Vitest + Playwright Test
- Node workers locais + SSE

Veja `docs/STACK.md`.

## Guard rails críticos

1. Não usar `catalog.json` como nova fonte de verdade.
2. Não gravar paths absolutos em objetos de domínio.
3. Não acessar filesystem diretamente fora da infraestrutura de storage.
4. Não deixar request HTTP segurar render/capture de longa duração.
5. Não sobrescrever asset existente para representar uma nova versão.
6. Não usar slug para construir paths sem validação/confinamento.
7. Não expor shell, SQL ou filesystem ao Atlas Brain.
8. Não publicar conteúdo automaticamente sem ação explícita do usuário.
9. Não criar editor gráfico generalista.
10. Não transformar Motion Studio em After Effects.
11. Não duplicar contratos TypeScript/Zod.
12. Não quebrar funcionalidades legadas durante migração sem adapter ou migração explícita.

## Código legado durante a migração

O Atlas v1 (em `app/`, `components/`, `lib/`) continua em produção enquanto a nova
fundação cresce em `src/`. Regras que seguem valendo para o código legado até ele ser
migrado (ver `docs/MIGRATION.md` e `docs/legacy/`):

- rotas que usam Playwright/`fs` declaram `runtime = "nodejs"` — nunca Edge;
- Playwright e `fs` só no servidor, nunca em Client Component;
- navegador fecha SEMPRE em `finally`;
- viewports, delays e timeouts do pipeline legado vivem em `lib/config.ts`;
- `catalog.json` e a UI usam só caminhos públicos (`/generated/...`), nunca absolutos;
- visual escuro, técnico e premium da Coded by M.

Código novo vai para `src/` e depende de `src/core` (domínio) — nunca o contrário.
Testes novos: `npm test` (Vitest). Scripts legados: `npx tsx scripts/test-*.ts`.

## Regra final

Sempre prefira **sistema pequeno, explícito, tipado, testável e evolutivo** a feature impressionante acoplada, implícita e difícil de manter.

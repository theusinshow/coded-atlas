# CLAUDE.md — Coded Atlas

Ferramenta interna da **Coded by M**: recebe a URL de um projeto web e gera um catálogo
visual (screenshots desktop/mobile, full page e thumbnails) para uso no portfólio.

**Direção pós-MVP (decidida em 2026-09-27):** o Atlas vira também a **biblioteca de
referências visuais** do Matheus e a ponte para o Claude Code. Visão em
`docs/product/PRODUCT_VISION.md`; execução em `docs/implementation/MASTER_PLAN.md` (Fases 0–7,
em ordem, parando ao fim de cada fase para teste). A vitrine atual continua como um modo.

## Fonte da verdade

- `docs/product.md` → produto, escopo, MVP e roadmap (o "o quê" e o "porquê").
- `docs/design.md` → linguagem visual, fluxos de tela e estados de interface (a experiência).
- `docs/architecture.md` → especificação técnica e contratos de implementação (o "como").

Em qualquer conflito técnico, **o `architecture.md` prevalece**.
SEMPRE leia os três por completo antes de implementar qualquer coisa.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · Playwright · Sharp.
Sem banco de dados, sem login, sem cloud no MVP.

## Fonte única de tipos

`lib/types.ts` é a fonte única. Nenhuma estrutura de dados — em especial o `catalog.json` —
pode divergir das interfaces definidas lá.

## Guard rails (nunca violar)

1. A rota de captura usa `runtime = "nodejs"` — nunca Edge.
2. Nenhum caminho absoluto no `catalog.json` nem na UI (sempre `/generated/...`).
3. Playwright e `fs` só no servidor — nunca dentro de Client Component.
4. Fechar o navegador SEMPRE em `finally`, inclusive em erro.
5. Viewports, delays e timeouts vivem só em `lib/config.ts` — nada hardcoded no meio do código.
6. Nada de `any` solto. Todo erro vira `AtlasError` com um código conhecido.
7. Nada de banco de dados servidor, login, multiusuário ou cloud. Arquivos no disco são a fonte
   da verdade; um índice local derivado (reconstruível a partir dos arquivos) é permitido.
   Nenhuma IA embutida obrigatória: a inteligência vem do agente (MCP/pack) ou de opção
   desligada por padrão.
8. Visual escuro, técnico e premium da Coded by M — nada com cara de SaaS genérico.

## Ordem de construção (build order)

Seguir a seção "Ordem de Implementação" do `architecture.md`, da **Fase 0 à Fase 11**.
NÃO pular fases. Ao terminar cada fase: descreva o que foi feito, como verificar, e
**pare para eu testar** antes de seguir para a próxima.
Manter `docs/BUILD-PLAN.md` atualizado: marcar cada fase concluída e a nota de status no topo.

## Verificação

- A Fase 3 precisa produzir um PNG real em `public/generated/` antes de existir qualquer tela.
- Critérios finais de aceite: a checklist "Definition of Done — MVP" do `architecture.md`.

## Saída no Git

Adicionar `/public/generated/*` ao `.gitignore` (manter a pasta versionada com um `.gitkeep`).

# Coded Atlas

> **Visual production engine for digital projects.**

O **Coded Atlas** é uma ferramenta interna da **Coded by M** para transformar sites, softwares e produtos digitais em material visual pronto para apresentar, divulgar e publicar.

## Visão

```text
Website / Software / App
          ↓
        Import
          ↓
        Capture
          ↓
       Understand
          ↓
        Create
          ↓
        Render
          ↓
        Publish
```

O Atlas organiza a matéria-prima do projeto, entende sua identidade visual, cria composições e transforma tudo em screenshots, mockups, posts, carrosséis, stories, reels, vídeos showcase, motion, apresentações, cases, assets para portfólio e pacotes de entrega.

## O que o Atlas não é

- code reviewer;
- auditor de front-end;
- IDE;
- CRM;
- gerenciador de projeto;
- SaaS genérico.

## Arquitetura alvo

- Next.js + React + TypeScript
- SQLite + Drizzle
- filesystem via `AssetStorage`
- Playwright + Sharp
- Remotion + FFmpeg
- GPT-6 Luna via `ModelGateway` como Creative Director
- workers locais + job queue persistida
- Zod como contrato runtime

## Documentação

Comece por `docs/VISION.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md` e `docs/CURRENT.md`.

Para agentes de desenvolvimento, leia primeiro `CLAUDE.md`.

## Migração

O Atlas v1 (`catalog.json` + `public/generated`) foi aposentado na 3.1: tudo o que ele fazia existe no
modelo novo (SQLite + AssetStorage + Jobs + Domain Model), incluindo captura autenticada e diff visual.
A biblioteca v1 continua sendo importada (somente leitura) e seus arquivos nunca são alterados.
Veja `docs/MIGRATION.md`.

## Desenvolvimento

```bash
npm install          # também instala o Chromium do Playwright
npm run dev          # app (o start.bat sobe na porta 5000)
npm run typecheck
npm run lint
npm test             # Vitest
npm run build
npm run e2e          # smoke pela UI real (E2E_BASE_URL + servidor com ATLAS_HOME temporário)
npm run db:migrate   # cria/atualiza .atlas/atlas.db (ou $ATLAS_HOME)
npm run legacy:scan  # relatório (somente leitura) dos projetos v1 no modelo novo
npm run worker       # worker de jobs avulso (o servidor já sobe um embutido; ATLAS_WORKER=off desliga)
npm run atlas:login -- <slug> [url]  # login manual para captura autenticada
```

Variáveis: `ATLAS_HOME` (padrão `./.atlas`), `ATLAS_URL_POLICY` (`local` | `hosted-safe`),
`ATLAS_WORKER=off`, `ATLAS_CAPTURE_JOB_TIMEOUT_MS`, `ATLAS_OUTPUT_DIR` (biblioteca v1 a importar,
padrão `public/generated`). Viewports, esperas e limites da captura ficam em
`src/infrastructure/capture-settings.ts`, sobrescrevíveis pelas mesmas variáveis `ATLAS_*` do v1.
IA, entregas e vídeo: veja `.env.example`.

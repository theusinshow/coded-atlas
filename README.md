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

O repositório existente já possui pipeline funcional de captura, social kit, mockups, vídeo, diff e geração de case. A nova arquitetura não descarta esse trabalho.

Ela migra gradualmente:

```text
catalog.json + public/generated
              ↓
SQLite + AssetStorage + Jobs + Domain Model
```

Veja `docs/MIGRATION.md`.

## Desenvolvimento

```bash
npm install          # também instala o Chromium do Playwright
npm run dev          # app (o start.bat sobe na porta 5000)
npm run typecheck
npm run lint
npm test             # Vitest (nova fundação em src/)
npm run build
npm run db:migrate   # cria/atualiza .atlas/atlas.db (ou $ATLAS_HOME)
```

O uso do Atlas v1 (formulário, opções de captura, scripts por fase) está documentado em
`docs/legacy/v1-README.md` enquanto a migração não substitui esses fluxos.

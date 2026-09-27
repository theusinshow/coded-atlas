# Coded Atlas — Quick Wins

Mudanças de **baixo esforço e alto impacto**, possíveis no código atual sem decidir a arquitetura
nova. Ordenadas por impacto/esforço. `P` ≈ < 1 h · `M` ≈ meia sessão.

## Já aplicados nesta auditoria

- [x] **Paleta de comando recarrega a lista a cada abertura** (`components/command-palette.tsx`).
  Antes, um projeto gerado depois da primeira abertura do Ctrl+K nunca aparecia até recarregar a página.
- [x] **`docs/ROADMAP.md`**: itens 5 e 6 (composições e mockups) marcados como entregues — o
  código e o `BUILD-PLAN.md` já confirmavam.

## Para fazer

| # | Mudança | Por quê | Arquivos | Esforço |
|---|---|---|---|---|
| QW1 | **Perfil de captura "Rápido" como padrão**: vídeo off, sem composições/mockups/capa 3D; botão "Gerar peças de vitrine" na página do projeto | Captura cai de ~60 s para ~10–15 s; disco cai ~70% | `route.ts:146-159`, `url-input.tsx:39`, `types.ts (CaptureOptions)` | M |
| QW2 | **Limpar a pasta quando a geração falha** (se não havia `catalog.json` antes) | 5 de 14 pastas são órfãs (≈65 MB) | `app/api/generate/route.ts` (catch), `lib/storage/delete-project.ts` | P |
| QW3 | **Aviso de URL já capturada** no formulário ("já existe em *mj-engenharia-flame* — abrir / reprocessar / capturar mesmo assim") | Mesma URL capturada 3× nos dados reais | `url-input.tsx`, `/api/projects` (já retorna `url`) | P |
| QW4 | **Cancelamento real**: checar `req.signal.aborted` entre passos e abortar | Hoje "Cancelar" deixa o servidor trabalhando e sobrescrevendo | `route.ts`, `capture-device.ts` | P |
| QW5 | **Diff usa a sessão autenticada** (`authContextOptions(slug)`) | Recaptura de app logado compara com a tela de login | `app/api/diff/[slug]/route.ts:54` | P |
| QW6 | **Commitar a captura autenticada** (WIP atual) e documentar no README | Feature pronta, escondida e não versionada | `auth-state.ts`, `login.mjs`, README | P |
| QW7 | **Seções primeiro na página do projeto** + índice de âncoras fixo no topo (Capturas · Seções · Vitrine · Dados · Downloads) | Seção é o que se procura; hoje está no 8º bloco | `app/projects/[slug]/page.tsx` | M |
| QW8 | **Lightbox com ←/→** entre todas as imagens da página e legenda com nome da seção | Revisão visual 3× mais rápida | `zoom-image.tsx` → contexto de galeria | M |
| QW9 | **Nomes de seção na busca da biblioteca** (`ProjectSummary.sectionNames`) | Buscar "planos" ou "depoimentos" encontra sites que têm a seção | `list-projects.ts`, `projects-library.tsx` | P |
| QW10 | **Home = biblioteca**: remover a hero de landing; campo de URL no topo + recentes | Um clique a menos sempre; menos "site dentro do app" | `app/page.tsx` | P |
| QW11 | **Densidade**: grid da biblioteca fluido (`max-w-none`, 4–6 colunas em telas largas); reduzir `pt-16` para `pt-10` | Ferramenta visual em monitor largo | `projects-library.tsx`, `projects/page.tsx`, `[slug]/page.tsx` | P |
| QW12 | **Código `VALIDATION`** em `AtlasErrorCode` para campos obrigatórios | Hoje validação vira `UNKNOWN` | `types.ts`, `validate-project-input.ts`, `generate/page.tsx (ERROR_HELP)` | P |
| QW13 | **Mover tipos soltos para `lib/types.ts`** (`DiffResult`, `ProjectSummary`) | Guard rail "fonte única" | `visual-diff.tsx`, `list-projects.ts` | P |
| QW14 | **Remover `videos/.tmp`** após mover o vídeo | Lixo acumulado | `capture-device.ts:340-354` | P |
| QW15 | **`start.bat` com `-H 127.0.0.1`** | `next dev` escuta na LAN; `DELETE /api/projects/*` fica exposto na rede | `start.bat` | P |
| QW16 | **Lembrar as últimas opções do formulário** (vídeo/seções) em `localStorage` | Menos cliques repetidos | `url-input.tsx` | P |

**Não incluídos de propósito** (não são quick wins, dependem de decisão): modelo de Referência,
mover biblioteca para fora de `public/`, índice, extensão, MCP. Estão no `MASTER_PLAN.md`.

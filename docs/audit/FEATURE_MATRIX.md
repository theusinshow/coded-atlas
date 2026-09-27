# Coded Atlas — Matriz de Features

Critério único: **isso me ajuda a criar sites melhores ou trabalhar mais rápido?**
Valor/Complexidade: Alto · Médio · Baixo. Prioridade: P0–P3 · Exp (experimental) · ✗ (não construir).

## Captura

| Feature | Existe | Estado | Valor | Complexidade | Prioridade | Recomendação |
|---|---|---|---|---|---|---|
| Screenshot viewport desktop/mobile | Sim | Sólido | Alto | — | — | Manter |
| Full page desktop/mobile | Sim | Sólido; PNG a 2×/3× é pesado | Alto | Baixa | P2 | Gravar WebP q90 para referências |
| Seções automáticas com nome | Sim | Sólido; não indexado | **Alto** | Baixa | **P0** | Cada seção vira referência atômica ("section explode") |
| Perfil de captura Rápido vs Completo | Não | Tudo roda sempre | Alto | Baixa | **P0** | Rápido = viewport + full page + seções, ~10 s |
| Colar imagem (Ctrl+V) / arrastar arquivo | Não | — | **Alto** | Baixa | **P0** | Caminho mais curto para qualquer origem (Win+Shift+S, Figma, vídeo) |
| Upload de vídeo (mp4/webm) com poster | Não | — | Médio | Baixa | P2 | Poster gerado no browser (canvas) — sem ffmpeg |
| Região selecionada | Não | — | Alto | Média | P1 | Via extensão (`captureVisibleTab` + crop) |
| Elemento DOM | Não | — | Alto | Média | P1 | Via extensão (picker) ou `locator.screenshot()` por seletor |
| Gravação de interação | Parcial | Só scroll automático | Médio | Alta | P3 | Aceitar vídeo gravado fora (OBS/Win+G) antes de construir gravador |
| GIF/preview animado | Não | — | Baixo | Média | P3 | `<video muted loop>` no hover resolve sem GIF |
| URL + domínio + título + favicon + data | Parcial | Sem título/favicon | Alto | Baixa | P1 | Extrair `document.title` + favicon na captura |
| Páginas extras do mesmo site | Sim | Ok | Médio | — | — | Manter (vitrine) |
| Estados por seletor CSS | Sim | UX técnica | Baixo | — | P3 | Manter para vitrine; referência usa extensão |
| Captura autenticada | Parcial | WIP só CLI | Médio | Baixa | P2 | Commitar; botão na UI; aplicar no diff |
| Extensão de navegador (Clipper) | Não | — | **Alto** | Média | P1 | Big bet #1 |
| Bookmarklet | Não | — | Baixo | Baixa | ✗ | Só manda URL → servidor recaptura sem o estado visto. Extensão supera |
| Clipboard watcher | Não | — | Baixo | Média | ✗ | Ruído e privacidade; Ctrl+V explícito basta |
| Share Target (PWA) | Não | — | Baixo | Média | ✗ | Uso é desktop-first |
| Captura desktop nativa (app) | Não | — | Baixo | Alta | ✗ | Win+Shift+S + Ctrl+V cobre |

## Biblioteca e organização

| Feature | Existe | Estado | Valor | Complexidade | Prioridade | Recomendação |
|---|---|---|---|---|---|---|
| Entidade Referência (unidade atômica) | Não | — | **Alto** | Média | **P0** | Fundação de tudo; ver FUTURE_ARCHITECTURE |
| Nota "por que salvei" | Não | — | **Alto** | Baixa | **P0** | Único campo pedido na captura |
| Tags livres | Não | — | Alto | Baixa | P1 | Com autocomplete |
| Tipo de seção (Hero, Navbar, Pricing…) | Parcial | Heurística existe, não é campo | Alto | Baixa | P1 | Faceta controlada, pré-preenchida pela heurística |
| Inbox ("capture first") | Não | — | Alto | Baixa | P1 | Estado `inbox` → `library` → `archived`; triagem por teclado |
| Projetos de cliente com slots por seção | Não | — | **Alto** | Média | P1 | Big bet #3 |
| Coleções genéricas | Não | — | Médio | Baixa | P2 | Projeto já cobre; coleção = projeto sem slots |
| Patterns (conhecimento) | Não | — | Médio | Baixa | P2 | Começar como "tag com página" (descrição, quando usar) — não entidade nova |
| Timeline | Não | — | Baixo | Baixa | P2 | Agrupar grid por mês ao ordenar por data — não é tela nova |
| Detecção de duplicatas (mesma URL) | Não | 3× a mesma URL nos dados | Médio | Baixa | P1 | Aviso na captura |
| Duplicatas visuais (hash perceptual) | Não | — | Baixo | Baixa | P3 | dHash via Sharp (9×8 cinza) |
| Ações em lote | Parcial | Só excluir/ZIP | Alto | Baixa | P1 | Tag, seção, projeto, arquivar, exportar |
| Importar pasta de screenshots | Não | — | Alto (migração) | Baixa | P1 | Traz as referências espalhadas em Downloads/pastas |
| Importar bookmarks/URLs | Não | — | Baixo | Média | P3 | Lista de URLs → fila de captura |
| Excluir com desfazer | Parcial | Confirmação inline | Médio | Baixa | P2 | Lixeira (move para `.trash/`) |

## Consulta e visualização

| Feature | Existe | Estado | Valor | Complexidade | Prioridade | Recomendação |
|---|---|---|---|---|---|---|
| Busca textual | Parcial | Só metadados de formulário | Alto | Baixa | P1 | Índice sobre título, domínio, nota, tags, seção, descrição |
| Filtros facetados | Parcial | Só categoria | Alto | Baixa | P1 | Seção, tag, domínio, tema claro/escuro, origem, projeto, data |
| Busca semântica | Não | — | Médio | Média | Exp | Primeiro: descrição textual indexada (80% do ganho, zero vetor) |
| Grid masonry com tamanho ajustável | Não | Grid 3 col fixo | Alto | Baixa | P1 | CSS columns; virtualizar acima de ~2k |
| Lista | Não | — | Baixo | Baixa | P3 | — |
| Quick Look (Espaço, ←/→) | Parcial | Lightbox isolado | Alto | Baixa | P1 | Global, com painel de metadados |
| Comparar lado a lado | Não | — | Médio | Baixa | P2 | 2–4 colunas, rolagem sincronizada |
| Moodboard / canvas livre | Não | — | Médio | **Alta** | ✗ agora / Exp | Vira clone de Figma. Project board com slots entrega 80% |
| Site map visual | Não | Páginas extras existem | Baixo | Média | P3 | Lista de páginas agrupada por domínio basta |
| Command palette | Sim | Só projetos + 4 ações | Alto | Baixa | P1 | Buscar referências e executar ações com atalho exibido |
| Atalhos de teclado | Parcial | Só Ctrl+K | Alto | Baixa | P1 | Ver UX_AUDIT §3 |

## Inteligência

| Feature | Existe | Estado | Valor | Complexidade | Prioridade | Recomendação |
|---|---|---|---|---|---|---|
| Inspeção paleta/fontes/stack | Sim | Amostragem rasa | Médio | Baixa | P2 | Amostrar por frequência/área |
| Design DNA determinístico (tokens do DOM) | Parcial | Semente em `inspect-site.ts` | Alto | Média | P2 | Big bet #5 |
| Auto-tagging | Não | — | Alto | Baixa* | P1 | *Via agente (Claude Code + MCP) — não embutir API no core |
| Descrição visual automática | Não | — | Alto | Baixa* | P1 | Idem; texto vai para o índice de busca |
| Pattern detection | Não | — | Médio | — | P2 | Tarefa do agente sobre um pack/seleção |
| Design breakdown | Não | — | Médio | — | P2 | Idem; DNA fornece dados objetivos |
| Similar in Atlas (visual) | Não | — | Médio | Média | Exp | Embeddings locais; sem vector DB até 50k |
| Ask Atlas (chat interno) | Não | — | Baixo | Alta | ✗ | Redundante com Claude Code + MCP |
| Project Inspiration (recomendar refs a um projeto) | Não | — | Médio | — | P2 | Filtros + agente via MCP |
| Design synthesis | Não | — | Alto | — | P1 | Pack + agente (o agente é o sintetizador) |

## Integração e saída

| Feature | Existe | Estado | Valor | Complexidade | Prioridade | Recomendação |
|---|---|---|---|---|---|---|
| Pack `DESIGN_REFERENCES.md` + imagens | Não | — | **Alto** | Baixa | **P1** | Big bet #3 (saída do projeto) |
| Copiar contexto (Markdown no clipboard) | Não | — | Alto | Baixa | P1 | Mesma função do pack, sem arquivos |
| Servidor MCP da biblioteca | Não | — | **Alto** | Média | P1 | Big bet #2 |
| ZIP | Sim | Ok | Médio | — | — | Manter |
| JSON/manifesto portfólio | Sim | Ok | Médio | — | — | Manter (vitrine) |
| Case draft MDX | Sim | Só lista imagens | Baixo | — | P3 | Manter; não investir |
| Composições redes / mockups / 3D | Sim | Rodam sempre | Médio (vitrine) | — | P2 | Tornar sob demanda |
| Diff visual / versionamento | Sim | Só último, sem histórico | Baixo (refs) / Médio (sites entregues) | — | P3 | Manter para sites próprios; não estender a referências |
| Sync multi-máquina / cloud | Não | — | Baixo agora | Alta | ✗ agora | Pasta da biblioteca em OneDrive/Syncthing + backup |

## Plataforma

| Feature | Existe | Estado | Valor | Complexidade | Prioridade | Recomendação |
|---|---|---|---|---|---|---|
| Biblioteca fora de `public/` + rota de assets | Não | Presa ao repo | Alto | Baixa | **P0** | Pré-requisito de backup, escala e `next start` |
| Pipeline fora do route handler | Não | Acoplado | Alto | Baixa | P1 | Pré-requisito de extensão/fila/CLI |
| Índice local (em memória → SQLite) | Não | Varre tudo por request | Alto em escala | Média | P1 | Ver FUTURE_ARCHITECTURE |
| Fila de captura | Não | Chromium por request | Médio | Baixa | P2 | 1 worker, N itens |
| Limpeza de pastas órfãs | Não | 5/14 órfãs | Médio | Baixa | P1 | Quick win |
| Cancelamento real | Não | Só cliente | Médio | Baixa | P2 | `req.signal` |
| Desktop app (Tauri/Electron) | Não | — | Baixo | Alta | ✗ | localhost + extensão resolvem |

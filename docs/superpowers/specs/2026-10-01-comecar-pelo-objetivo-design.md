# Atlas 3.3 — Começar pelo objetivo (design)

**Data:** 2026-10-01
**Status:** implementado em 2026-10-01 (ver "Desvios na implementação" no fim)
**Autorização:** o Matheus escolheu o caminho A ("começar pelo objetivo") e o fundo preto neutro em 2026-10-01.

## Problema

Testando o Atlas para produzir mídia de portfólio, o Matheus marcou quatro confusões:

1. não sabe por onde começar (a Visão geral sugere "Monte o case" por estado interno, não pelo objetivo dele);
2. opções demais em Criar (Peças, Media Kits, Case, Plano com IA, 11 composições, 5 formatos na mesma tela);
3. não acha o resultado (Entregar mistura 7 peças v1, "Criar pacote" só aparece com seleção, a pasta de destino não é mostrada);
4. nomes confusos (Assets, Composições curadas, Media Kit, Origens, Render).

Causa comum: o Atlas está organizado pelos conceitos do sistema, não pelo que o usuário quer fazer.

Além disso, o fundo verde-escuro (`#000F08`) deve virar preto neutro.

## Solução

Uma camada de UI orientada a objetivo sobre o motor existente. O motor (kits, captura, render, entrega) não muda de forma; ganha só duas operações de kit e uma ação de "abrir pasta".

### Tela Início do projeto (substitui a Visão geral em `/projects/[slug]`)

- **"O que você quer fazer?"** — quatro cartões:

  | Objetivo | Mapeia para |
  |---|---|
  | Portfólio / site | kit `portfolio-kit` |
  | Instagram | kit `social-kit` |
  | Lançamento | kit `launch-kit` |
  | Case / apresentação | editor de Case existente (`/projects/[slug]/cases`) |

  Se existir um kit desse preset ainda não gerado (`status` ≠ `rendered`), o cartão mostra "Continuar de onde parou" e abre esse kit em vez de criar outro.
- **"Seus arquivos"** — últimas entregas (`Export`) do projeto, cada uma com Baixar (ZIP) e Abrir pasta (quando houver pasta).
- A identidade visual e as origens continuam na página, abaixo, recolhidas.

### Navegação do projeto

`Início` + menu `Avançado` (Material, Criar, Entregar, Ajustes — mesmas URLs de hoje). Nada é removido.

### Caminho guiado: `/projects/[slug]/fazer/[goal]`

> Na implementação a URL ficou pelo objetivo (`/fazer/portfolio`) em vez do id do kit: assim o caminho começa mesmo sem captura e sem kit, e mostra sempre o kit mais recente daquele preset (ADR-050).

Uma página, quatro passos visíveis em sequência; o estado vem do kit e dos jobs, não de estado local.

1. **Material** — última captura ("Captura de 28/09 · 40 imagens"), botões **Usar esta** e **Capturar de novo** (perfil Completo, progresso via `JobFollower`). Sem captura, o passo é obrigatório.
2. **Peças** — itens do kit em cartões grandes com prévia. Ações: **Trocar visual**, **Tirar**, **Ajustar no Studio** (link para o editor existente).
3. **Gerar** — um botão (`enqueueKitRender`: PNG, vídeo ligado, qualidade final); progresso por peça.
4. **Pronto** — lista de arquivos, **Baixar tudo (.zip)**, **Salvar na pasta** (`requestPackage` com destino `download`/`folder`), **Abrir pasta** e o caminho da pasta por extenso com "copiar". No objetivo Instagram, **Mandar para o planejador Social**.

### Operações novas no motor (`src/modules/kits/kit-service.ts`)

- `swapKitItemVisual(kitId, itemId)` — só itens `kind: "composition"`: cria uma nova instância com a próxima composição da lista `compositions` do item no preset (circular), mesmo formato e direção do kit; atualiza o `instanceId` do item; kit volta a `ready` se estava `rendered`. Item sem alternativa → `DomainError`.
- `removeKitItem(kitId, itemId)` — remove o item; recusa remover o último (`items.min(1)`). Kit volta a `ready` se estava `rendered`.
- As duas recusam (`DomainError`) enquanto o kit está `rendering`.

### Abrir pasta

- Porta `FolderOpener` na infraestrutura; adaptador Windows executa `explorer.exe <caminho>`.
- Server action recebe só o `exportId`; o caminho vem do registro `Export` (`result.folder`), é resolvido contra `ATLAS_EXPORT_DIR` e precisa estar confinado nele (mesma regra do `FolderDestination`). Fora do Windows o botão não aparece; fica o caminho com "copiar".

### Textos (fora do modo Avançado)

Assets → Material; Composição → Visual; Render → Gerar; Media Kit → conjunto de peças. Em Entregar, as peças do v1 vão para uma seção recolhida "Peças antigas".

### Fundo preto neutro

Só a camada semântica de `app/globals.css` muda (as telas usam `bg-base`, `bg-surface`, `bg-surface-2`, `border-line`):

| Papel | Antes | Depois |
|---|---|---|
| `--color-base` | `#000F08` | `#0A0A0A` |
| `--color-surface` | `#070B08` | `#111111` |
| `--color-surface-2` | `#0A120C` | `#171717` |
| `--color-line` | `#1A2418` | `#2A2A2A` |
| `--color-line-soft` | `#111511` | `#1C1C1C` |

Os tokens de foundation `--color-cbm-*` mantêm os valores da marca. Off-white, cinzas, vermelho de sinal e fontes não mudam. As peças geradas (estilo "Coded by M", `src/core/creative/tokens.ts`) não mudam. Decisão registrada em ADR e em `DESIGN-SYSTEM.md`.

## Erros

- Captura/geração falhou: mensagem em português no próprio passo + "Tentar de novo"; não volta ao início.
- Falha parcial na geração: as peças prontas seguem para o passo 4; a que falhou aparece marcada.

## Fora do escopo

Objetivo "Vídeo" separado (vídeo já vem nos kits), objetivos configuráveis pela UI, mudanças em Social/Portfólio/Studio além do fundo, integração com o site da Coded by M.

## Testes

- Vitest: `swapKitItemVisual` (circular, sem alternativa, item não-composição, kit renderizado volta a `ready`), `removeKitItem` (último item recusado), confinamento do "abrir pasta" (caminho fora da raiz, `..`, junction).
- `npm run e2e`: passo novo — objetivo Portfólio → Gerar → arquivos na pasta.
- Prints desktop 1440 e celular 390 das telas novas e das principais com o fundo novo.

## Ordem

1. Fundo preto. 2. Operações de kit. 3. Abrir pasta. 4. Início + navegação. 5. Caminho `/fazer`. 6. Textos e "Peças antigas". 7. Verificação, `BUILD-PLAN.md`, `CURRENT.md`, commit.

## Desvios na implementação

- URL por objetivo (`/fazer/portfolio`), não por kit — o caminho começa sem captura/kit e sempre mostra o kit mais recente do preset.
- "Seus arquivos" lista os kits gerados (ZIP direto + "Abrir pasta" quando houver entrega em pasta), não só os registros `Export`: quem só baixou o ZIP também acha os arquivos ali.
- "Trocar visual" usa primeiro as alternativas do preset e depois qualquer composição que aceite o formato (com o material completo), para não ficar só com duas opções.
- O passo Material não tem botão "Usar esta": com material, ele já conta como feito; o botão é só "Capturar de novo".
- "Abrir pasta" virou capacidade do `FolderDestination` (`locate`, `canReveal`, `reveal` com opener injetável), não uma porta `FolderOpener` separada.
- Falha parcial: a geração é um job só; se ele falha, o passo 3 mostra o erro e "Tentar de novo". Peças que não puderam ser montadas aparecem no passo 2 com o motivo.
- Studio e editores avançados continuam dizendo "Renderizar".

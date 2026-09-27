# Coded Atlas — Arquitetura Futura

> Evolução incremental. Nada aqui exige reescrever a engine de captura, trocar de framework ou
> sair do local-first. Ao ser aceito, o conteúdo relevante migra para `docs/architecture.md` (que
> continua sendo a fonte da verdade) e os tipos para `lib/types.ts`.

---

## 1. Arquitetura atual (resumo)

```txt
UI (Next App Router) ──POST SSE──► app/api/generate/route.ts  ← ORQUESTRA o pipeline inteiro
                                        │
                                        ▼
                                  lib/capture/*  (Playwright + Sharp)
                                        │
                                        ▼
                     public/generated/<slug>/{catalog.json, screenshots/, ...}
                                        ▲
         listProjects(): readdir + JSON.parse de TODOS os catalog.json por request
```

## 2. Gargalos

| Gargalo | Por que importa | Quando dói |
|---|---|---|
| Assets presos em `public/` | Não serve arquivos criados após `next build`; biblioteca dentro do repo; `ATLAS_OUTPUT_DIR` externo quebra a UI | Já (modo produção, backup, sync) |
| Pipeline dentro do route handler | Extensão, importação, fila e MCP não conseguem reusar a captura sem HTTP/SSE | Assim que houver 2ª porta de entrada |
| Unidade = site, pasta sobrescrita | Não existe referência atômica; recaptura destrói histórico | Já |
| Listagem O(n) com parse completo | ~1k catálogos ≈ centenas de ms; 10k ≈ segundos | > 2–5k itens |
| Sem fila | 2 capturas = 2 Chromium; importação em massa derruba a máquina | Importação / extensão |
| Peso por captura (~18 MB) | PNG 2×/3× full page + vídeo | > 1k capturas (≈ 18 GB) |

## 3. Arquitetura recomendada

```txt
                 ┌─────────── Portas de entrada ────────────┐
   UI (Ctrl+V, drop, URL)   Extensão (Clipper)   Import pasta   MCP (annotate)
                 └──────────────┬───────────────────────────┘
                                ▼
                    lib/ingest/*   (serviço — sem HTTP, sem React)
                    ├─ ingestImage(buffer, meta)     → Referência
                    ├─ ingestUrl(url, profile)        → Captura + N Referências (Section Explode)
                    └─ queue (1 worker Chromium, em memória, globalThis)
                                │
                     lib/capture/* (engine atual, intacta)
                                │
                                ▼
          lib/library/*   ← ÚNICO módulo que toca o disco da biblioteca
          ├─ store: escreve pasta da referência + meta.json (atômico: tmp + rename)
          ├─ index: índice derivado (Estágio A: memória · Estágio B: node:sqlite + FTS5)
          └─ assets: resolve id → arquivo; rota app/files/[...path]/route.ts serve com cache
                                │
                                ▼
            ATLAS_LIBRARY_DIR (padrão: ~/CodedAtlas; fora do repo)
```

### 3.1 Layout em disco (arquivos são a verdade)

```txt
<ATLAS_LIBRARY_DIR>/
├─ refs/2026/09/<id>/            id = ULID (ordenável por tempo)
│  ├─ meta.json                  Referência (contrato em lib/types.ts)
│  ├─ original.webp|png|mp4      o que foi capturado/colado
│  ├─ preview.webp               ≤ 1600 px (Quick Look, MCP, pack)
│  └─ thumb.webp                 480 px de largura (grid)
├─ captures/<id>/                captura de URL (substitui public/generated/<slug>)
│  ├─ capture.json               ≈ Catalog atual + refIds gerados
│  └─ screenshots/ …             mesma estrutura de hoje
├─ projects/<id>.json            projeto de cliente (slots, estados, notas)
├─ showcases/<slug>/             vitrine (catálogo atual, inalterado)
├─ .trash/                       exclusão com desfazer
└─ .index/                       cache reconstruível (nunca fonte da verdade)
```

**Por que sidecar JSON + índice derivado:** qualquer pasta pode ser copiada, sincronizada ou
restaurada; um índice corrompido é apagado e reconstruído (`atlas reindex`); migrar de índice em
memória para SQLite **não é migração de dados**, só troca de cache.

### 3.2 Contrato proposto (a entrar em `lib/types.ts`)

```ts
export type SectionKind =
  | "hero" | "navbar" | "footer" | "cta" | "features" | "pricing" | "testimonials"
  | "cases" | "about" | "contact" | "faq" | "logos" | "stats" | "gallery" | "blog"
  | "dashboard" | "sidebar" | "cards" | "form" | "table" | "modal" | "typography"
  | "motion" | "microinteraction" | "page" | "unknown";

export interface Reference {
  id: string;                         // ULID
  status: "inbox" | "library" | "archived";
  kind: "section" | "page" | "region" | "element" | "image" | "video";
  origin: "url-capture" | "paste" | "upload" | "extension" | "import";
  note?: string;                      // "por que salvei" — o campo mais importante
  section?: SectionKind;
  tags: string[];
  description?: string;               // manual ou escrita pelo agente via MCP
  source?: { url: string; domain: string; title?: string; favicon?: string; viewport?: string };
  captureId?: string;                 // se veio de Section Explode
  asset: { original: string; preview: string; thumb: string; width: number; height: number;
           mime: string; bytes: number; sha256: string; dhash?: string; poster?: string };
  colors?: string[];                  // dominantes (Sharp .stats())
  theme?: "light" | "dark";
  dna?: DesignDNA;                    // Big bet #5
  projectIds: string[];
  createdAt: string; updatedAt: string;
}
```

Caminhos em `asset.*` são **relativos à biblioteca** e servidos como `/files/...` — o guard rail
"nenhum caminho absoluto no JSON nem na UI" continua valendo.

### 3.3 Índice: dois estágios

| | Estágio A — em memória | Estágio B — `node:sqlite` |
|---|---|---|
| Quando | até ~10k referências | > 10k, ou quando filtros relacionais ficarem complexos |
| Como | no boot, lê todos os `meta.json` (10k × ~2 KB ≈ 20 MB, < 1 s em SSD) e mantém `Map` + índice invertido de texto em `globalThis`; atualiza incrementalmente em cada escrita | `.index/atlas.db` com tabelas `refs`, `ref_tags`, `ref_projects` e `refs_fts` (FTS5) |
| Dependências | nenhuma (ou `minisearch`, ~30 KB) | nenhuma — Node 24 traz `node:sqlite` (confirmar FTS5 no build; fallback `better-sqlite3`) |
| Guard rail "sem banco" | respeitado | exige revisar o guard rail 7 do `CLAUDE.md` |

**Recomendação:** começar pelo Estágio A. É suficiente para anos de uso de uma pessoa, não
adiciona dependência nativa no Windows e mantém o guard rail. O Estágio B é uma troca de
implementação atrás da mesma interface `lib/library/index.ts`.

### 3.4 Performance por escala

| Referências | Disco (perfil Rápido ≈ 1,2 MB/ref) | Grid | Busca | Observação |
|---|---|---|---|---|
| 100 | ~120 MB | trivial | trivial | — |
| 1.000 | ~1,2 GB | lazy loading de `thumb` basta | índice A < 5 ms | hoje seriam ~18 GB |
| 10.000 | ~12 GB | **virtualizar** (janela de ~200 cards) + paginação por cursor | índice A ok; boot ~1 s | revisar Estágio B |
| 50.000 | ~60 GB | virtualização + thumbs em sprite/AVIF opcional | **Estágio B** | disco externo via `ATLAS_LIBRARY_DIR`; nada muda no código |

Regras de peso: grid só carrega `thumb.webp` (~25–40 KB); Quick Look carrega `preview.webp`;
`original` só no zoom 1:1/download. Full page salvo como WebP q90 (limite de 16383 px de
altura do WebP → fatiar em tiles acima disso). Vídeo: manter original + `poster.webp`, tocar só
no hover/abertura. `Cache-Control: immutable` na rota `/files` (arquivos nunca mudam de conteúdo
no mesmo caminho).

### 3.5 Inteligência (camada opcional, fora do núcleo)

1. **Padrão: via agente (MCP).** O Atlas expõe leitura + `annotate`; o Claude Code descreve,
   taggeia e sintetiza. Zero IA no app.
2. **Opcional: auto-tag na ingestão por API** (`ATLAS_AI_PROVIDER` vazio = desligado). Modelo
   visual barato (ex.: Claude Haiku 4.5) com saída JSON restrita ao vocabulário `SectionKind` +
   tags. Roda na fila, nunca bloqueia a captura.
3. **Experimental: similaridade visual.** Embeddings locais (CLIP via `@huggingface/transformers`
   ONNX, CPU) gravados em `.index/embeddings.f32`; busca por força bruta (50k × 512 floats ≈ 100 MB,
   < 50 ms). **Sem vector DB** até que isso deixe de ser verdade. dHash (Sharp) cobre duplicatas.

## 4. Mudanças incrementais (ordem)

1. `lib/library/paths.ts` + rota `app/files/[...path]/route.ts` servindo `ATLAS_LIBRARY_DIR`
   (com guarda de traversal). Catálogos atuais continuam em `public/generated` e passam a ser
   servidos também pela rota → `next start` e diretório externo funcionam.
2. Extrair `runCapturePipeline(input, onProgress, signal)` de `route.ts` para
   `lib/capture/capture-project.ts` (o que o `architecture.md` já especifica). Route vira adaptador SSE.
3. `Reference` em `lib/types.ts` + `lib/library/store.ts` + índice A.
4. `lib/ingest/*` + fila; `POST /api/references` (imagem ou URL).
5. Migração **não destrutiva**: script que lê `public/generated/*/catalog.json` e cria
   referências para cada seção (Section Explode retroativo), apontando para os arquivos existentes
   ou copiando-os. Nada é apagado.
6. Servidor MCP em `mcp/` (processo separado, importa `lib/library` — somente leitura + annotate).

## 5. O que NÃO vale mudar

- **Next.js / React / Tailwind** — funcionam, e o time é uma pessoa.
- **Playwright + Sharp** — a engine é o melhor ativo do projeto.
- **SSE para progresso** — continua certo para captura por URL.
- **Local-first, sem login, sem cloud** — correto para o usuário.
- **Catálogo/vitrine e seu formato** — vira um modo; não reescrever.
- **Não adotar** Supabase/Postgres, vector DB, Redux/Zustand (estado de UI cabe em URL params +
  React), Electron/Tauri, Rust. Nenhum resolve um problema presente.

## 6. Sync, backup e múltiplos computadores

| Opção | Prós | Contras | Veredito |
|---|---|---|---|
| Pasta da biblioteca em OneDrive/Dropbox | Zero código; backup automático | Conflito se duas máquinas escreverem ao mesmo tempo; SQLite em pasta sincronizada é arriscado | **Recomendado** com Estágio A (só JSON + imagens) e uma máquina "escritora" por vez |
| Syncthing | P2P, sem nuvem, rápido | Mesmo problema de concorrência | Alternativa |
| Git LFS | Histórico | Péssimo para dezenas de GB binários | ✗ |
| Backend próprio / cloud | Multi-dispositivo real | Contraria local-first; custo; login | ✗ até existir mais de um usuário |

Sidecar-como-verdade é o que torna o sync de pasta viável: conflitos afetam no máximo um
`meta.json`, e o índice é reconstruído localmente em cada máquina (`.index/` fora do sync).

# Coded Atlas — Visão de Produto

> Proposta resultante da auditoria de 2026-09-27. **Não substitui `docs/product.md` até ser
> aceita.** Aceitar esta visão implica revisar `product.md`, `design.md`, `architecture.md` e o
> guard rail 7 do `CLAUDE.md` ("nada de banco… no MVP") — o MVP acabou; o guard rail precisa de
> uma versão pós-MVP.

---

## Problema

Um web designer vê dezenas de interfaces boas por semana. O que fica disso:

- prints soltos em Downloads, WhatsApp, Discord, Notion, abas abertas;
- sem a URL de origem, sem o porquê, sem a seção;
- impossível de reencontrar quando o projeto certo aparece;
- e, quando reencontrado, precisa ser re-explicado do zero para o Claude Code/Codex.

O custo real não é guardar — é **reencontrar e transformar em decisão** no momento em que um
projeto começa. Hoje esse custo é pago em memória do designer.

## Usuário

**Matheus / Coded by M.** Designer-desenvolvedor, solo, desktop Windows, cria sites
institucionais, landing pages, portfólios e SaaS próprios. Implementa com Claude Code e Codex.
Critério de gosto alto (premium, escuro, técnico). Usuários futuros são irrelevantes para as
decisões de agora — otimizar para um usuário exigente é o que torna uma ferramenta boa para outros.

## Job to be Done

> **Quando** começo (ou destravo) a seção de um site,
> **quero** puxar as referências certas que já vi, com o motivo pelo qual as guardei,
> **para** decidir a direção rápido e passar isso ao agente que implementa — sem copiar ninguém.

Job secundário (já atendido): **quando** entrego um site, **quero** o pacote de apresentação
pronto para o portfólio.

## Proposta de valor

**Tudo que você viu de bom, encontrável em segundos, e pronto para virar briefing do seu agente.**

Três promessas verificáveis:

1. **Guardar custa menos de 5 segundos** (atalho → recorte → 1 frase opcional).
2. **Reencontrar custa menos de 10 segundos** (filtro de seção + texto).
3. **Levar ao Claude Code custa 1 ação** (pack/MCP com imagens, notas e restrições).

## Core Loop

O ciclo proposto na missão (DISCOVER → CAPTURE → UNDERSTAND → ORGANIZE → COMPARE → SYNTHESIZE →
APPLY) tem dois defeitos: é **linear demais** (supõe que cada referência passa por 7 etapas) e
põe **organizar como trabalho do usuário**. Na prática existem **dois loops com frequências
diferentes**, ligados pela biblioteca:

```txt
LOOP DE COLETA (diário, segundos)            LOOP DE PROJETO (por cliente, horas)

  VER ─► GUARDAR ─► [auto] CLASSIFICAR          PUXAR ─► CURAR ─► ENTREGAR AO AGENTE
          │  +1 frase     domínio, título,        ▲  filtros,  slots por    DESIGN_REFERENCES.md
          │  "por quê"    seção, cores, data      │  sugestões seção,       ou MCP
          ▼                                        │           aceitar/     │
       ┌──────────────── BIBLIOTECA ──────────────┘           rejeitar     ▼
       │                                                                 IMPLEMENTAR (Claude Code)
       └─◄──────────── MOSTRAR: o site entregue vira Catálogo ◄──────────┘
                        (vitrine) e referência própria
```

- **Guardar** é o único passo humano obrigatório da coleta. Classificar é automático (heurística
  hoje; agente opcional depois). Triagem do Inbox é rápida e opcional.
- **Comparar e sintetizar** não são etapas próprias: acontecem dentro de **Curar**, só quando
  existe um projeto real. Sintetizar é trabalho do agente.
- **Mostrar** fecha o ciclo e reaproveita todo o motor de vitrine já construído.

## Princípios

1. **Capturar primeiro, organizar nunca (ou depois).** Nada obrigatório além da imagem.
2. **O porquê vale mais que a imagem.** A nota é o campo mais importante do produto.
3. **Arquivos são a verdade; índice é cache.** Cada referência é uma pasta legível
   (imagem + `meta.json`). Qualquer banco/índice é reconstruível a partir dos arquivos.
4. **Local-first.** Rápido, privado, offline, grátis. Sync é problema de pasta, não de servidor.
5. **Determinístico no núcleo; inteligência plugável.** O Atlas não depende de IA para funcionar.
   A IA entra pelo agente que o usuário já usa (MCP/pack) ou como opção desligável.
6. **Teclado primeiro, mouse sempre.** Toda ação tem atalho e aparece na paleta.
7. **A imagem é a interface.** Chrome mínimo, densidade alta, zero decoração.
8. **Referência não é cópia.** Todo pack para agente carrega o que *não* copiar.

## Diferenciais

Não é Eagle (gerenciador genérico de arquivos), nem Mobbin (biblioteca curada de terceiros), nem
Are.na (rede social de blocos), nem Pinterest (feed). O que só o Atlas faz:

1. **Entende a estrutura do site, não só o pixel.** Captura por URL fatiada em seções nomeadas,
   com tokens reais do DOM (tipografia, cores, raio, sombras) — dado objetivo, não chute.
2. **Termina no agente de código.** A saída natural é um briefing estruturado para Claude
   Code/Codex, não um moodboard para olhar.
3. **Mesmo motor para entrada e saída.** A ferramenta que guarda referências é a mesma que gera o
   portfólio dos sites entregues — o próprio trabalho vira referência.

## O que o Atlas NÃO deve virar

- **Um Figma.** Sem canvas livre, sem edição de imagem, sem camadas.
- **Um chat.** Sem "Ask Atlas" interno — o Claude Code é o chat; o Atlas é a memória dele.
- **Um SaaS.** Sem login, multiusuário, cloud, planos — enquanto o usuário for um.
- **Um sistema de arquivos para administrar.** Se o Inbox cresce sem parar, a culpa é do
  produto (classificação automática insuficiente), não do usuário.
- **Um monitor de sites.** Diff visual serve aos sites que *eu* entreguei; não estender a
  referências de terceiros.
- **Um coletor compulsivo.** Métrica de sucesso é referência *usada em projeto*, não
  referência guardada.

## Métricas de sucesso (pessoais, verificáveis no próprio disco)

- Referências guardadas por semana (meta: o Atlas substitui o Win+Shift+S → Downloads).
- % de referências com nota (meta: > 60%).
- Referências vinculadas a projetos (meta: todo projeto novo começa com um board no Atlas).
- Tempo mediano de captura (meta: < 5 s pela extensão, < 15 s por URL).

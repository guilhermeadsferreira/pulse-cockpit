# Pulse Cockpit — Revisao Extensiva

## What This Is

Pulse Cockpit e um app desktop (Electron + React) para gestores de tecnologia que transforma transcricoes e anotacoes de cerimonias (1:1s, dailies, plannings, retros) num sistema vivo de inteligencia sobre pessoas. O nucleo (V1), qualidade de ingestao (V2) e inteligencia externa Jira/GitHub (V3) estao em producao. Este milestone foca em curadoria e qualidade: refinar prompts, pipeline, metricas e UX a partir de uma revisao extensiva que identificou 101 gaps (66 ja corrigidos, 35 pendentes).

## Core Value

Garantir que toda informacao coletada pelo pipeline seja de alta qualidade, acionavel e visivel para o gestor.

## Requirements

### Validated

- ✓ People Registry: CRUD com config.yaml por pessoa — v1
- ✓ Inbox + Pipeline de ingestao two-pass (Pass 1 sem perfil, Pass 2 com perfil) — v1
- ✓ Perfil Vivo: escrita, atualizacao e migracao automatica de schema — v1
- ✓ Action Loop: actions.yaml estruturado com rastreamento de acoes comprometidas — v1
- ✓ Pauta de 1:1 sob demanda com contexto acumulado — v1
- ✓ Pauta com o gestor (roll-up do time com saude dos liderados) — v1
- ✓ Relatorio de Ciclo com flag de promovibilidade e evidencias — v1
- ✓ Dashboard + Painel de Riscos do Time — v1
- ✓ Modulo "Eu": demandas do gestor, ciclo pessoal, autoavaliacao — v1
- ✓ Pass de 1:1 profundo: follow-ups, compromissos tacitos, insights, correlacoes — v2
- ✓ Pass de Cerimonia refinado: skills com evidencia, cruzamento com perfil — v2
- ✓ External Intelligence: Jira + GitHub metrics, CrossAnalyzer, relatorios — v3
- ✓ PDI como cidadao de primeira classe na UI — revisao R4
- ✓ Dados externos em aba dedicada com historico — revisao R4
- ✓ SinceLastMeetingCard: mudancas desde ultimo 1:1 — revisao R4
- ✓ PromptConstants compartilhados entre prompts — revisao R2
- ✓ Sentimentos como array contextual — revisao R2
- ✓ Thresholds calibraveis por nivel/cargo — revisao R3
- ✓ Insights positivos no CrossAnalyzer — revisao R3
- ✓ Trend indicators nos relatorios — revisao R3
- ✓ Loops de retroalimentacao corrigidos (6 pontos) — revisao R1

### Active

<!-- 35 tasks pendentes da revisao extensiva, organizadas por prioridade -->

**Alta prioridade — Prompt Refinements (17 tasks):**
- [ ] Ingestion: campo `pessoas_esperadas_ausentes` para cerimonias
- [ ] Ingestion: early stagnation detection nos primeiros 3 meses
- [ ] 1on1-deep: tendencia emocional requer 2+ entradas para "deteriorando"
- [ ] Cerimonia: participacao minima diferenciada por tipo (daily/planning/retro)
- [ ] Cerimonia: saude calibrada por cargo/nivel
- [ ] Compression: harmonizar definicao de "ponto resolvido"
- [ ] Compression: conquistas preservam titulo + outcome
- [ ] Cycle: linha_do_tempo flexivel (5-10 eventos)
- [ ] Cycle: expectativas benchmarked por cargo
- [ ] Cycle: evidencias de promovibilidade nunca triviais
- [ ] Autoavaliacao: valores calibrados por cargo
- [ ] Autoavaliacao: desafios reconhecidos como campo
- [ ] Gemini: mode detection por conteudo (nao filename)
- [ ] Gemini: emotional content em full mode
- [ ] Gemini: speaker identification confidence
- [ ] Gestor-ciclo: decisao = trade-off explicito
- [ ] Gestor-ciclo: aprendizado obrigatorio (min 1)

**Alta prioridade — Pipeline & Schema (3 tasks):**
- [ ] Temas: deduplicacao fuzzy (substring/keyword merge)
- [ ] Health history: cleanup automatico (manter ultimas 50 entradas)
- [ ] External data IPC: retorno com JSON tipado (nao regex)

**Media prioridade — GitHub Metrics + CrossAnalyzer (7 tasks):**
- [ ] Code review depth (avgCommentsPerReview, turnaround)
- [ ] Collaboration score (co-authors, cross-team)
- [ ] Test coverage trend per PR
- [ ] CrossAnalyzer: campo causa_raiz nos insights
- [ ] CrossAnalyzer: desalinhamento checado contra contexto (ferias, licenca)
- [ ] Relatorios: narrative context paragraph do perfil
- [ ] Relatorios: baseline comparison pessoal (media 3 meses)

**Baixa prioridade — Action System + UX Avancado (8 tasks):**
- [ ] Sync bidirecional acoes <> Jira (auto-fechar quando issue Done)
- [ ] Insights cross-team (padroes em multiplos perfis)
- [ ] Risk panel para pares e gestores (nao so liderados)
- [ ] Escalation: acao vencida do gestor gera follow-up para liderado
- [ ] Action audit trail: statusHistory[]
- [ ] Prioridade de acoes atualizada pelo deep pass
- [ ] Evidence aggregation para PDI
- [ ] Agenda generation agendada (pre-1:1 automatico)

### Out of Scope

- Features novas nao mapeadas na revisao extensiva — foco e curadoria, nao expansao
- Entidade Projeto (projetos/{slug}) — requer novo modelo de dados
- Integracao MCP com Slack — requer novo adapter de ingestao
- API Anthropic ou SDK direto — decisao arquitetural: sempre Claude Code CLI
- Testes automatizados — abordagem defensiva, validacao via uso real

## Context

**Estado atual (2026-03-31):** Branch `feat/v3-external-refinements`. Revisao extensiva identificou 101 tasks em 10 secoes (R1-R10). 66 tasks concluidas, 35 pendentes. O app esta em producao com dados reais de liderados no iCloud.

**Referencia de tasks:** `tasks/PLANO_REVISAO_EXTENSIVA.md` e `tasks/backlog.md` (secoes R1-R10 com criterios de aceite detalhados).

**Arquitetura:** Electron (Main Process + Renderer React). IA via `child_process.spawn('claude', ['-p', prompt])`. Workspace em disco (Markdown + YAML) sincronizado com iCloud Drive.

**Cobertura de testes:** Zero. Qualidade garantida por revisao manual e uso real. Mudancas cirurgicas, nao refatoracoes amplas.

## Constraints

- **Producao:** App em uso real com dados irreversiveis — nenhuma operacao destrutiva sem confirmacao
- **Tech stack:** Electron + React + TypeScript — nao mudar sem PDR
- **IA:** Exclusivamente Claude Code CLI (`claude -p`) — nunca SDK/API
- **Dados:** Workspace em disco (Markdown + YAML) — sem banco de dados
- **Schema:** Mudancas em perfil.md devem ser aditivas; nunca remover campos sem migration
- **Sem testes:** Zero coverage — priorizar mudancas cirurgicas

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Migrar tracking de pm-agent para GSD | Centralizar gestao de projeto num unico sistema (GSD) em vez de manter pm-agent + tasks/ em paralelo | -- Pending |
| Priorizar prompt refinements sobre metricas avancadas | Prompts afetam qualidade de TODA ingestao; metricas avancadas sao aditivas | -- Pending |
| Manter tasks/ como referencia historica | backlog.md e done.md contem criterios de aceite detalhados uteis durante implementacao | -- Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-31 after initialization (Revisao Extensiva milestone)*

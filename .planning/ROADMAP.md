# Roadmap: Pulse Cockpit — Revisao Extensiva

## Overview

Este milestone fecha os 35 gaps remanescentes da revisao extensiva (de 101 identificados, 66 ja corrigidos). O trabalho e cirurgico: refinar prompts que afetam toda ingestao, corrigir pipeline e schema, adicionar metricas GitHub avancadas no CrossAnalyzer, e entregar o action system e UX avancados. Cada fase e independente e entregavel — o gestor sente o impacto desde a Phase 1.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Prompt Refinements** - Refinar os 17 prompts de ingestao, 1:1 deep, cerimonia, compression, cycle, autoavaliacao e Gemini (completed 2026-03-31)
- [ ] **Phase 2: Pipeline & Schema** - Corrigir deduplicacao de temas, cleanup de health history e IPC tipado
- [ ] **Phase 3: GitHub Metrics & CrossAnalyzer** - Adicionar metricas de code review, colaboracao e test coverage; enriquecer CrossAnalyzer e relatorios
- [ ] **Phase 4: Action System & UX Avancado** - Sync Jira bidirecional, audit trail, escalation, PDI evidence aggregation e insights cross-team

## Phase Details

### Phase 1: Prompt Refinements
**Goal**: Todo artefato gerado pelo pipeline reflete calibracao por cargo/nivel, evidencias nao triviais e deteccao precoce de problemas
**Depends on**: Nothing (first phase)
**Requirements**: PRMT-01, PRMT-02, PRMT-03, PRMT-04, PRMT-05, PRMT-06, PRMT-07, PRMT-08, PRMT-09, PRMT-10, PRMT-11, PRMT-12, PRMT-13, PRMT-14, PRMT-15, PRMT-16, PRMT-17
**Success Criteria** (what must be TRUE):
  1. Ao ingerir uma cerimonia, o pipeline registra ausencias esperadas (campo `pessoas_esperadas_ausentes`) e detecta stagnation precoce nos primeiros 3 meses
  2. O perfil de um Staff silencioso numa cerimonia nao recebe o mesmo alerta de participacao que um Junior — saude calibrada por cargo/nivel
  3. Ao comprimir historico, conquistas mantêm o formato "titulo — outcome" e pontos resolvidos usam definicao unica (strikethrough ou contradicao por evidencia)
  4. O relatorio de ciclo gera linha_do_tempo com 5-10 eventos significativos, expectativas benchmarked por cargo e evidencias de promovibilidade com comportamento observado concreto
  5. O modo do Gemini e determinado pelo conteudo (num_speakers), captura conteudo emocional em full mode e registra confidence de speaker identification como metadata
**Plans**: 5 plans

Plans:
- [x] 01-01-PLAN.md — Auditar/confirmar PRMT-01 a PRMT-07 (ingestion, 1on1-deep, cerimonia-sinal, compression)
- [x] 01-02-PLAN.md — Auditar PRMT-08, PRMT-09 e implementar PRMT-10 (cycle.prompt.ts)
- [x] 01-03-PLAN.md — Implementar PRMT-11, PRMT-12 (autoavaliacao.prompt.ts)
- [x] 01-04-PLAN.md — Implementar PRMT-13, PRMT-14, PRMT-15 (gemini-preprocessing.prompt.ts)
- [x] 01-05-PLAN.md — Implementar PRMT-16, PRMT-17 (gestor-ciclo.prompt.ts)

### Phase 2: Pipeline & Schema
**Goal**: O pipeline persiste dados sem duplicatas, mantem health history enxuto e retorna dados externos com tipagem segura
**Depends on**: Phase 1
**Requirements**: PIPE-01, PIPE-02, PIPE-03
**Success Criteria** (what must be TRUE):
  1. Temas semanticamente equivalentes (substring/keyword match) sao mesclados automaticamente antes de persistir no perfil — sem duplicatas visiveis na UI
  2. O arquivo health history nunca ultrapassa 50 entradas ativas; entradas mais antigas sao comprimidas automaticamente sem perda de tendencia
  3. Dados externos (Jira, GitHub) chegam ao frontend como JSON tipado, eliminando parsing regex fragil no renderer
**Plans**: 2 plans

Plans:
- [x] 02-01-PLAN.md — Fuzzy theme dedup + health history auto-compression (PIPE-01, PIPE-02)
- [x] 02-02-PLAN.md — Typed external data IPC with validation (PIPE-03)

### Phase 3: GitHub Metrics & CrossAnalyzer
**Goal**: O gestor ve metricas de qualidade de code review, colaboracao e cobertura de testes, com insights do CrossAnalyzer contextualizados e relatorios com narrativa e baseline pessoal
**Depends on**: Phase 2
**Requirements**: MTRC-01, MTRC-02, MTRC-03, MTRC-04, MTRC-05, MTRC-06, MTRC-07
**Success Criteria** (what must be TRUE):
  1. A aba de dados externos exibe avgCommentsPerReview, turnaround de primeira review, approval rate, collaboration score e % de PRs com mudancas de teste — com trend historico
  2. Insights do CrossAnalyzer incluem campo `causa_raiz` (awaiting review / changes requested / stale) e checam ausencias/ferias do perfil antes de flaggar desalinhamento
  3. Relatorios externos incluem um paragrafo de contexto narrativo injetado do perfil e uma comparacao com a media pessoal dos ultimos 3 meses
**Plans**: 3 plans

Plans:
- [x] 03-01-PLAN.md — Estender GitHubClient e GitHubMetrics com metricas avancadas (MTRC-01, MTRC-02, MTRC-03)
- [x] 03-02-PLAN.md — Enriquecer CrossAnalyzer com causa_raiz e checagem de ausencia (MTRC-04, MTRC-05)
- [x] 03-03-PLAN.md — Narrativa, baseline 3 meses nos relatorios e novas metricas na UI (MTRC-06, MTRC-07)

### Phase 4: Action System & UX Avancado
**Goal**: Acoes se sincronizam com Jira, tem historico auditavel e prioridade automatica; o gestor ve insights cross-team e pauta pre-1:1 gerada automaticamente
**Depends on**: Phase 3
**Requirements**: ACTN-01, ACTN-02, ACTN-03, ACTN-04, ACTN-05, UX-01, UX-02, UX-03
**Success Criteria** (what must be TRUE):
  1. Uma issue fechada no Jira fecha automaticamente a acao correspondente no app sem intervencao manual
  2. Cada acao tem array `statusHistory[]` auditavel e sua prioridade e atualizada automaticamente pelo deep pass quando novo contexto surge
  3. O Dashboard exibe padroes detectados em multiplos perfis (insights cross-team) e o risk panel mostra pares e gestores alem de liderados
  4. A pauta de 1:1 e gerada automaticamente N dias antes do proximo encontro sem o gestor precisar acionar manualmente
**Plans**: 5 plans
**UI hint**: yes

Plans:
- [ ] 04-01-PLAN.md — Audit trail (statusHistory[]) + sync bidirecional Jira (ACTN-03, ACTN-01)
- [ ] 04-02-PLAN.md — Escalation de acoes gestor + prioridade via deep pass (ACTN-02, ACTN-04)
- [ ] 04-03-PLAN.md — Evidence aggregation para PDI (ACTN-05)
- [ ] 04-04-PLAN.md — Cross-team insights + risk panel estendido (UX-01, UX-02)
- [ ] 04-05-PLAN.md — Agenda generation agendada pre-1:1 (UX-03)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Prompt Refinements | 5/5 | Complete | 2026-03-31 |
| 2. Pipeline & Schema | 2/2 | Complete | 2026-03-31 |
| 3. GitHub Metrics & CrossAnalyzer | 3/3 | Complete | 2026-03-31 |
| 4. Action System & UX Avancado | 5/5 | Complete | 2026-04-01 |

---

## Backlog

### Phase 999.2: Módulo Mentor AI (BACKLOG)

**Goal:** IA de apoio ao gestor para tirar dúvidas sobre gestão, com contexto do projeto e dos liderados. Aproveitar prompt já existente (localização a confirmar).
**Requirements:** TBD
**Plans:** 0 plans
**Note:** Prompt base já existe — recuperar e referenciar antes de planejar.

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.5: Visibilidade do board de sustentação por pessoa

**Goal:** Módulo standalone de Sustentação no app — tela própria na sidebar, visão do board Jira de suporte com métricas de volume, SLA breach e análise de IA. Insumos fluem para o metricas.md das pessoas por assignee.
**Requirements:** SUST-01, SUST-02, SUST-03, SUST-04, SUST-05
**Plans:** 6/6 plans complete

Plans:
- [x] 999.5-01-PLAN.md — Contratos de tipos: SupportBoardSnapshot, AppSettings campos, ViewName (SUST-01, SUST-02)
- [x] 999.5-02-PLAN.md — SupportBoardClient: fetch board Jira, SLA breach, comentários (SUST-01)
- [x] 999.5-03-PLAN.md — SettingsView: campos de configuração do board de sustentação (SUST-02)
- [x] 999.5-04-PLAN.md — IPC handlers sustentacao:get-data e sustentacao:refresh + preload (SUST-01, SUST-03)
- [x] 999.5-05-PLAN.md — SustentacaoView + Sidebar + App.tsx wiring (SUST-04)
- [x] 999.5-06-PLAN.md — Prompt de IA + MetricsWriter.writeSustentacaoAnalysis + IPC run-analysis (SUST-03, SUST-05)

### Phase 999.6: Dashboard de métricas do time — Git + Jira (BACKLOG)

**Goal:** Dashboard com visão geral do time e drill-down por pessoa, consolidando métricas de Git e Jira: qualidade de PRs (comentários, feedbacks recorrentes), tempo até merge, saúde das entregas (cycle time, blockers), saúde do time (workload balance, burndown) e desempenho individual. Duas perspectivas: visão time (agregada) e visão pessoa (detalhada).
**Requirements:** TBD
**Plans:** 0 plans
**Note:** Parte dos dados já existe no GitHubMetrics e JiraMetrics — falta a camada de agregação por time e a UI de dashboard.

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.7: Perfil vivo sensibilizado pelo daily report (BACKLOG)

**Goal:** Os report generators (Daily, Weekly, Sprint, Monthly) persistem dados estruturados em metricas.md por pessoa, criando retrato quantitativo rastreavel que complementa o perfil qualitativo
**Depends on**: Nothing (independent backlog)
**Requirements:** MTRW-01, MTRW-02, MTRW-03, MTRW-04, MTRW-05, MTRW-06
**Plans:** 2/2 plans complete

Plans:
- [x] 999.7-01-PLAN.md — MetricsWriter + integracao Daily e Weekly (MTRW-01, MTRW-02, MTRW-03, MTRW-04)
- [x] 999.7-02-PLAN.md — Integracao Sprint e Monthly (MTRW-05, MTRW-06)

### Phase 999.8: Visão de PRs abertas com status de revisão (BACKLOG)

**Goal:** Painel mostrando todas as PRs abertas do time com: tempo aberta, status de revisão (sem revisão / aguardando correção / aprovada aguardando merge), quem é o autor, quem revisou (ou não). O gestor identifica rapidamente PRs travadas — sem review há X dias, ou com changes requested sem resposta — e pode agir antes de virar bloqueio.
**Requirements:** TBD
**Plans:** 0 plans
**Note:** GitHubClient já busca PRs. Falta: (1) tracking de estado de review por PR, (2) cálculo de aging, (3) UI de listagem com filtros. Pode ser parte do dashboard 999.6 ou view independente.

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.9: Pipeline Health & Flow Metrics no Daily Report

**Goal:** O daily report mostra saúde do pipeline por fase (Dev, CR, QA, Ready to Deploy) com tempo médio atual vs baseline histórico, distingue fila vs trabalho ativo (To Do CR vs CR), identifica gargalos automaticamente, e reduz ruído das seções de baixo valor.
**Depends on**: Nothing (independent backlog)
**Requirements:** PLHF-01, PLHF-02, PLHF-03, PLHF-04, PLHF-05, PLHF-06, PLHF-07
**Plans:** 2 plans

Plans:
- [ ] 999.9-01-PLAN.md — categorizeStatus refinado + Pipeline Health section com baseline (PLHF-01, PLHF-02, PLHF-03, PLHF-04)
- [ ] 999.9-02-PLAN.md — Compactar commits + enriquecer Haiku com pipeline data (PLHF-05, PLHF-06, PLHF-07)

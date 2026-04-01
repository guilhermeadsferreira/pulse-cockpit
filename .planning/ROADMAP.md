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

### Phase 999.1: Resumo de 1:1 no estilo Qulture Rocks (BACKLOG)

**Goal:** Após a ingestão de um 1:1, gerar um resumo estruturado no estilo Qulture Rocks — com o que foi discutido, compromissos assumidos (por responsável) e próximos passos — e exibi-lo no card do artefato na PersonView com botão de cópia.
**Requirements:** QR-01
**Plans:** 1/1 plans complete

Plans:
- [ ] 999.1-PLAN.md — Refinamento do prompt resumo_executivo_rh + bloco QR no ArtifactCard

### Phase 999.2: Módulo Mentor AI (BACKLOG)

**Goal:** IA de apoio ao gestor para tirar dúvidas sobre gestão, com contexto do projeto e dos liderados. Aproveitar prompt já existente (localização a confirmar).
**Requirements:** TBD
**Plans:** 0 plans
**Note:** Prompt base já existe — recuperar e referenciar antes de planejar.

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

### Phase 999.3: Performance de Ingestão + Modelo Híbrido (BACKLOG)

**Goal:** Reduzir a latência do pipeline de ingestão via modelo híbrido por estágios: Estágio 1 = Pass Cerimônia via OpenRouter (modelo leve); Estágio 2 (futuro) = Pass 1 se Estágio 1 confirmar viabilidade.
**Requirements:** PERF-01
**Plans:** 3/3 plans complete

Plans:
- [x] 999.3-01-PLAN.md — Fundação híbrida: AppSettings com openRouterApiKey/useHybridModel + runOpenRouterPrompt no ClaudeRunner
- [x] 999.3-02-PLAN.md — Rota condicional no Pass Cerimônia (IngestionPipeline) com fallback para Claude CLI
- [x] 999.3-03-PLAN.md — UI: campo de API key + toggle na SettingsView

### Phase 999.4: OpenRouter Estágio 2 — Pass 1 com modelo leve (BACKLOG)

**Goal:** Migrar o Pass 1 (identificação de pessoa_principal e metadados básicos) para OpenRouter quando o modelo híbrido estiver ativo. Pass mais simples do pipeline — sem contexto de perfil, output estruturado básico — e com maior multiplicador de latência por rodar em todo artefato. Padrão já estabelecido no Pass Cerimônia (roteamento condicional + fallback para Claude CLI).
**Requirements:** PERF-01
**Plans:** 1/1 plans complete

Plans:
- [x] 999.4-01-PLAN.md — Rota híbrida no Pass 1: runOpenRouterPrompt com system prompt + roteamento condicional em processItem

# Requirements: Pulse Cockpit — Revisao Extensiva

**Defined:** 2026-03-31
**Core Value:** Garantir que toda informacao coletada pelo pipeline seja de alta qualidade, acionavel e visivel para o gestor.

## v1 Requirements

Requirements para este milestone. Cada um mapeia para phases do roadmap.

### Prompt Refinements — Ingestion

- [x] **PRMT-01**: Pipeline detecta `pessoas_esperadas_ausentes` em cerimonias (planning/retro/daily)
- [x] **PRMT-02**: Pipeline detecta early stagnation nos primeiros 3 meses (janela minima explicita)

### Prompt Refinements — 1on1 Deep

- [x] **PRMT-03**: Tendencia emocional "deteriorando" requer evidencia de 2+ entradas de 1:1 no historico

### Prompt Refinements — Cerimonia

- [x] **PRMT-04**: Participacao minima diferenciada por tipo de cerimonia (daily/planning/retro/review)
- [x] **PRMT-05**: Saude calibrada por cargo/nivel (Staff silencioso != Junior silencioso)

### Prompt Refinements — Compression

- [x] **PRMT-06**: Definicao unica e harmonizada de "ponto resolvido" (strikethrough + contradicao por evidencia)
- [x] **PRMT-07**: Conquistas preservam formato "titulo — outcome" na compressao

### Prompt Refinements — Cycle

- [x] **PRMT-08**: `linha_do_tempo` flexivel (5-10 eventos, IA decide densidade por significancia)
- [x] **PRMT-09**: Expectativas benchmarked por cargo/nivel
- [x] **PRMT-10**: Evidencias de promovibilidade nunca triviais — gaps com comportamento observado

### Prompt Refinements — Autoavaliacao

- [x] **PRMT-11**: Valores calibrados por tipo de role (manager vs IC)
- [x] **PRMT-12**: Desafios reconhecidos como campo obrigatorio quando ha evidencia

### Prompt Refinements — Gemini

- [x] **PRMT-13**: Mode detection por conteudo (num_speakers), nao por filename
- [x] **PRMT-14**: Emotional content (frustacao, excitacao) capturado em full mode
- [x] **PRMT-15**: Speaker identification confidence (alta/media/baixa) como metadata

### Prompt Refinements — Gestor Ciclo

- [x] **PRMT-16**: Decisao exige trade-off explicito ou rejeicao de alternativa
- [x] **PRMT-17**: Aprendizado obrigatorio (minimo 1 por ciclo)

### Pipeline & Schema

- [x] **PIPE-01**: Temas deduplicados via fuzzy matching (substring/keyword merge) antes de persistir
- [x] **PIPE-02**: Health history com cleanup automatico (manter ultimas 50 entradas, comprimir anteriores)
- [x] **PIPE-03**: External data IPC retorna JSON tipado em vez de parsing regex no frontend

### GitHub Metrics & CrossAnalyzer

- [x] **MTRC-01**: Code review depth: avgCommentsPerReview, turnaround de primeira review, approval rate
- [x] **MTRC-02**: Collaboration score (0-100): co-authored commits, PRs cross-repo, mentions em issues
- [x] **MTRC-03**: Test coverage trend: % de PRs com mudancas de teste, trend historico
- [ ] **MTRC-04**: CrossAnalyzer inclui campo `causa_raiz` nos insights (awaiting review vs changes vs stale)
- [ ] **MTRC-05**: Desalinhamento checado contra contexto do perfil (ferias, licenca) antes de flaggar
- [ ] **MTRC-06**: Relatorios incluem narrative context paragraph injetado do perfil
- [ ] **MTRC-07**: Relatorios incluem baseline comparison pessoal (media dos ultimos 3 meses)

### Action System Avancado

- [ ] **ACTN-01**: Sync bidirecional acoes <> Jira: issue fechada no Jira auto-fecha acao no app
- [ ] **ACTN-02**: Escalation: acao vencida do gestor gera follow-up automatico para liderado
- [ ] **ACTN-03**: Action audit trail: array `statusHistory[]` com status, date, source
- [ ] **ACTN-04**: Prioridade de acoes atualizada automaticamente pelo deep pass
- [ ] **ACTN-05**: Evidence aggregation: multiplos artefatos acumulam evidencias para mesmo objetivo PDI

### UX Avancado

- [ ] **UX-01**: Insights cross-team: padroes detectados em multiplos perfis exibidos no Dashboard
- [ ] **UX-02**: Risk panel estendido para pares e gestores (nao apenas liderados)
- [ ] **UX-03**: Agenda generation agendada: pauta gerada automaticamente N dias antes do proximo 1:1

## v2 Requirements

Nao ha v2 neste milestone — todas as tasks identificadas estao no escopo v1.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Features novas fora da revisao | Foco e curadoria e qualidade, nao expansao |
| Entidade Projeto | Requer novo modelo de dados — milestone futuro |
| Integracao MCP Slack | Requer novo adapter de ingestao |
| Testes automatizados | Abordagem defensiva via uso real |
| API Anthropic / SDK | Decisao arquitetural: sempre Claude Code CLI |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PRMT-01 | Phase 1 | Complete |
| PRMT-02 | Phase 1 | Complete |
| PRMT-03 | Phase 1 | Complete |
| PRMT-04 | Phase 1 | Complete |
| PRMT-05 | Phase 1 | Complete |
| PRMT-06 | Phase 1 | Complete |
| PRMT-07 | Phase 1 | Complete |
| PRMT-08 | Phase 1 | Complete |
| PRMT-09 | Phase 1 | Complete |
| PRMT-10 | Phase 1 | Complete |
| PRMT-11 | Phase 1 | Complete |
| PRMT-12 | Phase 1 | Complete |
| PRMT-13 | Phase 1 | Complete |
| PRMT-14 | Phase 1 | Complete |
| PRMT-15 | Phase 1 | Complete |
| PRMT-16 | Phase 1 | Complete |
| PRMT-17 | Phase 1 | Complete |
| PIPE-01 | Phase 2 | Complete |
| PIPE-02 | Phase 2 | Complete |
| PIPE-03 | Phase 2 | Complete |
| MTRC-01 | Phase 3 | Complete |
| MTRC-02 | Phase 3 | Complete |
| MTRC-03 | Phase 3 | Complete |
| MTRC-04 | Phase 3 | Pending |
| MTRC-05 | Phase 3 | Pending |
| MTRC-06 | Phase 3 | Pending |
| MTRC-07 | Phase 3 | Pending |
| ACTN-01 | Phase 4 | Pending |
| ACTN-02 | Phase 4 | Pending |
| ACTN-03 | Phase 4 | Pending |
| ACTN-04 | Phase 4 | Pending |
| ACTN-05 | Phase 4 | Pending |
| UX-01 | Phase 4 | Pending |
| UX-02 | Phase 4 | Pending |
| UX-03 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 35 total
- Mapped to phases: 35
- Unmapped: 0

---
*Requirements defined: 2026-03-31*
*Last updated: 2026-03-31 after roadmap creation*

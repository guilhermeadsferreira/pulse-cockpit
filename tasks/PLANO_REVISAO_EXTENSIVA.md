# Plano de Execução — Revisão Extensiva do Pulse Cockpit

> Documento de referência para sessão de planejamento.
> Gerado em: 2026-03-31
> Base: 112 findings → 74 tasks (6 concluídas, 68 pendentes) em 10 seções (R1–R10)

---

## Contexto

Em 2026-03-31 foi realizada uma revisão extensiva do Pulse Cockpit cobrindo:
- **9 prompts** (ingestion, 1on1-deep, cerimônia, agenda, cycle, compression, autoavaliação, gemini, gestor-ciclo)
- **Pipeline completo** de ingestão (6 passes) e retroalimentação do perfil vivo
- **Dados externos** (Jira + GitHub): métricas, CrossAnalyzer, relatórios
- **Action system** e tracking de PDI
- **UX do gestor** (dashboard, cockpit, pauta, ciclo)

### O que já foi corrigido (R1 — 6 tasks):
- PDI update persistido no config.yaml
- Insights sem truncamento na pauta
- External data no 1:1 deep pass
- Tendência emocional visível na UI
- Demandas do gestor no cockpit da pessoa
- Resumo executivo RH acessível

### O que foi criado como infra de curadoria:
- `SystemAuditor` — verificações determinísticas (7 categorias, score 0-100)
- View "Auditoria" na sidebar com findings filtráveis

---

## Inventário de Tasks Pendentes (68 tasks)

### R2 — Prompts: Issues Estruturais (6 tasks)
| Task | Resumo | Impacto |
|------|--------|---------|
| T-R2.1 | PromptConstants.ts — enums compartilhados, confiança por tipo | Consistência cross-prompt |
| T-R2.2 | Sentimento como array contextual | Sinais emocionais mais ricos |
| T-R2.3 | Frequência em pontos de atenção | Gestor sabe se é pattern |
| T-R2.4 | Auto-percepção do liderado | Calibrar abordagem de coaching |
| T-R2.5 | Promovibilidade condicional no ciclo | 70% dos casos reais |
| T-R2.6 | Limite de alertas + reconhecimentos recentes | Anti alert-fatigue |

### R3 — Métricas Externas: Segurança e Qualidade (5 tasks)
| Task | Resumo | Impacto |
|------|--------|---------|
| T-R3.1 | Remover/disclaimerizar padraoHorario | Risco ético/legal |
| T-R3.2 | Trend indicators nos relatórios | Snapshot → tendência |
| T-R3.3 | Thresholds por nível/cargo | Evitar falsos positivos |
| T-R3.4 | Insights positivos no CrossAnalyzer | Equilibrar detecção |
| T-R3.5 | Caveat em contagens brutas | Evitar gaming |

### R4 — UX do Gestor (4 tasks)
| Task | Resumo | Impacto |
|------|--------|---------|
| T-R4.1 | PDI cidadão de primeira classe | Central p/ gestão de pessoas |
| T-R4.2 | Dados externos proeminentes | Visibilidade de métricas |
| T-R4.3 | "O que mudou desde última 1:1" | Prep rápido de 1:1 |
| T-R4.4 | Narrativa do resumo preservada | Contexto longitudinal |

### R5 — Silos de Dados (3 tasks)
| Task | Resumo | Impacto |
|------|--------|---------|
| T-R5.1 | Snapshots mês-a-mês com comparação | Tendência multi-mês |
| T-R5.2 | Sync bidirecional ações ↔ Jira | Ações auto-fechadas |
| T-R5.3 | Insights cross-team | Visão sistêmica |

### R6 — Prompt Refinements Granulares (30 tasks)
| Task | Resumo | Prompt |
|------|--------|--------|
| T-R6.1 | pessoas_identificadas vs mencionadas | ingestion |
| T-R6.2 | pessoas_esperadas_ausentes | ingestion |
| T-R6.3 | temas_detectados vs temas_atualizados | ingestion |
| T-R6.4 | Early stagnation (0-3 meses) | ingestion |
| T-R6.5 | Profundidade de compreensão | ingestion |
| T-R6.6 | Follow-up patterns parciais | 1on1-deep |
| T-R6.7 | Correlações não abordadas (silêncio) | 1on1-deep |
| T-R6.8 | PDI drift detection | 1on1-deep |
| T-R6.9 | Tendência emocional requer 2+ 1:1s | 1on1-deep |
| T-R6.10 | Resumo RH sem dados sensíveis | 1on1-deep |
| T-R6.11 | Participação mínima por tipo cerimônia | cerimônia |
| T-R6.12 | Escuta ativa como soft skill | cerimônia |
| T-R6.13 | Feedback com atribuição completa | cerimônia |
| T-R6.14 | Saúde calibrada por cargo/nível | cerimônia |
| T-R6.15 | ciclos_sem_mencao → dias em aberto | agenda |
| T-R6.16 | temas vs follow-ups: distinção clara | agenda |
| T-R6.17 | linha_do_tempo flexível (5-10) | cycle |
| T-R6.18 | Expectativas benchmarked por cargo | cycle |
| T-R6.19 | Evidências nunca triviais | cycle |
| T-R6.20 | Definir "ponto resolvido" | compression |
| T-R6.21 | Conquistas: título + outcome | compression |
| T-R6.22 | Temas: vocabulário controlado max 8 | compression |
| T-R6.23 | Valores calibrados por cargo | autoavaliação |
| T-R6.24 | Desafios reconhecidos (campo) | autoavaliação |
| T-R6.25 | Gemini: mode por conteúdo | gemini |
| T-R6.26 | Gemini: emotional content em full mode | gemini |
| T-R6.27 | Gemini: speaker confidence | gemini |
| T-R6.28 | Gestor-ciclo: decisão = trade-off | gestor-ciclo |
| T-R6.29 | Gestor-ciclo: aprendizado obrigatório | gestor-ciclo |
| T-R6.30 | origem_pauta: 3 opções claras | 1on1-deep |

### R7 — Data Pipeline (5 tasks)
| Task | Resumo | Impacto |
|------|--------|---------|
| T-R7.1 | External data: timing pre-fetch | Dados frescos no deep pass |
| T-R7.2 | Demandas na pauta de 1:1 | Visibilidade bidirecional |
| T-R7.3 | Temas: deduplicação fuzzy | Evitar duplicatas |
| T-R7.4 | Health history: cleanup (max 50) | Perfil não cresce infinito |
| T-R7.5 | Frontmatter: log de mudanças de saúde | Audit trail |

### R8 — Métricas Avançadas (7 tasks)
| Task | Resumo | Impacto |
|------|--------|---------|
| T-R8.1 | Code review depth | Qualidade de review |
| T-R8.2 | Collaboration score | Mentoring/ajuda |
| T-R8.3 | Test coverage trend | Proxy de qualidade |
| T-R8.4 | CrossAnalyzer: root cause | Insight acionável |
| T-R8.5 | Desalinhamento com contexto | Menos falso-positivo |
| T-R8.6 | Relatórios: narrative context | WHY além do WHAT |
| T-R8.7 | Baseline comparison pessoal | Normalização |

### R9 — Action System Avançado (5 tasks)
| Task | Resumo | Impacto |
|------|--------|---------|
| T-R9.1 | Ação → artefato fonte (link) | Rastreabilidade |
| T-R9.2 | Escalation: dependência gestor→liderado | Accountability |
| T-R9.3 | Histórico de status (audit trail) | Transparência |
| T-R9.4 | Prioridade atualizada pelo deep pass | Ações inteligentes |
| T-R9.5 | Evidence aggregation para PDI | PDI com evidência |

### R10 — UX Gaps Restantes (9 tasks)
| Task | Resumo | Impacto |
|------|--------|---------|
| T-R10.1 | Dashboard: urgências do dia | Hábito diário |
| T-R10.2 | Risk panel para pares/gestores | Cobertura total |
| T-R10.3 | Stale data agregado | Alert bar |
| T-R10.4 | External data: parsing robusto | Robustez |
| T-R10.5 | Agenda generation agendada | Automação |
| T-R10.6 | Cycle report com defaults | Reduzir fricção |
| T-R10.7 | Contexto das ações visível | Informação hidden |
| T-R10.8 | Sprint refresh UI trigger | Feature fantasma |
| T-R10.9 | Batch reingest na UI | Reprocessamento |

---

## Referências

- **Tasks detalhadas:** `tasks/backlog.md` (seções R1–R10, com critérios de aceite)
- **Tasks concluídas:** `tasks/done.md` (seção "Revisão Extensiva")
- **System Auditor:** `src/main/audit/SystemAuditor.ts` (7 categorias de verificação)
- **UI Auditoria:** `src/renderer/src/views/AuditView.tsx` (score + findings)
- **Documentação PM:** `pm-agent/projects/pulse-cockpit/tasks/active.md`

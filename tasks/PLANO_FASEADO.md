# Plano de Execução Faseado — Revisão Extensiva

> Gerado em: 2026-03-31
> Base: 68 tasks pendentes (R2–R10) organizadas em 6 fases
> Referência: `tasks/PLANO_REVISAO_EXTENSIVA.md` (inventário completo)

---

## Fase 1: Ética, Privacidade e Fundação (8 tasks)

**Objetivo:** Eliminar riscos éticos/legais e criar infraestrutura que desbloqueia todas as fases seguintes.

**Por que primeiro:** padraoHorario é risco real de dano a pessoas. PromptConstants é pré-requisito de 30+ tasks de R6. Sem isso, nada escala.

| Task | Resumo | Justificativa |
|------|--------|---------------|
| T-R3.1 | Remover/disclaimerizar `padraoHorario` | Risco ético/legal |
| T-R3.5 | Caveat em contagens brutas (commits, PRs) | Incentiva gaming |
| T-R6.10 | Resumo RH sem dados sensíveis | Privacidade |
| T-R6.9 | Tendência emocional requer 2+ 1:1s | Safety |
| T-R2.1 | `PromptConstants.ts` — enums compartilhados | **Pré-req para toda R6** |
| T-R7.1 | External data timing: pré-buscar antes do deep pass | Dados frescos |
| T-R10.4 | External data: parsing robusto (JSON tipado) | Robustez |
| T-R7.5 | Frontmatter: log de transições de saúde | Audit trail |

**Estimativa:** 1 sessão longa ou 2 sessões médias
**Pré-requisitos:** Nenhum
**Entrega:** App ética e robustamente embasado, PromptConstants pronto para R6

---

## Fase 2: Enriquecimento de Sinal — Prompts Core (14 tasks)

**Objetivo:** Cada ingestão e 1:1 captura informação significativamente mais rica e precisa.

**Por que segundo:** Todo o valor do Pulse nasce nos prompts. Melhorar o que o sistema captura melhora tudo downstream.

| Task | Resumo | Prompt |
|------|--------|--------|
| T-R2.2 | Sentimento como array contextual | ingestion |
| T-R2.3 | Frequência em pontos de atenção | ingestion |
| T-R2.4 | Auto-percepção do liderado | 1on1-deep |
| T-R2.5 | Promovibilidade condicional no ciclo | cycle |
| T-R2.6 | Limite dinâmico de alertas + reconhecimentos recentes | agenda |
| T-R6.1 | `pessoas_identificadas` vs mencionadas | ingestion |
| T-R6.2 | `pessoas_esperadas_ausentes` | ingestion |
| T-R6.3 | `temas_detectados` vs `temas_atualizados` | ingestion |
| T-R6.4 | Early stagnation (0-3 meses) | ingestion |
| T-R6.5 | Profundidade de compreensão | ingestion |
| T-R6.6 | Follow-up patterns parciais (padrão de evasão) | 1on1-deep |
| T-R6.7 | Correlações não abordadas (sinais em silêncio) | 1on1-deep |
| T-R6.8 | PDI drift detection | 1on1-deep |
| T-R6.30 | `origem_pauta`: 3 opções claras | 1on1-deep |

**Estimativa:** 2-3 sessões
**Pré-requisitos:** Fase 1 (T-R2.1 PromptConstants)
**Entrega:** Ingestões e 1:1s geram perfis dramaticamente mais ricos

---

## Fase 3: Experiência Diária do Gestor (12 tasks)

**Objetivo:** Transformar o que o gestor vê e faz todos os dias — PDI visível, prep de 1:1 instantâneo, dashboard acionável.

**Por que terceiro:** Com sinais melhores (Fase 2), agora vale investir na UX.

| Task | Resumo | Área |
|------|--------|------|
| T-R4.1 | PDI como cidadão de primeira classe na UI | PersonView |
| T-R4.2 | Dados externos em posição proeminente | PersonView |
| T-R4.3 | "O que mudou desde a última 1:1?" | PersonView |
| T-R4.4 | Narrativa do resumo evolutivo preservada | ArtifactWriter |
| T-R10.1 | Dashboard: urgências do dia | DashboardView |
| T-R10.3 | Stale data agregado no dashboard | DashboardView |
| T-R10.7 | Contexto das ações visível na UI | PersonView |
| T-R9.1 | Ação → artefato fonte (link bidirecional) | Actions |
| T-R7.2 | Demandas do gestor na pauta de 1:1 | Agenda |
| T-R10.6 | Cycle report com defaults inteligentes | CycleView |
| T-R10.8 | Sprint refresh: botão na UI | RelatóriosView |
| T-R10.9 | Batch reingest exposto na UI | Settings |

**Estimativa:** 3-4 sessões
**Pré-requisitos:** Fase 2 parcial (ingestion + 1on1-deep concluídos)
**Entrega:** Rotina diária transformada

---

## Fase 4: Prompt Refinements — Wave 2 (16 tasks)

**Objetivo:** Completar os 30 refinements de R6 — cerimônia, agenda, cycle, compression, autoavaliação, gemini, gestor-ciclo.

**Por que quarto:** Refinamentos de qualidade. Gestor já sente diferença com Fases 2 e 3.

| Task | Resumo | Prompt |
|------|--------|--------|
| T-R6.11 | Participação mínima por tipo cerimônia | cerimônia |
| T-R6.12 | Escuta ativa como soft skill | cerimônia |
| T-R6.13 | Feedback com atribuição completa | cerimônia |
| T-R6.14 | Saúde calibrada por cargo/nível | cerimônia |
| T-R6.15 | `ciclos_sem_mencao` → dias em aberto | agenda |
| T-R6.16 | Temas vs follow-ups: distinção clara | agenda |
| T-R6.17 | `linha_do_tempo` flexível (5-10) | cycle |
| T-R6.18 | Expectativas benchmarked por cargo | cycle |
| T-R6.19 | Evidências nunca triviais | cycle |
| T-R6.20 | Definir "ponto resolvido" | compression |
| T-R6.21 | Conquistas: título + outcome | compression |
| T-R6.22 | Temas: vocabulário controlado max 8 | compression |
| T-R6.23 | Valores calibrados por cargo | autoavaliação |
| T-R6.24 | Desafios reconhecidos (campo) | autoavaliação |
| T-R6.25–27 | Gemini: mode/content/confidence (3 tasks) | gemini |
| T-R6.28–29 | Gestor-ciclo: trade-off + aprendizado obrigatório | gestor-ciclo |

**Estimativa:** 2-3 sessões
**Pré-requisitos:** Fase 1 (PromptConstants)
**Entrega:** Todos os 9 prompts refinados e consistentes

---

## Fase 5: Inteligência Cross-Team + Métricas Avançadas (15 tasks)

**Objetivo:** Visão sistêmica do time com métricas de profundidade.

| Task | Resumo | Área |
|------|--------|------|
| T-R3.2 | Trend indicators (↑↓→) nos relatórios | Relatórios |
| T-R3.3 | Thresholds calibráveis por nível/cargo | CrossAnalyzer |
| T-R3.4 | Insights positivos no CrossAnalyzer | CrossAnalyzer |
| T-R5.1 | Snapshots mês-a-mês com comparação | ExternalDataPass |
| T-R5.2 | Sync bidirecional ações ↔ Jira | ActionRegistry |
| T-R5.3 | Insights cross-team | PersonRegistry |
| T-R8.1 | Code review depth | GitHubMetrics |
| T-R8.2 | Collaboration score | GitHubMetrics |
| T-R8.3 | Test coverage trend per PR | GitHubMetrics |
| T-R8.4 | CrossAnalyzer: root cause | CrossAnalyzer |
| T-R8.5 | Desalinhamento com contexto | CrossAnalyzer |
| T-R8.6 | Relatórios: narrative context | Relatórios |
| T-R8.7 | Baseline comparison pessoal | Relatórios |
| T-R10.2 | Risk panel para pares/gestores | DashboardView |
| T-R7.4 | Health history: cleanup (max 50) | ArtifactWriter |

**Estimativa:** 3-4 sessões
**Pré-requisitos:** Fase 3 (dados externos proeminentes na UI)
**Entrega:** Visão de time + métricas que explicam o "porquê"

---

## Fase 6: Action System Inteligente + Automação (7 tasks)

**Objetivo:** Ações auto-gerenciadas com prioridade dinâmica, dependências e evidência.

| Task | Resumo | Área |
|------|--------|------|
| T-R9.2 | Escalation: dependência gestor → liderado | Actions |
| T-R9.3 | Histórico de status (audit trail) | Actions |
| T-R9.4 | Prioridade atualizada pelo deep pass | Actions + Prompt |
| T-R9.5 | Evidence aggregation para PDI | Actions + PDI |
| T-R7.3 | Temas: deduplicação fuzzy | Pipeline |
| T-R10.5 | Agenda generation agendada (pré-1:1) | Scheduler |

**Estimativa:** 2 sessões
**Pré-requisitos:** Fase 3 (PDI primeira classe), Fase 4 (prompts refinados)
**Entrega:** Ações inteligentes, agendamento automático

---

## Sequência e Paralelismo

```
Fase 1 (8)  →  Fase 2 (14)  →  Fase 3 (12)  →  Fase 4 (16)  →  Fase 5 (15)  →  Fase 6 (7)
 Ética &        Sinal           UX Diária       Prompts         Cross-Team      Actions &
 Fundação       Enriquecido     Transformada     Polidos         + Métricas      Automação
```

- Fases 2 e 4 podem rodar parcialmente em paralelo (prompts diferentes)
- Fase 3 pode começar quando Fase 2 tiver ingestion + 1on1-deep concluídos
- Fases 5 e 6 são independentes entre si

## Critério de transição

- Fase N está "pronta" quando todas as tasks passam seus critérios de aceite (ver `tasks/backlog.md`)
- Ao concluir task: mover para `tasks/done.md` com data e resultado

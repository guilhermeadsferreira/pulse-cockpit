# Active — Pulse Cockpit

> Última atualização: 2026-03-31

## R4 — UX do Gestor ✅ (2026-03-31)

- [x] T-R4.2 — Dados externos em aba dedicada "Dados Ext." + ExternalTab + IPC getHistorico + tabela histórico mensal
- [x] T-R4.3 — SinceLastMeetingCard: artefatos/ações/saúde desde último 1:1 no topo do Perfil
- [x] T-R4.1 — PDI: seção no PersonFormView (add/edit/remove), PDISection no PersonView (progress bar + badges), pdi_aderencia no cycle.prompt, pdi_objetivo_ref em Action
- [x] T-R4.4 — Narrativa do resumo evolutivo preservada (ProfileCompressor agora passa resumosAnteriores para buildCompressionPrompt)

## R3 — Métricas Externas: Segurança e Qualidade ✅ (2026-03-31)

- [x] T-R3.1 — padraoHorario N/A — nunca implementado no código; risco ético mitigado por omissão
- [x] T-R3.2 — Trend indicators (↑↓→) nos relatórios (WeeklyReportGenerator, MonthlyReportGenerator, SprintReportGenerator)
- [x] T-R3.3 — Thresholds calibráveis por nivel/cargo (CrossAnalyzer + ExternalDataPass)
- [x] T-R3.4 — Insights positivos no CrossAnalyzer (tipo `destaque`, analyzeHighlights, cor verde na UI)
- [x] T-R3.5 — Caveat em contagens brutas (UI já tinha; caveat adicionado em agenda.prompt.ts; cycle.prompt.ts já tinha)

## R2 — Qualidade dos Prompts ✅ (2026-03-31)

- [x] T-R2.1 — PromptConstants com enums compartilhados (CONFIANCA_POR_TIPO_TEXTO, NECESSITA_1ON1_REGRA usados em ingestion + cerimônia)
- [x] T-R2.2 — sentimentos como array {valor, aspecto} (IngestionAIResult, CerimoniaSinalResult, SchemaValidator, ArtifactWriter, ipc.ts)
- [x] T-R2.3 — frequencia em pontos_de_atencao (PontoAtencao{texto,frequencia}, badge [recorrente], normalizer atualizado)
- [x] T-R2.4 — auto_percepcao do liderado no 1:1 deep pass (OneOnOneResult, prompt, persist como insight)
- [x] T-R2.5 — flag_promovibilidade condicionado_a (CycleAIResult, prompt, renderCycleMarkdown)
- [x] T-R2.6 — limite dinâmico de alertas na pauta (max 3 + outros_alertas, reconhecimentos 14d→30d→vazio)

---

## Wave 1 — Prompt Refinements (em andamento)

### 1a — ingestion.prompt.ts
- [ ] T-R6.2 — `pessoas_esperadas_ausentes`: novo campo no prompt + IngestionAIResult
- [ ] T-R6.4 — Early stagnation 0-3 meses: instrução explícita de janela mínima

### 1b — 1on1-deep.prompt.ts + IngestionPipeline
- [ ] T-R6.9 — Guard tendência "deteriorando": requer 2+ entradas de 1:1 no histórico

### 1c — cerimonia-sinal.prompt.ts
- [ ] T-R6.11 — Participação mínima por tipo de cerimônia (daily / planning / retro / review)
- [ ] T-R6.14 — Saúde calibrada por cargo/nível

### 1d — compression.prompt.ts
- [ ] T-R6.20 — Harmonizar definição de "ponto resolvido" (duas abordagens → uma)
- [ ] T-R6.21 — Conquistas: formato obrigatório "título — outcome"

### 1e — Prompts restantes (cycle, autoavaliação, gemini, gestor-ciclo)
- [ ] T-R6.17 — `linha_do_tempo` flexível (5-10 itens)
- [ ] T-R6.18 — Expectativas benchmarked por cargo
- [ ] T-R6.19 — Evidências nunca triviais
- [ ] T-R6.23 — Valores calibrados por cargo (autoavaliação)
- [ ] T-R6.24 — Desafios reconhecidos como campo (autoavaliação)
- [ ] T-R6.25 — Gemini: mode por conteúdo
- [ ] T-R6.26 — Gemini: emotional content em full mode
- [ ] T-R6.27 — Gemini: speaker confidence
- [ ] T-R6.28 — Gestor-ciclo: decisão = trade-off explícito
- [ ] T-R6.29 — Gestor-ciclo: aprendizado obrigatório

---

## Wave 2 — Pipeline e Schema

- [ ] T-R7.3 — Temas: deduplicação fuzzy (substring/keyword merge)
- [ ] T-R7.4 — Health history cleanup: manter últimas 50 entradas
- [ ] T-R10.4 — External data IPC: validação de schema no retorno

---

## Wave 3 — GitHub Metrics + CrossAnalyzer

- [ ] T-R8.1 — Code review depth (avgCommentsPerReview, expertiseSignals)
- [ ] T-R8.2 — Collaboration score (0-100)
- [ ] T-R8.3 — Test coverage trend per PR
- [ ] T-R8.4 — CrossAnalyzer: campo `causa_raiz` nos insights
- [ ] T-R8.5 — Desalinhamento perfil vs dados externos
- [ ] T-R8.6 — Relatórios: narrative context paragraph
- [ ] T-R8.7 — Baseline comparison pessoal (últimos 3 meses)

---

## Wave 4 — UX Avançado + Action System + Pipeline

- [ ] T-R10.2 — Risk panel para pares e gestores
- [ ] T-R9.2 — Escalation: ação vencida do gestor → follow-up para liderado
- [ ] T-R9.3 — Action audit trail: `statusHistory[]`
- [ ] T-R9.4 — Prioridade de ações atualizada pelo deep pass
- [ ] T-R9.5 — Evidence aggregation para PDI
- [ ] T-R5.2 — Sync bidirecional ações ↔ Jira
- [ ] T-R5.3 — Insights cross-team (padrões em múltiplos perfis)
- [ ] T-R10.5 — Agenda generation agendada (pré-1:1 automático)

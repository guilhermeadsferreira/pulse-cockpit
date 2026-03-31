# Roadmap: V3 — External Intelligence

**Milestone:** V3 — Inteligência Externa e Análise Cruzada
**Created:** 2026-03-30
**Granularity:** Fine
**Coverage:** 15/15 requirements mapped

---

## Visão Geral

O Pulse Cockpit hoje processa textos humanos (transcripts, notas, feedbacks).
A V3 adiciona dados objetivos do dia-a-dia do time — Jira, GitHub — e os cruza
com o perfil existente para gerar insights que nenhum dos dois tem isoladamente.

**Modelo: Enriquecimento + Expansão**

```
  ENRIQUECER O QUE JÁ EXISTE         CRIAR O QUE NÃO EXISTE
  ├── perfil.md (seção externa)      ├── Daily Report
  ├── agenda.prompt (lastro)         ├── Sprint Report
  ├── cycle.prompt (evidência)       ├── RelatóriosView
  ├── autoavaliação (impacto)        └── Demandas automáticas
  ├── dashboard (risco com fatos)
  └── agenda-gestor (métricas time)
```

---

## Phases

- [ ] **Phase 4: Settings + Identity** — Config de API (Jira/GitHub) na
      SettingsView + mapeamento de identidade externa no config.yaml
- [ ] **Phase 5: External Clients** — JiraClient, GitHubClient,
      JiraMetrics, GitHubMetrics
- [ ] **Phase 6: Cross-Analysis Pass** — ExternalDataPass no pipeline,
      CrossAnalyzer, Scheduler, demandas automáticas
- [ ] **Phase 7: Reports** — DailyReportGenerator, SprintReportGenerator
- [ ] **Phase 8: UI Integration** — RelatóriosView, PersonView (Dados
      Externos), Dashboard (triggers), Sidebar, prompts

---

## Phase Details

### Phase 4: Settings + Identity

**Goal:** Gestor configura tokens de Jira e GitHub na SettingsView e mapeia
cada liderado para suas identidades externas (jiraEmail, githubUsername).

**Depends on:** Nothing
**Requirements:** EXT-01, EXT-02

#### Plans

1. **EXT-01: AppSettings + SettingsView** — Estender AppSettings com campos
   Jira (jiraBaseUrl, jiraEmail, jiraApiToken, jiraProjectKey, jiraBoardId,
   jiraEnabled) e GitHub (githubToken, githubOrg, githubRepos[], githubEnabled).
   Adicionar duas seções na SettingsView com toggles de ativação. Campos
   sensíveis com type=password. Toggle desabilitado quando token ausente.

2. **EXT-02: PersonConfig + PersonFormView** — Estender PersonConfig com
   jiraEmail? e githubUsername?. Adicionar seção "Identidade Externa" na
   PersonFormView. Campos opcionais.

**Verification:**
- SettingsView exibe seções "Jira" e "GitHub" com campos corretos
- Campos salvam em ~/.pulsecockpit/settings.json
- PersonFormView exibe campos de identidade externa
- config.yaml contém jiraEmail e githubUsername após preenchimento
- Toggle desabilitado quando token ausente

### Phase 5: External Clients

**Goal:** Clientes HTTP para Jira e GitHub com autenticação, rate limiting
e transformação de dados brutos em métricas estruturadas por pessoa.

**Depends on:** Phase 4
**Requirements:** EXT-03, EXT-04, EXT-05, EXT-06

#### Plans

1. **EXT-03: JiraClient** — Autenticação Basic Auth (email + API token).
   Métodos: searchIssuesByEmail, getCurrentSprint, getSprintIssues,
   getDailyStandupData. Rate limit 100 req/min com backoff exponencial.
   Timeout 15s por request.

2. **EXT-04: JiraMetrics** — Transformação em JiraPersonMetrics:
   issuesAbertas, issuesFechadasSprint, storyPointsSprint, workloadScore,
   bugsAtivos, blockersAtivos, tempoMedioCicloDias, distribuicaoPorTipo,
   distribuicaoPorStatus, sprintAtual.

3. **EXT-05: GitHubClient** — Autenticação via PAT fine-grained, @octokit/rest.
   Métodos: getPRsByUser, getCommitsByUser, getReviewsByUser, getTeamActivity.
   Rate limit 5000 req/hour.

4. **EXT-06: GitHubMetrics** — Transformação em GitHubPersonMetrics:
   prsAbertos, prsMerged30d, tempoMedioAbertoDias, tempoMedioReviewDias,
   prsRevisados, commits30d, commitsPorSemana, padraoHorario, tamanhoMedioPR.

**Verification:**
- Com token válido, JiraClient.searchIssuesByEmail retorna issues
- Com token válido, GitHubClient.getPRsByUser retorna PRs
- Métricas retornam objetos tipados com todos os campos
- Rate limits respeitados
- Erro de rede/token: mensagem clara, não crasha

### Phase 6: Cross-Analysis Pass

**Goal:** Novo pass no pipeline que busca dados externos por pessoa, cruza
com o perfil e gera insights. Scheduler para daily/sprint triggers.
Demandas automáticas.

**Depends on:** Phase 5
**Requirements:** EXT-07, EXT-08, EXT-09, EXT-10

#### Plans

1. **EXT-07: ExternalDataPass no IngestionPipeline** — Após syncItemToPerson()
   e antes do 1:1 Deep. Identifica pessoa_principal, verifica identidade
   externa, busca métricas (cache 1h), gera insights, salva external_data.yaml
   e atualiza perfil.md com seção "Dados Externos". Graceful degradation:
   falha de API nunca para a ingestão.

2. **EXT-08: CrossAnalyzer** — Lógica programática (sem IA) com thresholds.
   Analyze por pessoa: sobrecarga, desalinhamento, gap_comunicacao,
   crescimento, bloqueio. AnalyzeTeam: risco_sprint, padrões comparativos.

3. **EXT-09: Scheduler** — Triggers: daily (ao abrir app, 1x/dia),
   sprint (verifica mudança de sprint no Jira), on-demand (IPC).
   Cache de estado em ~/.pulsecockpit/cache/.

4. **EXT-10: Acumulação histórica** — external_data.yaml guarda snapshot
   mensal. Seção "Dados Externos" no perfil.md é aditiva (nunca sobrescreve).
   Cycle prompt consome histórico completo.

**Verification:**
- Ingerir artefato de pessoa com identidade externa → external_data.yaml criado
- Cache funciona: segunda ingestão não refaz chamadas
- Insights de análise cruzada presentes nos resultados
- Pessoa SEM identidade → ExternalDataPass pulado silenciosamente
- Integrações desativadas → ExternalDataPass não roda

### Phase 7: Reports

**Goal:** Geração de relatórios periódicos: daily e sprint. Salvos como .md
no workspace.

**Depends on:** Phase 6
**Requirements:** EXT-11, EXT-12

#### Plans

1. **EXT-11: DailyReportGenerator** — Gera daily_YYYY-MM-DD.md em
   {workspace}/relatorios/. Seções: por pessoa (ontem/hoje/blockers),
   bloqueios do time, riscos, resumo. Disparado pelo Scheduler ao abrir app.

2. **EXT-12: SprintReportGenerator** — Gera sprint_{nome}.md em
   {workspace}/relatorios/. Seções: resumo, tabela por pessoa, blockers,
   insights cruzados. Disparado em início/fim de sprint.

**Verification:**
- Ao abrir app com dailyReportEnabled → daily_YYYY-MM-DD.md criado
- Conteúdo contém dados de cada pessoa com identidade mapeada
- Conteúdo contém seção de bloqueios e riscos
- Mudança de sprint → sprint_{nome}.md criado

### Phase 8: UI Integration

**Goal:** Dados externos visíveis na UI: RelatóriosView, seção Dados Externos
na PersonView, triggers no Dashboard, prompts enriquecidos.

**Depends on:** Phase 7
**Requirements:** EXT-13, EXT-14, EXT-15

#### Plans

1. **EXT-13: RelatóriosView** — Nova view listando relatórios de
   {workspace}/relatorios/. Preview via react-markdown. Botão "Atualizar
   Agora". Badges "Novo"/"Sprint". Item na Sidebar.

2. **EXT-14: PersonView + Dashboard** — PersonView: seção "Dados Externos"
   com cards Jira/GitHub + insights. Dashboard: novos triggers no
   TeamRiskPanel (blockerAtivo, workloadAlto, prAcumulando, commitsBaixos).

3. **EXT-15: Prompts enriquecidos** — agenda.prompt e cycle.prompt recebem
   externalData?. Modelos instruídos a usar dados quantitativos.

**Verification:**
- RelatóriosView exibe lista com preview
- Botão "Atualizar Agora" gera novo daily
- PersonView exibe cards para pessoa com identidade
- Dashboard mostra triggers com fonte (Jira/GitHub)
- Pauta 1:1 menciona dados externos em perguntas/alertas
- Ciclo report inclui evidências quantitativas

---

## Requirement Coverage

| Requirement | Phase | Plans |
|-------------|-------|-------|
| EXT-01 | Phase 4 | Plan 1 |
| EXT-02 | Phase 4 | Plan 2 |
| EXT-03 | Phase 5 | Plan 1 |
| EXT-04 | Phase 5 | Plan 2 |
| EXT-05 | Phase 5 | Plan 3 |
| EXT-06 | Phase 5 | Plan 4 |
| EXT-07 | Phase 6 | Plan 1 |
| EXT-08 | Phase 6 | Plan 2 |
| EXT-09 | Phase 6 | Plan 3 |
| EXT-10 | Phase 6 | Plan 4 |
| EXT-11 | Phase 7 | Plan 1 |
| EXT-12 | Phase 7 | Plan 2 |
| EXT-13 | Phase 8 | Plan 1 |
| EXT-14 | Phase 8 | Plan 2 |
| EXT-15 | Phase 8 | Plan 3 |

**Total:** 15 requirements. No orphans.

---

## Progress

| Phase | Plans | Status | Completed |
|-------|-------|--------|-----------|
| 4. Settings + Identity | 0/2 | Not started | - |
| 5. External Clients | 0/4 | Not started | - |
| 6. Cross-Analysis Pass | 0/4 | Not started | - |
| 7. Reports | 0/2 | Not started | - |
| 8. UI Integration | 0/3 | Not started | - |

---

## Estimativa

| Phase | Complexidade | Tempo |
|-------|-------------|-------|
| 4. Settings + Identity | Baixa | ~1h |
| 5. External Clients | Média | ~2h |
| 6. Cross-Analysis Pass | Alta | ~2.5h |
| 7. Reports | Média | ~2h |
| 8. UI Integration | Média | ~2h |
| **Total** | | **~9.5h** |

---

## Safety Notes

- **External data is supplementary.** Perfil.md continua fonte de verdade.
- **Cache obrigatório.** Nunca refazer chamadas API para mesma pessoa em 1h.
- **Graceful degradation.** Se API externa falha, pipeline continua sem dados.
- **No writes to external systems.** Fase inicial é read-only.
- **Acumulação histórica.** external_data.yaml preserva snapshot mensal para
  relatórios de ciclo de qualquer período.
- **CrossAnalyzer sem IA.** Lógica programática com thresholds — IA já
  existe nos prompts existentes (cycle, agenda).

---

*Last updated: 2026-03-30*

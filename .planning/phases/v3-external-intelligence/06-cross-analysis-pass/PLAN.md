# Phase 6: Cross-Analysis Pass

## Contexto

Com os clientes externos funcionando (Phase 5), agora integramos eles ao
pipeline de ingestão e criamos a camada de análise cruzada.

Esta é a fase mais complexa — é onde os dados quantitativos passam a
alimentar o perfil.md automaticamente.

## Solução Proposta

4 componentes novos:
1. **ExternalDataPass** — integrado ao IngestionPipeline
2. **CrossAnalyzer** — lógica programática de análise cruzada
3. **Scheduler** — triggers automáticos (daily, sprint)
4. **Acumulação histórica** — external_data.yaml com snapshots mensais

## Arquitetura

### Arquivos Novos

| Arquivo | Descrição |
|---------|-----------|
| `src/main/ingestion/ExternalDataPass.ts` | Pass no pipeline de ingestão |
| `src/main/external/CrossAnalyzer.ts` | Lógica de análise cruzada |
| `src/main/external/Scheduler.ts` | Gerencia triggers de relatórios |

### Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `src/main/ingestion/IngestionPipeline.ts` | Integrar ExternalDataPass após syncItemToPerson |
| `src/main/ingestion/ArtifactWriter.ts` | Método para escrever seção "Dados Externos" no perfil.md |
| `src/main/registry/DemandaRegistry.ts` | Nova origem 'Sistema' para demandas automáticas |

### ExternalDataPass — Fluxo

```
IngestionPipeline.processItem():
  Pass 1 → Pass 2 → syncItemToPerson()
      ↓
  ExternalDataPass (se integrações ativas):
      1. Verificar se pessoa_principal tem identidade externa
      2. Verificar cache (1h por pessoa)
      3. SE cache miss:
          a. JiraClient → fetchJiraMetrics()
          b. GitHubClient → fetchGitHubMetrics()
          c. CrossAnalyzer → analyze()
          d. Salvar cache em ~/.pulsecockpit/cache/external/{slug}.json
      4. Atualizar external_data.yaml (snapshot mensal)
      5. Atualizar perfil.md com seção "Dados Externos"
      6. SE insights de severidade 'alta' com gerarDemanda=true:
          → DemandaRegistry.save({ origem: 'Sistema' })
      ↓
  1:1 Deep / Ceremony (comportamento existente)
```

### CrossAnalyzer — Lógica Programática

```typescript
export interface CrossInsight {
  tipo: 'sobrecarga' | 'desalinhamento' | 'gap_comunicacao' | 'crescimento' | 'bloqueio' | 'risco_sprint'
  severidade: 'alta' | 'media' | 'baixa'
  descricao: string
  evidencia: string
  acaoSugerida?: string
  gerarDemanda?: boolean
}

// Thresholds default (ajustáveis depois):
const THRESHOLDS = {
  sobrecarga_issues: 5,
  prs_acumulando_count: 2,
  prs_acumulando_dias: 3,
  queda_atividade_ratio: 0.5,     // < 50% do mês anterior
  crescimento_ratio: 1.3,         // > 30% vs mês anterior
  risco_sprint_nao_iniciadas: 0.4, // > 40% não iniciadas
  risco_sprint_dias_restantes: 3,
}
```

### Scheduler — Triggers

```typescript
export class Scheduler {
  // Chamado no app 'ready' event
  async onAppStart(): Promise<void> {
    if (this.shouldRunDaily()) {
      await this.runDailyReport()  // Phase 7
    }
    if (this.settings.sprintReportEnabled) {
      await this.checkSprintChange()
    }
  }

  // IPC handlers
  async refreshDaily(): Promise<void>
  async refreshSprint(): Promise<void>
}
```

### Acumulação Histórica — external_data.yaml

```yaml
# {workspace}/pessoas/{slug}/external_data.yaml
historico:
  "2026-01":
    jira: { issuesEntregues: 5, storyPoints: 8, blockers: 1 }
    github: { commits: 8, prsMerged: 3, reviews: 2 }
    insights: []
  "2026-02":
    jira: { issuesEntregues: 6, storyPoints: 11, blockers: 0 }
    github: { commits: 12, prsMerged: 5, reviews: 4 }
    insights:
      - tipo: crescimento
        descricao: "Reviews +100% vs mês anterior"

atual:
  atualizadoEm: "2026-03-30T10:00:00Z"
  jira:
    issuesAbertas: 5
    issuesFechadasSprint: 3
    storyPointsSprint: 13
    workloadScore: "alto"
    blockersAtivos:
      - key: "PROJ-200"
        summary: "Infra dependency"
        blockedSince: "2026-03-27"
  github:
    prsAbertos: 2
    prsMerged30d: 4
    commits30d: 12
    tempoMedioAbertoDias: 1.8
  insights:
    - tipo: "sobrecarga"
      severidade: "alta"
      descricao: "5 issues + 2 PRs simultâneos"
      evidencia: "Jira: 5 issues abertas, GitHub: 2 PRs parados 5+ dias"
      acaoSugerida: "Verificar workload no 1:1"
      gerarDemanda: false
    - tipo: "bloqueio"
      severidade: "alta"
      descricao: "PROJ-200 bloqueado há 3 dias"
      evidencia: "Jira: blocker ativo desde 2026-03-27"
      acaoSugerida: "Escalar para time de infra"
      gerarDemanda: true
```

### Perfil.md — Seção "Dados Externos" (aditiva)

```markdown
## Dados Externos
### Jira (atualizado: 2026-03-30)
- Sprint atual: "Onboarding V2" (17/03 → 30/03)
- Issues abertas: 5 | Fechadas no sprint: 3
- Story points: 13 comprometidos, 8 entregues
- Workload: alto
- Blockers: PROJ-200 (aguardando infra há 3 dias)
- Tempo médio de ciclo: 4.2 dias

### GitHub (atualizado: 2026-03-30)
- PRs abertos: 2 | Merged (30d): 4
- Commits (30d): 12
- Code reviews feitas: 6
- Tempo médio até merge: 1.8 dias

### Insights Cruzados
- ⚠️ Sobrecarga: 5 issues + 2 PRs simultâneos (30/03)
- 🚧 Bloqueio: PROJ-200 ativo há 3 dias — impactando entregas (30/03)
```

## Tasks

1. Criar `ExternalDataPass.ts` com lógica de pass
2. Criar `CrossAnalyzer.ts` com thresholds e regras
3. Criar `Scheduler.ts` com triggers
4. Integrar ExternalDataPass no `IngestionPipeline.ts`
5. Adicionar método de atualização de seção externa no `ArtifactWriter.ts`
6. Estender `DemandaRegistry` com origem 'Sistema'

## Critérios de Sucesso

- [ ] Ingerir artefato de pessoa com identidade → external_data.yaml criado
- [ ] Cache funciona: segunda ingestão não refaz chamadas de API
- [ ] Insights de análise cruzada presentes nos resultados
- [ ] Pessoa SEM identidade → ExternalDataPass pulado silenciosamente
- [ ] Integrações desativadas → ExternalDataPass não roda
- [ ] Falha de API → graceful degradation, ingestão continua
- [ ] Snapshot mensal acumula no external_data.yaml
- [ ] Perfil.md seção "Dados Externos" é aditiva (nunca sobrescreve)

## Estimativa

- **Duração:** ~2.5 horas
- **Complexidade:** Alta (integração com pipeline existente + cache + scheduler)

## Próxima Fase

Phase 7: Reports — DailyReportGenerator e SprintReportGenerator que usam os mesmos clients e métricas.

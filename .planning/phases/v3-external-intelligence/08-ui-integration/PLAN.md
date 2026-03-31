# Phase 8: UI Integration

## Contexto

Com os dados externos sendo buscados, analisados e os relatórios gerados,
agora precisamos tornar tudo visível na UI do Pulse Cockpit.

## Solução Proposta

1. **RelatóriosView** — nova view para listar e visualizar relatórios
2. **PersonView** — seção "Dados Externos" com cards de métricas
3. **Dashboard** — novos triggers quantitativos no TeamRiskPanel
4. **Sidebar** — item "Relatórios"
5. **Prompts** — enriquecidos com parâmetro externalData?

## Arquitetura

### Arquivos Novos

| Arquivo | Descrição |
|---------|-----------|
| `src/renderer/src/views/RelatóriosView.tsx` | Lista de relatórios com preview |

### Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `src/renderer/src/views/PersonView.tsx` | Seção "Dados Externos" |
| `src/renderer/src/views/DashboardView.tsx` | Novos triggers no TeamRiskPanel |
| `src/renderer/src/components/Sidebar.tsx` | Item "Relatórios" |
| `src/renderer/src/router.tsx` | Rota para RelatóriosView |
| `src/main/prompts/agenda.prompt.ts` | Parâmetro externalData? |
| `src/main/prompts/cycle.prompt.ts` | Parâmetro externalData? |

### RelatóriosView

```
┌──────────────────────────────────────────────────┐
│ Relatórios                    [Atualizar Agora]  │
├──────────────────────────────────────────────────┤
│ ▼ Daily Reports                                   │
│   📋 30/03/2026 — 3 ativos, 1 blocker crítico   │
│   📋 29/03/2026 — 3 ativos, 0 blockers          │
│                                                    │
│ ▼ Sprint Reports                                  │
│   📊 SPRINT-42 — 31/42 SP entregues (74%)       │
└──────────────────────────────────────────────────┘
```

- Lista relatórios de `{workspace}/relatorios/`
- Preview via `react-markdown` (já existe no projeto)
- Botão "Atualizar Agora" → `window.api.external.refreshDaily()`
- Badges: "Novo" se gerado hoje, "Sprint" para relatórios de sprint
- Expand/collapse por categoria (Daily / Sprint)

### PersonView — Seção "Dados Externos"

```
┌──────────────────────────────────────────────────┐
│ Dados Externos                 última atualização │
├──────────────────────────────────────────────────┤
│ ┌─ Jira ──────────────────────┐ ┌─ GitHub ─────┐ │
│ │ Sprint: 8/13 SP             │ │ 12 commits   │ │
│ │ 5 issues (3 doing, 2 done)  │ │ 4 PRs merged │ │
│ │ 🚧 1 blocker (PROJ-200)    │ │ 6 reviews    │ │
│ │ Ciclo: 4.2d (média: 5.1d)  │ │ Merge: 1.8d  │ │
│ └─────────────────────────────┘ └──────────────┘ │
│                                                    │
│ ⚠️ 2 PRs abertos há 5+ dias (↑ vs média 1.5d)  │
│ 📈 Code reviews +50% vs mês anterior             │
└──────────────────────────────────────────────────┘
```

- Renderiza apenas se `external_data.yaml` existe para a pessoa
- Cards com métricas Jira e GitHub
- Insights do CrossAnalyzer como badges/alertas
- Estado vazio: "Dados externos não configurados" (sem identidade mapeada)

### Dashboard — Novos Triggers

No `TeamRiskPanel` existente, adicionar:

```typescript
// Novos triggers quantitativos
if (externalData.github.tempoMedioAbertoDias > 3) {
  // PRs acumulando: média de abertos > 3 dias
  riskFactors.push({ label: 'PRs parados', fonte: 'GitHub' })
}
if (externalData.jira.workloadScore === 'alto') {
  riskFactors.push({ label: 'Workload alto', fonte: 'Jira' })
}
if (blockers.length > 0) {
  riskFactors.push({ label: `${blockers.length} blocker(s)`, fonte: 'Jira' })
}
if (externalData.github.commits30d < externalData.historico['prev']?.github?.commits * 0.5) {
  riskFactors.push({ label: 'Commits baixos', fonte: 'GitHub' })
}
```

### Prompts — Enriquecimento

**agenda.prompt.ts:**
```typescript
export interface AgendaPromptParams {
  // ... campos existentes ...
  externalData?: string  // seção "Dados Externos" do perfil.md
}
```

Adicionar seção no prompt:
```
${externalData ? `\n## Dados Externos (métricas objetivas)\n${externalData}\n` : ''}

Use os dados externos para:
- Gerar perguntas específicas com números concretos
- Identificar blockers que devem ser discutidos no 1:1
- Conectar dados quantitativos com observações qualitativas do perfil
```

**cycle.prompt.ts:**
Mesmo padrão — adicionar `externalData?` e instruir o modelo a incluir
evidências quantitativas na conclusão para calibração.

## IPC Handlers (necessários)

```typescript
// Preload bridge — expor novos handlers
external:refreshDaily    → Scheduler.refreshDaily()
external:refreshSprint   → Scheduler.refreshSprint()
external:getData(slug)   → ler external_data.yaml de uma pessoa
external:listReports()   → listar arquivos em {workspace}/relatorios/
external:getReport(path) → ler conteúdo de um relatório .md
```

## Tasks

1. Criar RelatóriosView.tsx com lista e preview
2. Adicionar seção "Dados Externos" na PersonView.tsx
3. Adicionar triggers quantitativos no DashboardView.tsx (TeamRiskPanel)
4. Adicionar item "Relatórios" na Sidebar.tsx
5. Adicionar rota no router.tsx
6. Enriquecer agenda.prompt.ts com externalData?
7. Enriquecer cycle.prompt.ts com externalData?
8. Expor IPC handlers no preload/index.ts

## Critérios de Sucesso

- [ ] RelatóriosView exibe lista de relatórios com preview
- [ ] Botão "Atualizar Agora" gera novo daily
- [ ] PersonView exibe cards Jira/GitHub para pessoa com identidade
- [ ] PersonView mostra estado vazio para pessoa sem identidade
- [ ] Dashboard mostra triggers quantitativos com fonte (Jira/GitHub)
- [ ] Pauta 1:1 gerada menciona dados externos em perguntas/alertas
- [ ] Ciclo report inclui evidências quantitativas na conclusão
- [ ] Sidebar tem item "Relatórios" funcional

## Estimativa

- **Duração:** ~2 horas
- **Complexidade:** Média (UI existente + novos componentes)

## Fim da V3

Após Phase 8, a V3 está completa. O gestor tem:
- Dados quantitativos por pessoa (Jira + GitHub)
- Análise cruzada automática com insights
- Daily e sprint reports automáticos
- Perfil enriquecido com seção "Dados Externos"
- Pautas e ciclos com lastro objetivo
- Dashboard com alertas quantitativos

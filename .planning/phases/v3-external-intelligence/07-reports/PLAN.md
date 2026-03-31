# Phase 7: Reports

## Contexto

Com os dados externos sendo buscados e analisados (Phase 6), agora
geramos relatórios periódicos em formato .md que ficam no workspace
para referência e visualização.

## Solução Proposta

2 geradores de relatório:
1. **DailyReportGenerator** — snapshot diário do time (ao abrir o app)
2. **SprintReportGenerator** — relatório de sprint (início/fim)

Ambos salvam em `{workspace}/relatorios/`.

## Arquitetura

### Arquivos Novos

| Arquivo | Descrição |
|---------|-----------|
| `src/main/external/DailyReportGenerator.ts` | Gera daily_YYYY-MM-DD.md |
| `src/main/external/SprintReportGenerator.ts` | Gera sprint_{nome}.md |

### Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `src/main/external/Scheduler.ts` | Chamar geradores nos triggers |
| `src/main/workspace/WorkspaceSetup.ts` | Criar diretório `relatorios/` |

### Workspace Structure (novo)

```
{workspace}/
├── relatorios/          ← NOVO
│   ├── daily_2026-03-30.md
│   ├── daily_2026-03-31.md
│   └── sprint_SPRINT-42.md
├── pessoas/
├── inbox/
└── ...
```

### DailyReportGenerator

```typescript
export class DailyReportGenerator {
  constructor(
    workspacePath: string,
    jiraClient: JiraClient | null,
    githubClient: GitHubClient | null
  )

  async generate(date: string): Promise<string>  // retorna conteúdo .md
  
  // Fluxo:
  // 1. Listar pessoas com identidade externa
  // 2. Para cada pessoa: buscar dados Jira + GitHub
  // 3. Identificar blockers e riscos
  // 4. Gerar .md formatado
  // 5. Salvar em {workspace}/relatorios/daily_{date}.md
}
```

### Formato do Daily Report

```markdown
# Daily Report — 2026-03-30

## Por Pessoa

### João Silva
- **Ontem (Jira):** PROJ-123 concluído, PROJ-456 em andamento
- **Ontem (GitHub):** 2 commits, PR #89 merged, 1 review
- **Hoje (Jira):** PROJ-789 (feature), PROJ-101 (refactor)
- **Blockers:** PROJ-200 — aguardando infra há 3 dias

### Maria Santos
- **Ontem (Jira):** PROJ-345 em andamento
- **Ontem (GitHub):** PR #92 aberto, 3 reviews
- **Hoje (Jira):** Continua PROJ-345
- **Blockers:** Nenhum

## Bloqueios do Time
- 🔴 PROJ-200 (João) — aguardando infra há 3 dias

## Riscos
- ⚠️ Sprint com 40% das stories não iniciadas, faltam 3 dias

## Resumo
- 3 pessoas ativas | 5 issues movimentadas | 1 blocker crítico
```

### SprintReportGenerator

```typescript
export class SprintReportGenerator {
  constructor(
    workspacePath: string,
    jiraClient: JiraClient | null,
    githubClient: GitHubClient | null
  )

  async generate(sprint: JiraSprint): Promise<string>  // retorna conteúdo .md
}
```

### Formato do Sprint Report

```markdown
# Sprint Report — SPRINT-42 "Onboarding V2"
**Período:** 2026-03-17 → 2026-03-30

## Resumo
- Comprometido: 42 SP (14 issues) | Entregue: 31 SP (10 issues)
- Velocity (3 sprints): 38 SP

## Por Pessoa
| Pessoa | Issues | SP | PRs | Commits | Status |
|--------|--------|----|----|---------|--------|
| João | 5 | 13 | 4 | 12 | 🟡 blocker |
| Maria | 4 | 10 | 3 | 8 | 🟢 |
| Pedro | 3 | 8 | 2 | 4 | 🔴 baixa atividade |

## Blockers Encontrados
- PROJ-200: 3 dias bloqueado por infra

## Insights
- ⚠️ João maior workload (5 issues)
- 📈 Maria: +50% em code reviews vs sprint anterior
- 🔇 Pedro: commits baixos sem blocker — verificar em 1:1
```

## Tasks

1. Criar DailyReportGenerator.ts
2. Criar SprintReportGenerator.ts
3. Integrar no Scheduler.ts (chamar nos triggers)
4. Garantir que WorkspaceSetup cria diretório relatorios/

## Critérios de Sucesso

- [ ] Ao abrir app com dailyReportEnabled → daily_{date}.md criado
- [ ] Conteúdo contém dados de cada pessoa com identidade mapeada
- [ ] Conteúdo contém seção de bloqueios e riscos
- [ ] Mudança de sprint no Jira → sprint_{nome}.md criado
- [ ] Formato .md válido e legível
- [ ] Arquivo não é sobrescrevido se já existe para a data

## Estimativa

- **Duração:** ~2 horas
- **Complexidade:** Média (templates + dados)

## Próxima Fase

Phase 8: UI Integration — RelatóriosView para visualizar os relatórios, PersonView com cards de métricas, prompts enriquecidos.

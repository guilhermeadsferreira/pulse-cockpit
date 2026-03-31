# Phase 5: External Clients

## Contexto

Com tokens e identidades configurados na Phase 4, agora precisamos dos
clientes HTTP que conectam com Jira e GitHub para buscar dados reais.

## Solução Proposta

4 arquivos novos:
- `JiraClient.ts` — HTTP client para Jira Cloud API v3
- `JiraMetrics.ts` — transformação de raw data em métricas por pessoa
- `GitHubClient.ts` — HTTP client para GitHub API via @octokit/rest
- `GitHubMetrics.ts` — transformação de raw data em métricas por pessoa

## Escopo

### Arquivos Novos

| Arquivo | Descrição |
|---------|-----------|
| `src/main/external/JiraClient.ts` | Cliente HTTP Jira com Basic Auth |
| `src/main/external/JiraMetrics.ts` | Métricas estruturadas por pessoa |
| `src/main/external/GitHubClient.ts` | Cliente HTTP GitHub via Octokit |
| `src/main/external/GitHubMetrics.ts` | Métricas estruturadas por pessoa |

### Interface JiraClient

```typescript
export class JiraClient {
  constructor(config: { baseUrl: string; email: string; apiToken: string })

  // Buscar issues atribuídas a uma pessoa (por email)
  searchIssuesByEmail(email: string, jql?: string): Promise<JiraIssue[]>

  // Sprint atual de um board
  getCurrentSprint(boardId: number): Promise<JiraSprint | null>

  // Todas as issues de uma sprint
  getSprintIssues(boardId: number, sprintId: number): Promise<JiraIssue[]>

  // Dados para daily standup (últimas 24h por pessoa)
  getDailyStandupData(emails: string[]): Promise<DailyStandupData[]>
}

// Rate limit: 100 req/min, backoff exponencial
// Timeout: 15s por request
// Auth: Basic (email:apiToken -> base64)
```

### Interface JiraPersonMetrics

```typescript
export interface JiraPersonMetrics {
  issuesAbertas: number
  issuesFechadasSprint: number
  storyPointsSprint: number
  workloadScore: 'alto' | 'medio' | 'baixo'
  bugsAtivos: number
  blockersAtivos: Blocker[]
  tempoMedioCicloDias: number
  distribuicaoPorTipo: Record<string, number>
  distribuicaoPorStatus: Record<string, number>
  sprintAtual: SprintSummary | null
}

export interface SprintSummary {
  nome: string
  inicio: string
  fim: string
  comprometido: number
  entregue: number
  totalIssues: number
  issuesConcluidas: number
}

export interface Blocker {
  key: string
  summary: string
  blockedSince: string
  assignee: string
}
```

### Interface GitHubClient

```typescript
export class GitHubClient {
  constructor(config: { token: string; org: string; repos: string[] })

  // PRs por pessoa
  getPRsByUser(username: string, since?: string): Promise<GitHubPR[]>

  // Commits recentes
  getCommitsByUser(username: string, since?: string): Promise<GitHubCommit[]>

  // Reviews feitas
  getReviewsByUser(username: string, since?: string): Promise<GitHubReview[]>

  // Atividade do time
  getTeamActivity(usernames: string[], since?: string): Promise<TeamActivity>
}

// Usa @octokit/rest oficial
// Rate limit: 5000 req/hour (GitHub)
```

### Interface GitHubPersonMetrics

```typescript
export interface GitHubPersonMetrics {
  prsAbertos: number
  prsMerged30d: number
  tempoMedioAbertoDias: number
  tempoMedioReviewDias: number
  prsRevisados: number
  commits30d: number
  commitsPorSemana: number
  padraoHorario: { manha: number; tarde: number; noite: number }
  tamanhoMedioPR: { additions: number; deletions: number }
}
```

## Fluxo de Dados

```
JiraClient.searchIssuesByEmail("joao@empresa.com")
  → GET /rest/api/3/search?jql=assignee="joao@empresa.com"
  → JiraIssue[]
  → JiraMetrics.compute(issues)
  → JiraPersonMetrics

GitHubClient.getPRsByUser("joaosilva")
  → GET /repos/{org}/{repo}/pulls?state=all&author=joaosilva
  → GitHubPR[]
  → GitHubMetrics.compute(prs, commits, reviews)
  → GitHubPersonMetrics
```

## Dependências

- `@octokit/rest` — SDK oficial do GitHub (adicionar ao package.json)
- npm install @octokit/rest

## Tasks

1. Instalar @octokit/rest
2. Criar JiraClient.ts com autenticação e métodos
3. Criar JiraMetrics.ts com transformações
4. Criar GitHubClient.ts com autenticação e métodos
5. Criar GitHubMetrics.ts com transformações

## Critérios de Sucesso

- [ ] Com token válido, JiraClient.searchIssuesByEmail retorna issues reais
- [ ] Com token válido, GitHubClient.getPRsByUser retorna PRs reais
- [ ] JiraPersonMetrics tem todos os campos preenchidos corretamente
- [ ] GitHubPersonMetrics tem todos os campos preenchidos corretamente
- [ ] Métricas batem com o que se vê nas plataformas (spot check manual)
- [ ] Rate limit respeitado (não estoura 100 req/min Jira, 5000 req/h GitHub)
- [ ] Erro de rede/token inválido: mensagem clara, não crasha
- [ ] TypeScript compila sem erros

## Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Jira API muda endpoint | Usar API v3 (estável). Documentação oficial. |
| GitHub rate limit atingido | Compartilhar chamadas. Cache na Phase 6. |
| Token inválido passa sem erro | Validar response.status em cada chamada |
| @octokit/rest muito grande | É o SDK oficial, mantido pelo GitHub. Dependency aceitável. |

## Estimativa

- **Duração:** ~2 horas
- **Complexidade:** Média (HTTP clients + data transformation)

## Próxima Fase

Phase 6: Cross-Analysis Pass — usa estes clients para buscar dados no pipeline de ingestão.

import { JiraClient, JiraConfig, JiraIssue, JiraSprint, JiraError } from './JiraClient'
import { Logger } from '../logging/Logger'

const log = Logger.getInstance().child('JiraMetrics')

export interface Blocker {
  key: string
  summary: string
  blockedSince: string
  assignee: string
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

export interface JiraMetricsInput {
  config: JiraConfig
  email: string
}

const EMPTY_METRICS: JiraPersonMetrics = {
  issuesAbertas: 0,
  issuesFechadasSprint: 0,
  storyPointsSprint: 0,
  workloadScore: 'baixo',
  bugsAtivos: 0,
  blockersAtivos: [],
  tempoMedioCicloDias: 0,
  distribuicaoPorTipo: {},
  distribuicaoPorStatus: {},
  sprintAtual: null,
}

export async function fetchJiraMetrics(input: JiraMetricsInput): Promise<JiraPersonMetrics> {
  const { config, email } = input

  try {
    const client = new JiraClient(config)
    const allIssues = await client.searchIssuesByEmail(email)

    const openIssues = allIssues.filter(i => i.statusCategory !== 'done')
    const closedIssues = allIssues.filter(i => i.statusCategory === 'done')

    const issuesFechadasSprint = closedIssues.length
    const storyPointsSprint = closedIssues.reduce((sum, i) => sum + (i.storyPoints || 0), 0)

    const workloadScore = computeWorkloadScore(openIssues.length, allIssues.reduce((sum, i) => sum + (i.storyPoints || 0), 0))

    const bugsAtivos = openIssues.filter(i => i.type.toLowerCase() === 'bug').length

    const blockersAtivos: Blocker[] = openIssues
      .filter(i => i.linkedBlockers.length > 0 || i.labels.some(l => l.toLowerCase().includes('blocker')))
      .map(i => ({
        key: i.key,
        summary: i.summary,
        blockedSince: i.blockedSince || i.updated,
        assignee: i.assignee || '',
      }))

    const tempoMedioCicloDias = computeAverageCycleTime(closedIssues)

    const distribuicaoPorTipo = computeDistribution(allIssues, i => i.type)
    const distribuicaoPorStatus = computeDistribution(allIssues, i => i.status)

    let sprintAtual: SprintSummary | null = null
    if (config.boardId) {
      try {
        const sprint = await client.getCurrentSprint(config.boardId)
        if (sprint) {
          const sprintIssues = await client.getSprintIssues(config.boardId, sprint.id)
          const personSprintIssues = sprintIssues.filter(i => i.assignee === email)
          const doneSprintIssues = personSprintIssues.filter(i => i.statusCategory === 'done')
          const totalSP = personSprintIssues.reduce((sum, i) => sum + (i.storyPoints || 0), 0)
          const deliveredSP = doneSprintIssues.reduce((sum, i) => sum + (i.storyPoints || 0), 0)

          sprintAtual = {
            nome: sprint.name,
            inicio: sprint.startDate || '',
            fim: sprint.endDate || '',
            comprometido: totalSP,
            entregue: deliveredSP,
            totalIssues: personSprintIssues.length,
            issuesConcluidas: doneSprintIssues.length,
          }
        }
      } catch (err) {
        log.warn('Falha ao buscar sprint atual', { boardId: config.boardId, error: (err as Error).message })
      }
    }

    return {
      issuesAbertas: openIssues.length,
      issuesFechadasSprint,
      storyPointsSprint,
      workloadScore,
      bugsAtivos,
      blockersAtivos,
      tempoMedioCicloDias,
      distribuicaoPorTipo,
      distribuicaoPorStatus,
      sprintAtual,
    }
  } catch (err) {
    if (err instanceof JiraError) {
      log.error('Erro Jira ao buscar métricas', { email, statusCode: err.statusCode, message: err.message })
    } else {
      log.error('Erro inesperado ao buscar métricas Jira', { email, error: (err as Error).message })
    }
    return EMPTY_METRICS
  }
}

function computeWorkloadScore(openCount: number, totalSP: number): 'alto' | 'medio' | 'baixo' {
  if (openCount > 12 || totalSP > 60) return 'alto'
  if (openCount > 6 || totalSP > 30) return 'medio'
  return 'baixo'
}

function computeAverageCycleTime(closedIssues: JiraIssue[]): number {
  const withDates = closedIssues.filter(i => i.resolved && i.created)
  if (withDates.length === 0) return 0

  const totalDays = withDates.reduce((sum, i) => {
    const created = new Date(i.created).getTime()
    const resolved = new Date(i.resolved!).getTime()
    return sum + (resolved - created) / 86_400_000
  }, 0)

  return Math.round((totalDays / withDates.length) * 10) / 10
}

function computeDistribution(
  issues: JiraIssue[],
  keyFn: (i: JiraIssue) => string,
): Record<string, number> {
  const dist: Record<string, number> = {}
  for (const issue of issues) {
    const key = keyFn(issue)
    dist[key] = (dist[key] || 0) + 1
  }
  return dist
}

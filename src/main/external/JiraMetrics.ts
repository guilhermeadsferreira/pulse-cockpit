import { JiraClient, JiraConfig, JiraIssue, JiraSprint, JiraError } from './JiraClient'
import { Logger } from '../logging/Logger'

const log = Logger.getInstance().child('JiraMetrics')

export interface Blocker {
  key: string
  summary: string
  description: string
  blockedSince: string
  assignee: string
  comments: string[]
  flagged: boolean
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

export interface CycleTimeByStage {
  todoToInProgress: number
  inProgressToReview: number
  reviewToDone: number
  total: number
}

export interface JiraPersonMetrics {
  issuesAbertas: number
  issuesFechadasSprint: number
  storyPointsSprint: number
  workloadScore: 'alto' | 'medio' | 'baixo'
  bugsAtivos: number
  blockersAtivos: Blocker[]
  tempoMedioCicloDias: number
  cycleTimeByStage: CycleTimeByStage | null
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
  cycleTimeByStage: null,
  distribuicaoPorTipo: {},
  distribuicaoPorStatus: {},
  sprintAtual: null,
}

export async function fetchJiraMetrics(input: JiraMetricsInput): Promise<JiraPersonMetrics> {
  const { config, email } = input

  try {
    const client = new JiraClient(config)
    log.info('fetchJiraMetrics: buscando issues', { assignee: email, baseUrl: config.baseUrl })
    const allIssues = await client.searchIssuesByAssignee(email)
    log.info('fetchJiraMetrics: resultado', { assignee: email, totalIssues: allIssues.length })

    const openIssues = allIssues.filter(i => i.statusCategory !== 'done')
    const closedIssues = allIssues.filter(i => i.statusCategory === 'done')

    const issuesFechadasSprint = closedIssues.length
    const storyPointsSprint = closedIssues.reduce((sum, i) => sum + (i.storyPoints || 0), 0)

    const workloadScore = computeWorkloadScore(openIssues.length, allIssues.reduce((sum, i) => sum + (i.storyPoints || 0), 0))

    const bugsAtivos = openIssues.filter(i => i.type.toLowerCase() === 'bug').length

    const blockerIssues = openIssues.filter(
      i => i.linkedBlockers.length > 0 || i.labels.some(l => l.toLowerCase().includes('blocker'))
    )
    const blockersAtivos = await Promise.all(
      blockerIssues.map(async i => {
        let comments: string[] = []
        try {
          const commentData = await client.getIssueComments(i.key, 3)
          comments = commentData.map(c => c.body)
        } catch {
          log.warn('Falha ao buscar comentários do blocker', { key: i.key })
        }
        return {
          key: i.key,
          summary: i.summary,
          description: i.summary,
          blockedSince: i.blockedSince || i.updated,
          assignee: i.assignee || '',
          comments,
          flagged: i.labels.some(l => l.toLowerCase().includes('flagged')) || i.priority.toLowerCase().includes('highest'),
        }
      })
    )

    const tempoMedioCicloDias = computeAverageCycleTime(closedIssues)

    let cycleTimeByStage: CycleTimeByStage | null = null
    try {
      const recentClosed = closedIssues.filter(i => i.resolved).slice(0, 20)
      cycleTimeByStage = await computeCycleTimeByStage(client, recentClosed)
    } catch (err) {
      log.warn('Falha ao calcular cycle time por etapa', { error: (err as Error).message })
    }

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
      cycleTimeByStage,
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

async function computeCycleTimeByStage(
  client: JiraClient,
  closedIssues: JiraIssue[],
): Promise<CycleTimeByStage> {
  const statusMap: Record<string, string[]> = {
    todoToInProgress: ['To Do', 'Backlog', 'Open', 'New'],
    inProgressToReview: ['In Progress', 'In Dev', 'Development', 'Doing'],
    reviewToDone: ['In Review', 'Review', 'QA', 'Testing', 'Done', 'Closed'],
  }

  type StageKey = 'todoToInProgress' | 'inProgressToReview' | 'reviewToDone'

  const stageTimes: Record<StageKey, number[]> = {
    todoToInProgress: [],
    inProgressToReview: [],
    reviewToDone: [],
  }

  for (const issue of closedIssues) {
    try {
      const changelog = await client.getIssueChangelog(issue.key)
      const statusTransitions = changelog
        .flatMap(entry => entry.items)
        .filter(item => item.field === 'status')

      if (statusTransitions.length === 0) continue

      const sortedTransitions = statusTransitions
        .map((t, idx) => ({
          from: t.fromString,
          to: t.toString,
          created: changelog.find(c => c.items.includes(t))?.created || issue.created,
        }))
        .sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime())

      const createdTime = new Date(issue.created).getTime()
      const resolvedTime = issue.resolved ? new Date(issue.resolved).getTime() : Date.now()

      for (let i = 0; i < sortedTransitions.length; i++) {
        const current = sortedTransitions[i]
        const next = sortedTransitions[i + 1]
        const currentTime = i === 0 ? createdTime : new Date(current.created).getTime()
        const endTime = next ? new Date(next.created).getTime() : resolvedTime
        const durationDays = (endTime - currentTime) / 86_400_000

        for (const [stageKey, stageNames] of Object.entries(statusMap) as [StageKey, string[]][]) {
          if (stageNames.some(n => current.to?.toLowerCase().includes(n.toLowerCase()))) {
            stageTimes[stageKey].push(durationDays)
            break
          }
        }
      }
    } catch {
      log.warn('Falha ao buscar changelog para cycle time', { key: issue.key })
    }
  }

  const avg = (arr: number[]): number => arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0

  return {
    todoToInProgress: avg(stageTimes.todoToInProgress),
    inProgressToReview: avg(stageTimes.inProgressToReview),
    reviewToDone: avg(stageTimes.reviewToDone),
    total: Math.round((avg(stageTimes.todoToInProgress) + avg(stageTimes.inProgressToReview) + avg(stageTimes.reviewToDone)) * 10) / 10,
  }
}

import { GitHubClient, GitHubConfig, GitHubPR, GitHubCommit, GitHubReview } from './GitHubClient'
import { Logger } from '../logging/Logger'

const log = Logger.getInstance().child('GitHubMetrics')

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

export interface GitHubMetricsInput {
  config: GitHubConfig
  username: string
}

const EMPTY_METRICS: GitHubPersonMetrics = {
  prsAbertos: 0,
  prsMerged30d: 0,
  tempoMedioAbertoDias: 0,
  tempoMedioReviewDias: 0,
  prsRevisados: 0,
  commits30d: 0,
  commitsPorSemana: 0,
  padraoHorario: { manha: 0, tarde: 0, noite: 0 },
  tamanhoMedioPR: { additions: 0, deletions: 0 },
}

const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

export async function fetchGitHubMetrics(input: GitHubMetricsInput): Promise<GitHubPersonMetrics> {
  const { config, username } = input

  try {
    const client = new GitHubClient(config)
    const since = THIRTY_DAYS_AGO

    const [prs, commits, reviews] = await Promise.all([
      client.getPRsByUser(username, since),
      client.getCommitsByUser(username, since),
      client.getReviewsByUser(username, since),
    ])

    const openPRs = prs.filter(pr => pr.state === 'open')
    const mergedPRs = prs.filter(pr => pr.merged)
    const closedPRs = prs.filter(pr => pr.state === 'closed' || pr.merged)

    const prsAbertos = openPRs.length
    const prsMerged30d = mergedPRs.length

    const tempoMedioAbertoDias = computeAverageOpenTime(closedPRs)
    const tempoMedioReviewDias = computeAverageReviewTime(prs, reviews)

    const prsRevisados = reviews.length

    const commits30d = commits.length
    const commitsPorSemana = Math.round((commits30d / 30) * 7 * 10) / 10

    const padraoHorario = computeTimePattern(commits)
    const tamanhoMedioPR = computeAveragePRSize(mergedPRs.length > 0 ? mergedPRs : prs)

    return {
      prsAbertos,
      prsMerged30d,
      tempoMedioAbertoDias,
      tempoMedioReviewDias,
      prsRevisados,
      commits30d,
      commitsPorSemana,
      padraoHorario,
      tamanhoMedioPR,
    }
  } catch (err) {
    log.error('Erro ao buscar métricas GitHub', { username, error: (err as Error).message })
    return EMPTY_METRICS
  }
}

function computeAverageOpenTime(closedPRs: GitHubPR[]): number {
  if (closedPRs.length === 0) return 0

  const totalDays = closedPRs.reduce((sum, pr) => {
    const created = new Date(pr.createdAt).getTime()
    const closed = new Date(pr.closedAt || pr.mergedAt || pr.updatedAt).getTime()
    return sum + (closed - created) / 86_400_000
  }, 0)

  return Math.round((totalDays / closedPRs.length) * 10) / 10
}

function computeAverageReviewTime(prs: GitHubPR[], reviews: GitHubReview[]): number {
  const reviewedPRNumbers = new Set(reviews.map(r => r.prNumber))
  const reviewedPRs = prs.filter(pr => reviewedPRNumbers.has(pr.number))

  if (reviewedPRs.length === 0) return 0

  const prReviewTimes: number[] = []

  for (const pr of reviewedPRs) {
    const prReviews = reviews
      .filter(r => r.prNumber === pr.number)
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))

    if (prReviews.length > 0) {
      const created = new Date(pr.createdAt).getTime()
      const firstReview = new Date(prReviews[0].submittedAt).getTime()
      const days = (firstReview - created) / 86_400_000
      if (days >= 0) prReviewTimes.push(days)
    }
  }

  if (prReviewTimes.length === 0) return 0

  const avg = prReviewTimes.reduce((a, b) => a + b, 0) / prReviewTimes.length
  return Math.round(avg * 10) / 10
}

function computeTimePattern(commits: GitHubCommit[]): { manha: number; tarde: number; noite: number } {
  const pattern = { manha: 0, tarde: 0, noite: 0 }

  for (const commit of commits) {
    if (!commit.date) continue
    const hour = new Date(commit.date).getHours()
    if (hour >= 6 && hour < 12) pattern.manha++
    else if (hour >= 12 && hour < 18) pattern.tarde++
    else pattern.noite++
  }

  return pattern
}

function computeAveragePRSize(prs: GitHubPR[]): { additions: number; deletions: number } {
  if (prs.length === 0) return { additions: 0, deletions: 0 }

  const totalAdditions = prs.reduce((sum, pr) => sum + pr.additions, 0)
  const totalDeletions = prs.reduce((sum, pr) => sum + pr.deletions, 0)

  return {
    additions: Math.round(totalAdditions / prs.length),
    deletions: Math.round(totalDeletions / prs.length),
  }
}

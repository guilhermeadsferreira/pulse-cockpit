import { GitHubClient, GitHubConfig, GitHubPR, GitHubCommit, GitHubReview, GitHubReviewComment } from './GitHubClient'
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
  tamanhoMedioPR: { additions: number; deletions: number }
  // MTRC-01: Code review depth
  avgCommentsPerReview: number
  firstReviewTurnaroundDias: number
  approvalRate: number
  // MTRC-02: Collaboration
  collaborationScore: number
  // MTRC-03: Test coverage
  testCoverageRatio: number
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
  tamanhoMedioPR: { additions: 0, deletions: 0 },
  avgCommentsPerReview: 0,
  firstReviewTurnaroundDias: 0,
  approvalRate: 0,
  collaborationScore: 0,
  testCoverageRatio: 0,
}

const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

export async function fetchGitHubMetrics(input: GitHubMetricsInput): Promise<GitHubPersonMetrics> {
  const { config, username } = input

  try {
    const client = new GitHubClient(config)
    const since = THIRTY_DAYS_AGO

    const [prs, commits, reviews, reviewComments] = await Promise.all([
      client.getPRsByUser(username, since),
      client.getCommitsByUser(username, since),
      client.getReviewsByUser(username, since),
      client.getReviewCommentsByUser(username, since),
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

    const tamanhoMedioPR = computeAveragePRSize(mergedPRs.length > 0 ? mergedPRs : prs)

    // MTRC-01: Code review depth
    const avgCommentsPerReview = reviews.length > 0
      ? Math.round((reviewComments.length / reviews.length) * 10) / 10
      : 0
    const firstReviewTurnaroundDias = tempoMedioReviewDias
    const approvedReviews = reviews.filter(r => r.state === 'approved')
    const approvalRate = reviews.length > 0
      ? Math.round((approvedReviews.length / reviews.length) * 100)
      : 0

    // MTRC-02: Collaboration score
    const collaborationScore = computeCollaborationScore(commits, prs, reviews, config.repos)

    // MTRC-03: Test coverage ratio
    const testCoverageRatio = await computeTestCoverageRatio(client, config.org, mergedPRs)

    return {
      prsAbertos,
      prsMerged30d,
      tempoMedioAbertoDias,
      tempoMedioReviewDias,
      prsRevisados,
      commits30d,
      commitsPorSemana,
      tamanhoMedioPR,
      avgCommentsPerReview,
      firstReviewTurnaroundDias,
      approvalRate,
      collaborationScore,
      testCoverageRatio,
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

function computeAveragePRSize(prs: GitHubPR[]): { additions: number; deletions: number } {
  if (prs.length === 0) return { additions: 0, deletions: 0 }

  const totalAdditions = prs.reduce((sum, pr) => sum + pr.additions, 0)
  const totalDeletions = prs.reduce((sum, pr) => sum + pr.deletions, 0)

  return {
    additions: Math.round(totalAdditions / prs.length),
    deletions: Math.round(totalDeletions / prs.length),
  }
}

function computeCollaborationScore(
  commits: GitHubCommit[],
  prs: GitHubPR[],
  reviews: GitHubReview[],
  configuredRepos: string[],
): number {
  // Co-authored commits ratio (weight 30)
  const coAuthoredCount = commits.filter(c =>
    /co-authored-by:/i.test(c.message),
  ).length
  const coAuthoredRatio = commits.length > 0 ? coAuthoredCount / commits.length : 0

  // Cross-repo activity ratio (weight 40)
  const activeRepos = new Set<string>()
  for (const c of commits) activeRepos.add(c.repo)
  for (const pr of prs) activeRepos.add(pr.repo)
  const crossRepoRatio = configuredRepos.length > 0
    ? activeRepos.size / configuredRepos.length
    : 0

  // Reviews ratio (weight 30)
  const reviewRatio = Math.min(reviews.length / 5, 1)

  const score = coAuthoredRatio * 30 + crossRepoRatio * 40 + reviewRatio * 30
  return Math.round(Math.max(0, Math.min(100, score)))
}

const TEST_FILE_PATTERNS = [
  /\.test\./,
  /\.spec\./,
  /__tests__\//,
  /\btest\//,
  /\btests\//,
]

async function computeTestCoverageRatio(
  client: GitHubClient,
  org: string,
  mergedPRs: GitHubPR[],
): Promise<number> {
  if (mergedPRs.length === 0) return 0

  let prsWithTests = 0

  for (const pr of mergedPRs) {
    try {
      const filenames = await client.getPRFilenames(org, pr.repo, pr.number)
      const hasTestFile = filenames.some(f =>
        TEST_FILE_PATTERNS.some(pattern => pattern.test(f)),
      )
      if (hasTestFile) prsWithTests++
    } catch {
      // skip PR if file listing fails
    }
  }

  return Math.round((prsWithTests / mergedPRs.length) * 100)
}

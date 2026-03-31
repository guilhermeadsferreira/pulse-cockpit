import { Octokit } from '@octokit/rest'
import { Logger } from '../logging/Logger'

const log = Logger.getInstance().child('GitHubClient')

export interface GitHubConfig {
  token: string
  org: string
  repos: string[]
}

export interface GitHubPR {
  number: number
  title: string
  state: 'open' | 'closed'
  merged: boolean
  author: string
  createdAt: string
  updatedAt: string
  mergedAt: string | null
  closedAt: string | null
  repo: string
  additions: number
  deletions: number
  changedFiles: number
  labels: string[]
  reviewers: string[]
  reviewRequests: string[]
  draft: boolean
}

export interface GitHubCommit {
  sha: string
  message: string
  author: string
  date: string
  repo: string
  additions: number
  deletions: number
}

export interface GitHubReview {
  prNumber: number
  reviewer: string
  state: 'approved' | 'changes_requested' | 'commented' | 'dismissed'
  submittedAt: string
  repo: string
}

export interface TeamActivity {
  pullRequests: GitHubPR[]
  commits: GitHubCommit[]
  reviews: GitHubReview[]
}

interface PaginationOptions {
  perPage: number
  maxPages: number
}

const DEFAULT_PAGINATION: PaginationOptions = {
  perPage: 30,
  maxPages: 5,
}

export class GitHubClient {
  private octokit: Octokit
  private org: string
  private repos: string[]

  constructor(config: GitHubConfig) {
    this.octokit = new Octokit({ auth: config.token })
    this.org = config.org
    this.repos = config.repos
  }

  async getPRsByUser(username: string, since?: string): Promise<GitHubPR[]> {
    const allPRs: GitHubPR[] = []

    for (const repo of this.repos) {
      try {
        const prs = await this.fetchPRsForRepo(repo, username, since)
        allPRs.push(...prs)
      } catch (err) {
        log.warn('Falha ao buscar PRs', { repo, username, error: (err as Error).message })
      }
    }

    return allPRs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async getCommitsByUser(username: string, since?: string): Promise<GitHubCommit[]> {
    const allCommits: GitHubCommit[] = []

    for (const repo of this.repos) {
      try {
        const commits = await this.fetchCommitsForRepo(repo, username, since)
        allCommits.push(...commits)
      } catch (err) {
        log.warn('Falha ao buscar commits', { repo, username, error: (err as Error).message })
      }
    }

    return allCommits.sort((a, b) => b.date.localeCompare(a.date))
  }

  async getReviewsByUser(username: string, since?: string): Promise<GitHubReview[]> {
    const allReviews: GitHubReview[] = []

    for (const repo of this.repos) {
      try {
        const reviews = await this.fetchReviewsForRepo(repo, username, since)
        allReviews.push(...reviews)
      } catch (err) {
        log.warn('Falha ao buscar reviews', { repo, username, error: (err as Error).message })
      }
    }

    return allReviews.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
  }

  async getTeamActivity(usernames: string[], since?: string): Promise<TeamActivity> {
    const pullRequests: GitHubPR[] = []
    const commits: GitHubCommit[] = []
    const reviews: GitHubReview[] = []

    for (const username of usernames) {
      try {
        const [prs, userCommits, userReviews] = await Promise.all([
          this.getPRsByUser(username, since),
          this.getCommitsByUser(username, since),
          this.getReviewsByUser(username, since),
        ])
        pullRequests.push(...prs)
        commits.push(...userCommits)
        reviews.push(...userReviews)
      } catch (err) {
        log.warn('Falha ao buscar atividade do time', { username, error: (err as Error).message })
      }
    }

    return { pullRequests, commits, reviews }
  }

  private async fetchPRsForRepo(
    repo: string,
    username: string,
    since?: string,
    options?: Partial<PaginationOptions>,
  ): Promise<GitHubPR[]> {
    const { perPage, maxPages } = { ...DEFAULT_PAGINATION, ...options }
    const prs: GitHubPR[] = []
    let page = 1

    while (page <= maxPages) {
      try {
        const { data } = await this.octokit.rest.pulls.list({
          owner: this.org,
          repo,
          state: 'all',
          sort: 'created',
          direction: 'desc',
          per_page: perPage,
          page,
        })

        if (data.length === 0) break

        for (const pr of data) {
          if (pr.user?.login !== username) continue
          if (since && pr.created_at < since) {
            return prs
          }

          const reviewers: string[] = []
          const reviewRequests: string[] = []
          try {
            const reviewData = await this.octokit.rest.pulls.listReviews({
              owner: this.org,
              repo,
              pull_number: pr.number,
            })
            for (const review of reviewData.data) {
              if (review.user?.login && !reviewers.includes(review.user.login)) {
                reviewers.push(review.user.login)
              }
            }
          } catch { /* reviews may fail for draft PRs */ }

          let additions = 0
          let deletions = 0
          let changedFiles = 0
          try {
            const detail = await this.octokit.rest.pulls.get({
              owner: this.org,
              repo,
              pull_number: pr.number,
            })
            additions = detail.data.additions || 0
            deletions = detail.data.deletions || 0
            changedFiles = detail.data.changed_files || 0
          } catch { /* fallback to 0 */ }

          prs.push({
            number: pr.number,
            title: pr.title,
            state: pr.state as 'open' | 'closed',
            merged: Boolean(pr.merged_at),
            author: username,
            createdAt: pr.created_at,
            updatedAt: pr.updated_at,
            mergedAt: pr.merged_at,
            closedAt: pr.closed_at,
            repo,
            additions,
            deletions,
            changedFiles,
            labels: (pr.labels || []).map(l => typeof l === 'string' ? l : l.name || ''),
            reviewers,
            reviewRequests,
            draft: pr.draft || false,
          })
        }

        page++
      } catch (err) {
        const ghErr = err as { status?: number }
        if (ghErr.status === 403) {
          log.warn('GitHub rate limit ou sem permissão', { repo, username })
          break
        }
        throw err
      }
    }

    return prs
  }

  private async fetchCommitsForRepo(
    repo: string,
    username: string,
    since?: string,
    options?: Partial<PaginationOptions>,
  ): Promise<GitHubCommit[]> {
    const { perPage, maxPages } = { ...DEFAULT_PAGINATION, ...options }
    const commits: GitHubCommit[] = []
    let page = 1

    while (page <= maxPages) {
      try {
        const { data } = await this.octokit.rest.repos.listCommits({
          owner: this.org,
          repo,
          author: username,
          since: since ? `${since}T00:00:00Z` : undefined,
          per_page: perPage,
          page,
        })

        if (data.length === 0) break

        for (const commit of data) {
          const stats = commit.stats
          commits.push({
            sha: commit.sha,
            message: commit.commit.message.split('\n')[0],
            author: commit.author?.login || username,
            date: commit.commit.author?.date || '',
            repo,
            additions: stats?.additions || 0,
            deletions: stats?.deletions || 0,
          })
        }

        page++
      } catch (err) {
        const ghErr = err as { status?: number }
        if (ghErr.status === 403) {
          log.warn('GitHub rate limit ou sem permissão', { repo, username })
          break
        }
        throw err
      }
    }

    return commits
  }

  private async fetchReviewsForRepo(
    repo: string,
    username: string,
    since?: string,
    options?: Partial<PaginationOptions>,
  ): Promise<GitHubReview[]> {
    const { perPage, maxPages } = { ...DEFAULT_PAGINATION, ...options }
    const reviews: GitHubReview[] = []
    let page = 1

    while (page <= maxPages) {
      try {
        const { data } = await this.octokit.rest.pulls.list({
          owner: this.org,
          repo,
          state: 'all',
          sort: 'updated',
          direction: 'desc',
          per_page: perPage,
          page,
        })

        if (data.length === 0) break

        for (const pr of data) {
          if (since && pr.updated_at < since) {
            return reviews
          }

          try {
            const reviewData = await this.octokit.rest.pulls.listReviews({
              owner: this.org,
              repo,
              pull_number: pr.number,
            })

            for (const review of reviewData.data) {
              if (review.user?.login !== username) continue
              if (since && (review.submitted_at || '') < since) continue

              reviews.push({
                prNumber: pr.number,
                reviewer: username,
                state: (review.state || 'commented').toLowerCase() as GitHubReview['state'],
                submittedAt: review.submitted_at || '',
                repo,
              })
            }
          } catch { /* skip PR if reviews fail */ }
        }

        page++
      } catch (err) {
        const ghErr = err as { status?: number }
        if (ghErr.status === 403) {
          log.warn('GitHub rate limit ou sem permissão', { repo, username })
          break
        }
        throw err
      }
    }

    return reviews
  }
}

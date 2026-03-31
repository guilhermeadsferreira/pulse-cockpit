import { Logger } from '../logging/Logger'

const log = Logger.getInstance().child('JiraClient')

export interface JiraConfig {
  baseUrl: string
  email: string
  apiToken: string
  projectKey?: string
  boardId?: number
}

export interface JiraIssue {
  key: string
  summary: string
  status: string
  statusCategory: 'new' | 'indeterminate' | 'done'
  type: string
  priority: string
  assignee: string | null
  created: string
  updated: string
  resolved: string | null
  storyPoints: number | null
  labels: string[]
  sprint: string | null
  sprintId: number | null
  blockedSince: string | null
  linkedBlockers: string[]
}

export interface JiraSprint {
  id: number
  name: string
  state: 'closed' | 'active' | 'future'
  startDate: string | null
  endDate: string | null
  completeDate: string | null
  goal: string | null
}

export interface DailyStandupItem {
  issueKey: string
  summary: string
  status: string
  updated: string
  type: string
}

export interface DailyStandupData {
  assignee: string
  recentActivity: DailyStandupItem[]
  blockers: string[]
}

export interface JiraStatusTransition {
  from: string
  to: string
  timestamp: string
}

export interface JiraChangelogEntry {
  issueId: string
  created: string
  items: Array<{
    field: string
    fromString: string | null
    toString: string | null
  }>
}

export interface JiraComment {
  id: string
  author: string
  body: string
  created: string
  updated: string
}

interface RateLimiter {
  tokens: number
  lastRefill: number
  maxTokens: number
  refillRate: number
}

type JiraSearchIssueRow = {
  key: string
  fields: {
    summary: string
    status: {
      name: string
      statusCategory: { key: string }
    }
    issuetype: { name: string }
    priority: { name: string }
    assignee: { emailAddress?: string; displayName: string } | null
    created: string
    updated: string
    resolutiondate: string | null
    customfield_10016: number | null
    labels: string[]
    sprint: { id: number; name: string } | null
    issuelinks: Array<{
      type: { name: string; inward: string }
      outwardIssue?: { key: string; fields: { status: { statusCategory: { key: string } } } }
      inwardIssue?: { key: string }
    }>
  }
}

interface JiraSearchResponse {
  issues: JiraSearchIssueRow[]
  total: number
}

/** POST /rest/api/3/search/jql — paginação por nextPageToken */
interface JiraSearchJqlResponse {
  issues: JiraSearchIssueRow[]
  isLast?: boolean
  nextPageToken?: string
}

interface JiraBoardSprintResponse {
  values: JiraSprint[]
}

export class JiraClient {
  private baseUrl: string
  private authHeader: string
  private rateLimiter: RateLimiter

  constructor(config: JiraConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.authHeader = `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString('base64')}`
    this.rateLimiter = {
      tokens: 100,
      lastRefill: Date.now(),
      maxTokens: 100,
      refillRate: 100 / 60_000,
    }
  }

  private async acquireToken(): Promise<void> {
    this.refillTokens()
    while (this.rateLimiter.tokens < 1) {
      const waitMs = Math.ceil((1 - this.rateLimiter.tokens) / this.rateLimiter.refillRate)
      log.debug('Rate limit: aguardando', { waitMs })
      await sleep(Math.min(waitMs, 5000))
      this.refillTokens()
    }
    this.rateLimiter.tokens -= 1
  }

  private refillTokens(): void {
    const now = Date.now()
    const elapsed = now - this.rateLimiter.lastRefill
    const added = elapsed * this.rateLimiter.refillRate
    this.rateLimiter.tokens = Math.min(this.rateLimiter.maxTokens, this.rateLimiter.tokens + added)
    this.rateLimiter.lastRefill = now
  }

  private async request<T>(
    path: string,
    options: { method?: 'GET' | 'POST'; body?: Record<string, unknown>; params?: Record<string, string> } = {}
  ): Promise<T> {
    await this.acquireToken()

    const { method = 'GET', body, params } = options

    const url = new URL(`${this.baseUrl}${path}`)
    if (params && method === 'GET') {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v)
      }
    }

    const maxRetries = 3
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15_000)

        const res = await fetch(url.toString(), {
          method,
          headers: {
            Authorization: this.authHeader,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        })

        clearTimeout(timeout)

        if (res.status === 429) {
          const retryAfter = Number(res.headers.get('Retry-After') || 5)
          log.warn('Rate limit 429 recebido', { retryAfter, path, attempt })
          await sleep(retryAfter * 1000)
          continue
        }

        if (res.status === 401 || res.status === 403) {
          throw new JiraError('Token inválido ou sem permissão', res.status)
        }

        if (res.status === 404) {
          throw new JiraError('Recurso não encontrado', res.status)
        }

        if (!res.ok) {
          const body = await res.text().catch(() => '')
          throw new JiraError(`HTTP ${res.status}: ${body.slice(0, 200)}`, res.status)
        }

        return await res.json() as T
      } catch (err) {
        if (err instanceof JiraError) throw err

        if ((err as Error).name === 'AbortError') {
          log.warn('Timeout Jira request', { path, attempt })
          if (attempt < maxRetries - 1) {
            await sleep(backoffDelay(attempt))
            continue
          }
          throw new JiraError('Timeout na requisição Jira (15s)', 0)
        }

        if (attempt < maxRetries - 1) {
          log.warn('Erro de rede Jira, retrying', { path, attempt, error: (err as Error).message })
          await sleep(backoffDelay(attempt))
          continue
        }

        throw new JiraError(`Erro de rede: ${(err as Error).message}`, 0)
      }
    }

    throw new JiraError('Max retries exceeded', 0)
  }

  async searchIssuesByAssignee(assignee: string, jql?: string): Promise<JiraIssue[]> {
    const query = jql || `assignee = "${assignee}" AND status != Done`
    const allIssues: JiraIssue[] = []
    const maxResults = 50
    const searchFields = [
      'summary',
      'status',
      'issuetype',
      'priority',
      'assignee',
      'created',
      'updated',
      'resolutiondate',
      'customfield_10016',
      'labels',
      'sprint',
      'issuelinks',
    ]

    let nextPageToken: string | undefined

    for (;;) {
      log.info('JiraClient: fazendo request POST para /rest/api/3/search/jql', {
        query,
        maxResults,
        page: nextPageToken ? 'next' : 'first',
      })

      const body: Record<string, unknown> = {
        jql: query,
        maxResults,
        fields: searchFields,
      }
      if (nextPageToken !== undefined) {
        body.nextPageToken = nextPageToken
      }

      const response = await this.request<JiraSearchJqlResponse>('/rest/api/3/search/jql', {
        method: 'POST',
        body,
      })

      for (const issue of response.issues) {
        const f = issue.fields
        const sprintInfo = f.sprint
          ? { name: f.sprint.name, id: f.sprint.id }
          : null

        const linkedBlockers = (f.issuelinks || [])
          .filter(l => l.type.name === 'Blocks' || l.type.inward === 'blocked by')
          .map(l => l.outwardIssue?.key || l.inwardIssue?.key || '')
          .filter(k => k.length > 0)

        const blockedSince = linkedBlockers.length > 0 ? f.updated : null

        allIssues.push({
          key: issue.key,
          summary: f.summary,
          status: f.status.name,
          statusCategory: f.status.statusCategory.key as JiraIssue['statusCategory'],
          type: f.issuetype.name,
          priority: f.priority.name,
          assignee: f.assignee?.emailAddress || f.assignee?.displayName || null,
          created: f.created,
          updated: f.updated,
          resolved: f.resolutiondate,
          storyPoints: f.customfield_10016,
          labels: f.labels || [],
          sprint: sprintInfo?.name || null,
          sprintId: sprintInfo?.id || null,
          blockedSince,
          linkedBlockers,
        })
      }

      if (allIssues.length >= 200) break
      if (response.isLast === true) break
      if (!response.nextPageToken) break

      nextPageToken = response.nextPageToken
    }

    return allIssues
  }

  async getCurrentSprint(boardId: number): Promise<JiraSprint | null> {
    const response = await this.request<JiraBoardSprintResponse>(
      `/rest/agile/1.0/board/${boardId}/sprint`,
      { params: { state: 'active' } },
    )

    if (!response.values || response.values.length === 0) return null

    const s = response.values[0]
    return {
      id: s.id,
      name: s.name,
      state: s.state,
      startDate: s.startDate || null,
      endDate: s.endDate || null,
      completeDate: s.completeDate || null,
      goal: s.goal || null,
    }
  }

  async getSprintIssues(boardId: number, sprintId: number): Promise<JiraIssue[]> {
    const allIssues: JiraIssue[] = []
    let startAt = 0
    const maxResults = 50
    let total = Infinity

    do {
      const response = await this.request<{ issues: JiraSearchResponse['issues']; total: number }>(
        `/rest/agile/1.0/board/${boardId}/sprint/${sprintId}/issue`,
        {
          params: {
            startAt: String(startAt),
            maxResults: String(maxResults),
            fields: 'summary,status,issuetype,priority,assignee,created,updated,resolutiondate,customfield_10016,labels,sprint,issuelinks',
          },
        },
      )

      for (const issue of response.issues) {
        const f = issue.fields
        const sprintInfo = f.sprint
          ? { name: f.sprint.name, id: f.sprint.id }
          : null

        const linkedBlockers = (f.issuelinks || [])
          .filter(l => l.type.name === 'Blocks' || l.type.inward === 'blocked by')
          .map(l => l.outwardIssue?.key || l.inwardIssue?.key || '')
          .filter(k => k.length > 0)

        allIssues.push({
          key: issue.key,
          summary: f.summary,
          status: f.status.name,
          statusCategory: f.status.statusCategory.key as JiraIssue['statusCategory'],
          type: f.issuetype.name,
          priority: f.priority.name,
          assignee: f.assignee?.emailAddress || f.assignee?.displayName || null,
          created: f.created,
          updated: f.updated,
          resolved: f.resolutiondate,
          storyPoints: f.customfield_10016,
          labels: f.labels || [],
          sprint: sprintInfo?.name || null,
          sprintId: sprintInfo?.id || null,
          blockedSince: linkedBlockers.length > 0 ? f.updated : null,
          linkedBlockers,
        })
      }

      total = response.total
      startAt += maxResults
    } while (startAt < total)

    return allIssues
  }

  async getDailyStandupData(assignees: string[]): Promise<DailyStandupData[]> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const results: DailyStandupData[] = []

    for (const assignee of assignees) {
      try {
        const updatedJql = `assignee = "${assignee}" AND updated >= "${twentyFourHoursAgo}" ORDER BY updated DESC`
        const issues = await this.searchIssuesByAssignee(assignee, updatedJql)

        const activity: DailyStandupItem[] = issues.map((i: JiraIssue) => ({
          issueKey: i.key,
          summary: i.summary,
          status: i.status,
          updated: i.updated,
          type: i.type,
        }))

        const blockers = issues
          .filter((i: JiraIssue) => i.linkedBlockers.length > 0 || i.statusCategory === 'indeterminate')
          .filter((i: JiraIssue) => {
            const hasBlockerLabel = i.labels.some((l: string) => l.toLowerCase().includes('blocker'))
            const hasBlockerPriority = i.priority.toLowerCase().includes('blocker') || i.priority.toLowerCase().includes('highest')
            return hasBlockerLabel || hasBlockerPriority || i.linkedBlockers.length > 0
          })
          .map((i: JiraIssue) => i.key)

        results.push({
          assignee,
          recentActivity: activity,
          blockers,
        })
      } catch (err) {
        log.warn('Falha ao buscar standup data', { assignee, error: (err as Error).message })
        results.push({ assignee, recentActivity: [], blockers: [] })
      }
    }

    return results
  }

  async getIssueChangelog(issueKey: string): Promise<JiraChangelogEntry[]> {
    const changelogEntries: JiraChangelogEntry[] = []
    let startAt = 0
    const maxResults = 100

    do {
      const response = await this.request<{ values: Array<{ id: string; created: string; items: Array<{ field: string; fromString: string | null; toString: string | null }> }>; isLast: boolean; startAt: number }>(
        `/rest/api/2/issue/${issueKey}/changelog`,
        {
          params: {
            startAt: String(startAt),
            maxResults: String(maxResults),
          },
        },
      )

      for (const entry of response.values) {
        changelogEntries.push({
          issueId: issueKey,
          created: entry.created,
          items: entry.items,
        })
      }

      if (response.isLast) break
      startAt += maxResults
    } while (changelogEntries.length < 500)

    return changelogEntries
  }

  async getIssueComments(issueKey: string, maxComments = 3): Promise<JiraComment[]> {
    const response = await this.request<{ comments: Array<{ id: string; author: { displayName: string }; body: string; created: string; updated: string }>; total: number }>(
      `/rest/api/3/issue/${issueKey}/comment`,
      {
        params: {
          sort: 'created',
          order: 'DESC',
          maxResults: String(maxComments),
        },
      },
    )

    return (response.comments || []).map(c => ({
      id: c.id,
      author: c.author.displayName,
      body: c.body.replace(/<[^>]*>/g, '').slice(0, 500),
      created: c.created,
      updated: c.updated,
    }))
  }
}

export class JiraError extends Error {
  statusCode: number

  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'JiraError'
    this.statusCode = statusCode
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function backoffDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 10_000)
}

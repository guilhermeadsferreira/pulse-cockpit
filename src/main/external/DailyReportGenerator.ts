import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { PersonRegistry, type PersonConfig } from '../registry/PersonRegistry'
import { SettingsManager, type AppSettings } from '../registry/SettingsManager'
import { JiraClient, JiraConfig, type DailyStandupItem, type JiraIssue, type JiraChangelogEntry } from './JiraClient'
import { GitHubClient, GitHubConfig, type GitHubCommit, type GitHubPR, type GitHubReview, type GitHubReviewComment } from './GitHubClient'
import { ExternalDataPass } from './ExternalDataPass'
import { MetricsWriter, type AlertEntry } from './MetricsWriter'
import { runClaudePrompt } from '../ingestion/ClaudeRunner'
import { buildDailyAnalysisPrompt } from '../prompts/daily-analysis.prompt'
import { fetchSustentacaoForReport } from './SupportBoardClient'
import { Logger } from '../logging/Logger'
import { notifyReportProgress } from './reportProgress'
import type { SupportBoardSnapshot } from '../../renderer/src/types/ipc'

const log = Logger.getInstance().child('DailyReportGenerator')

// ── Data structures ────────────────────────────────────────────

interface DailyActivity {
  jiraActivity: DailyStandupItem[]
  githubCommits: GitHubCommit[]
  githubPRsMerged: GitHubPR[]
  githubReviews: GitHubReview[]
  githubReviewComments: GitHubReviewComment[]
}

interface TaskCycleInfo {
  key: string
  summary: string
  status: string
  storyPoints: number | null
  daysInStatus: number
  statusCategory: PipelinePhase
  alert: 'normal' | 'warning' | null
  flagged: boolean
  jiraComments?: string[]
}

interface PipelinePhaseData {
  fase: string
  phaseKey: PipelinePhase
  tasks: number
  tempoMedio: number | null
  maisAntiga: { key: string; dias: number } | null
  baseline: number | null
  status: 'ok' | 'warning' | 'critical'
}

interface PersonDailyData {
  nome: string
  slug: string
  activity: DailyActivity
  activeTasks: TaskCycleInfo[]
  queueTasks: JiraIssue[]
  blockers: Array<{ key: string; summary: string; days: number; flagged: boolean; comments: string[] }>
  sprintSummary: { total: number; done: number; spTotal: number; spDone: number } | null
  cycleTimeBaseline: number | null
}

interface SprintOverview {
  nome: string
  inicio: string
  fim: string
  byPerson: Array<{
    nome: string
    total: number
    done: number
    inDev: number
    inReview: number
    inQa: number
    inQueue: number
    spTotal: number
    spDone: number
  }>
  totalIssues: number
  totalDone: number
  totalSP: number
  totalSPDone: number
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

type PipelinePhase = 'queue_dev' | 'dev' | 'queue_review' | 'review' | 'qa' | 'queue_deploy'

const DEV_STATUSES = ['dev', 'progress', 'doing', 'development', 'em andamento']
const REVIEW_STATUSES = ['review', 'code review', 'cr', 'em revisão']
const QA_STATUSES = ['qa', 'quality', 'testing', 'homolog', 'qc', 'em qa', 'to do qa']
const DONE_STATUSES = ['done', 'closed', 'concluído', 'resolved']
const QUEUE_PATTERNS = ['ready', 'backlog', 'to do', 'todo', 'selected', 'awaiting', 'a fazer']
const DEPLOY_STATUSES = ['ready to deploy', 'ready for deploy', 'deploy', 'pronto para deploy']

// Thresholds para alertas de cycle time por task
const DEV_DAYS_WARNING = 5
const REVIEW_DAYS_WARNING = 3
const QA_DAYS_WARNING = 3
const DEPLOY_DAYS_WARNING = 2
const WIP_WARNING_THRESHOLD = 3

const CONCURRENCY_LIMIT = 3

// ── Main class ─────────────────────────────────────────────────

export class DailyReportGenerator {
  private workspacePath: string
  private relatoriosDir: string

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath
    this.relatoriosDir = join(workspacePath, 'relatorios')
  }

  async generate(date?: string, force?: boolean): Promise<string> {
    const today = date ?? new Date().toISOString().slice(0, 10)
    const formattedDate = this.formatDateBR(today)
    const filePath = join(this.relatoriosDir, `Daily-${formattedDate}.md`)

    if (existsSync(filePath) && !force) {
      log.debug('daily report já existe, pulando geração', { date: today })
      return filePath
    }
    if (force && existsSync(filePath)) {
      log.info('daily report: regenerando (force)', { date: today })
      unlinkSync(filePath)
    }

    log.info('generateDailyReport: iniciando', { date: today })
    const progress = (step: string, message: string, percent: number) =>
      notifyReportProgress({ type: 'daily', step, message, percent })

    progress('init', 'Iniciando relatório daily…', 5)

    const registry = new PersonRegistry(this.workspacePath)
    const people = registry.list().filter(p => p.relacao === 'liderado')
    const settings = SettingsManager.load()

    // 1. Fetch sprint data ONCE (not per-person)
    progress('sprint-data', 'Buscando dados do sprint…', 15)
    const { sprintOverview, sprintIssuesByPerson, jiraClient, allSprintIssues } = await this.fetchSprintData(people, settings)

    // 2. Fetch yesterday activity + cycle time for ALL people in parallel (batches of 3)
    progress('people-data', `Coletando atividade de ${people.length} pessoas…`, 30)
    const personReports = await this.fetchAllPeopleData(people, settings, sprintIssuesByPerson, jiraClient)

    // 2.5 Compute baseline from done tasks changelog (per D-04, D-06)
    progress('baseline', 'Calculando baseline de cycle time…', 50)
    const doneTasksFromSprint = allSprintIssues.filter(i => i.statusCategory === 'done')
    const doneChangelogs = new Map<string, JiraChangelogEntry[]>()
    if (jiraClient && doneTasksFromSprint.length >= 3) {
      const fetchChangelog = async (issue: JiraIssue): Promise<void> => {
        try {
          const cl = await jiraClient.getIssueChangelog(issue.key)
          doneChangelogs.set(issue.key, cl)
        } catch (err) {
          log.warn('falha ao buscar changelog de done task', { key: issue.key })
        }
      }
      await batchParallel(doneTasksFromSprint.slice(0, 20), fetchChangelog, CONCURRENCY_LIMIT)
    }
    const doneTasksPhaseTime = computePhaseTimesFromDoneTasks(doneTasksFromSprint, doneChangelogs)

    // 2.6 Fetch sustentação (graceful — null se não configurado)
    progress('sustentacao', 'Buscando dados de sustentação…', 55)
    let sustentacaoSnapshot: SupportBoardSnapshot | null = null
    try {
      sustentacaoSnapshot = await fetchSustentacaoForReport(settings)
    } catch (err) {
      log.warn('sustentação: falhou (graceful)', { error: err instanceof Error ? err.message : String(err) })
    }

    // 3. Build deterministic report
    progress('build', 'Montando relatório…', 65)
    const allActiveTasks = personReports.flatMap(r => r.activeTasks)
    const { content, analysisInput } = this.buildReport(personReports, sprintOverview, today, allActiveTasks, doneTasksPhaseTime, sustentacaoSnapshot)

    // 4. Enrich with Haiku analysis (graceful degradation)
    let finalContent = content
    if (settings.claudeBinPath) {
      progress('ai-analysis', 'Executando análise IA…', 75)
      try {
        const aiSection = await this.runHaikuAnalysis(settings, analysisInput)
        if (aiSection) {
          finalContent = content + aiSection
        }
      } catch (err) {
        log.warn('Haiku analysis falhou (graceful)', { error: err instanceof Error ? err.message : String(err) })
      }
    }

    progress('write', 'Salvando relatório…', 95)
    mkdirSync(this.relatoriosDir, { recursive: true })
    writeFileSync(filePath, finalContent, 'utf-8')
    log.info('daily report gerado', { date: today, path: filePath })

    // Persistir alertas ativos no metricas.md (per D-01, D-12)
    const metricsWriter = new MetricsWriter(this.workspacePath)
    for (const person of personReports) {
      const alerts: AlertEntry[] = []
      // Blockers
      for (const b of person.blockers) {
        alerts.push({ tipo: 'blocker', descricao: `${b.key}: ${b.summary}`, desde: today })
      }
      // WIP alto (>= WIP_WARNING_THRESHOLD)
      if (person.activeTasks.length >= WIP_WARNING_THRESHOLD) {
        alerts.push({ tipo: 'wip_alto', descricao: `${person.activeTasks.length} tasks ativas simultaneamente`, desde: today })
      }
      // Cycle time warning
      for (const task of person.activeTasks) {
        if (task.alert === 'warning') {
          alerts.push({ tipo: 'cycle_time', descricao: `${task.key}: ${task.daysInStatus}d em ${task.status}`, desde: today })
        }
      }
      // Per D-01: so gravar se ha alertas. Dias normais nao gravam nada.
      if (alerts.length > 0) {
        try {
          metricsWriter.writeAlerts(person.slug, alerts)
        } catch (err) {
          log.warn('falha ao persistir alertas no metricas.md', { slug: person.slug, error: err instanceof Error ? err.message : String(err) })
        }
      }
    }

    progress('done', 'Relatório daily concluído!', 100)
    return filePath
  }

  // ── Sprint data (single fetch) ─────────────────────────────

  private async fetchSprintData(
    people: PersonConfig[],
    settings: AppSettings,
  ): Promise<{
    sprintOverview: SprintOverview | null
    sprintIssuesByPerson: Map<string, JiraIssue[]>
    jiraClient: JiraClient | null
    allSprintIssues: JiraIssue[]
  }> {
    const sprintIssuesByPerson = new Map<string, JiraIssue[]>()

    if (!settings.jiraEnabled || !settings.jiraBaseUrl || !settings.jiraApiToken || !settings.jiraBoardId) {
      return { sprintOverview: null, sprintIssuesByPerson, jiraClient: null, allSprintIssues: [] }
    }

    try {
      const jiraConfig: JiraConfig = {
        baseUrl: settings.jiraBaseUrl,
        email: settings.jiraEmail ?? '',
        apiToken: settings.jiraApiToken,
        boardId: settings.jiraBoardId,
      }
      const jiraClient = new JiraClient(jiraConfig)

      const sprint = await jiraClient.getCurrentSprint(settings.jiraBoardId)
      if (!sprint) {
        log.warn('nenhum sprint ativo encontrado para daily')
        return { sprintOverview: null, sprintIssuesByPerson, jiraClient, allSprintIssues: [] }
      }

      const allSprintIssues = await jiraClient.getSprintIssues(settings.jiraBoardId, sprint.id)
      log.info('sprint issues carregadas', { sprint: sprint.name, total: allSprintIssues.length })

      // Build email→person mapping for grouping
      const emailToSlug = new Map<string, string>()
      for (const p of people) {
        if (p.jiraEmail) emailToSlug.set(p.jiraEmail.toLowerCase(), p.slug)
      }

      // Group sprint issues by person
      let totalSP = 0
      let totalSPDone = 0
      let totalDone = 0

      for (const issue of allSprintIssues) {
        const assignee = issue.assignee?.toLowerCase() ?? ''
        const matchedSlug = emailToSlug.get(assignee)
        if (matchedSlug) {
          if (!sprintIssuesByPerson.has(matchedSlug)) {
            sprintIssuesByPerson.set(matchedSlug, [])
          }
          sprintIssuesByPerson.get(matchedSlug)!.push(issue)
        }
        totalSP += issue.storyPoints ?? 0
        if (issue.statusCategory === 'done') {
          totalDone++
          totalSPDone += issue.storyPoints ?? 0
        }
      }

      // Build sprint overview
      const byPerson: SprintOverview['byPerson'] = []
      for (const person of people) {
        const issues = sprintIssuesByPerson.get(person.slug) ?? []
        if (issues.length === 0) continue
        const done = issues.filter(i => i.statusCategory === 'done').length
        const sp = issues.reduce((s, i) => s + (i.storyPoints ?? 0), 0)
        const spDone = issues.filter(i => i.statusCategory === 'done').reduce((s, i) => s + (i.storyPoints ?? 0), 0)
        const active = issues.filter(i => i.statusCategory === 'indeterminate')
        const inDev = active.filter(i => categorizeStatus(i.status) === 'dev').length
        const inReview = active.filter(i => ['review', 'queue_review'].includes(categorizeStatus(i.status))).length
        const inQa = active.filter(i => categorizeStatus(i.status) === 'qa').length
        const inQueue = active.filter(i => ['queue_dev', 'queue_deploy'].includes(categorizeStatus(i.status))).length
        byPerson.push({ nome: shortName(person.nome), total: issues.length, done, inDev, inReview, inQa, inQueue, spTotal: sp, spDone })
      }

      const sprintOverview: SprintOverview = {
        nome: sprint.name,
        inicio: sprint.startDate ?? '',
        fim: sprint.endDate ?? '',
        byPerson,
        totalIssues: allSprintIssues.length,
        totalDone,
        totalSP,
        totalSPDone,
      }

      return { sprintOverview, sprintIssuesByPerson, jiraClient, allSprintIssues }
    } catch (err) {
      log.warn('falha ao buscar sprint data', { error: err instanceof Error ? err.message : String(err) })
      return { sprintOverview: null, sprintIssuesByPerson, jiraClient: null, allSprintIssues: [] }
    }
  }

  // ── Parallel fetch for all people ───────────────────────────

  private async fetchAllPeopleData(
    people: PersonConfig[],
    settings: AppSettings,
    sprintIssuesByPerson: Map<string, JiraIssue[]>,
    jiraClient: JiraClient | null,
  ): Promise<PersonDailyData[]> {
    const eligible = people.filter(p => p.jiraEmail || p.githubUsername)
    const externalPass = new ExternalDataPass(this.workspacePath)

    const fetchPerson = async (person: PersonConfig): Promise<PersonDailyData> => {
      let activity: DailyActivity = {
        jiraActivity: [], githubCommits: [], githubPRsMerged: [],
        githubReviews: [], githubReviewComments: [],
      }

      try {
        activity = await this.fetchYesterdayActivity(person, settings)
      } catch (err) {
        log.warn('falha ao buscar atividade de ontem', { slug: person.slug, error: err instanceof Error ? err.message : String(err) })
      }

      const sprintIssues = sprintIssuesByPerson.get(person.slug) ?? []
      const indeterminateTasks = sprintIssues.filter(i => i.statusCategory === 'indeterminate')

      // Categorize tasks: dev, review, qa, or queue
      const activePipelineTasks: JiraIssue[] = []
      const queueTasks: JiraIssue[] = []

      for (const task of indeterminateTasks) {
        const cat = categorizeStatus(task.status)
        if (cat === 'dev' || cat === 'review' || cat === 'qa' || cat === 'queue_review' || cat === 'queue_deploy') {
          activePipelineTasks.push(task)
        } else {
          queueTasks.push(task)
        }
      }

      // Fetch cycle time for active tasks (changelog per task — few calls)
      const activeTasks = await this.enrichWithCycleTime(activePipelineTasks, jiraClient)

      // Blockers from sprint data
      const blockers = sprintIssues
        .filter(i => i.linkedBlockers.length > 0 || i.labels.some(l => l.toLowerCase().includes('blocker')))
        .filter(i => i.statusCategory !== 'done')
        .map(i => ({
          key: i.key,
          summary: i.summary,
          days: Math.floor((Date.now() - new Date(i.blockedSince || i.updated).getTime()) / 86_400_000),
          flagged: i.labels.some(l => l.toLowerCase().includes('flagged')) || i.priority.toLowerCase().includes('highest'),
          comments: [] as string[],
        }))

      // Fetch Jira comments for stuck tasks and blockers
      if (jiraClient) {
        const issueKeysNeedingComments = [
          ...blockers.map(b => b.key),
          ...activeTasks.filter(t => t.alert === 'warning').map(t => t.key),
        ]
        const uniqueKeys = [...new Set(issueKeysNeedingComments)].slice(0, 6)

        for (const key of uniqueKeys) {
          try {
            const comments = await jiraClient.getIssueComments(key, 2)
            const commentTexts = comments.map(c => `${c.author} (${c.created.slice(0, 10)}): ${c.body}`)

            const blocker = blockers.find(b => b.key === key)
            if (blocker) blocker.comments = commentTexts

            const activeTask = activeTasks.find(t => t.key === key)
            if (activeTask) activeTask.jiraComments = commentTexts
          } catch (err) {
            log.warn('falha ao buscar comentários Jira', { key, error: err instanceof Error ? err.message : String(err) })
          }
        }
      }

      // Sprint summary per person
      const sprintSummary = sprintIssues.length > 0 ? {
        total: sprintIssues.length,
        done: sprintIssues.filter(i => i.statusCategory === 'done').length,
        spTotal: sprintIssues.reduce((s, i) => s + (i.storyPoints ?? 0), 0),
        spDone: sprintIssues.filter(i => i.statusCategory === 'done').reduce((s, i) => s + (i.storyPoints ?? 0), 0),
      } : null

      return {
        nome: shortName(person.nome),
        slug: person.slug,
        activity,
        activeTasks,
        queueTasks,
        blockers,
        sprintSummary,
        cycleTimeBaseline: externalPass.computeCycleTimeBaseline(person.slug),
      }
    }

    return batchParallel(eligible, fetchPerson, CONCURRENCY_LIMIT)
  }

  // ── Cycle time per active task ──────────────────────────────

  private async enrichWithCycleTime(tasks: JiraIssue[], jiraClient: JiraClient | null): Promise<TaskCycleInfo[]> {
    if (!jiraClient || tasks.length === 0) {
      return tasks.map(t => ({
        key: t.key,
        summary: t.summary,
        status: t.status,
        storyPoints: t.storyPoints,
        daysInStatus: 0,
        statusCategory: categorizeStatus(t.status),
        alert: null,
        flagged: t.labels.some(l => l.toLowerCase().includes('flagged')),
      }))
    }

    const results: TaskCycleInfo[] = []

    for (const task of tasks) {
      let daysInStatus = 0

      try {
        const changelog = await jiraClient.getIssueChangelog(task.key)
        daysInStatus = computeDaysInCurrentStatus(changelog, task.status)
      } catch (err) {
        log.warn('falha ao buscar changelog para cycle time', { key: task.key, error: err instanceof Error ? err.message : String(err) })
        // Fallback: use updated date
        daysInStatus = Math.floor((Date.now() - new Date(task.updated).getTime()) / 86_400_000)
      }

      const cat = categorizeStatus(task.status)
      const threshold = (cat === 'review' || cat === 'queue_review') ? REVIEW_DAYS_WARNING
        : cat === 'qa' ? QA_DAYS_WARNING
        : cat === 'queue_deploy' ? DEPLOY_DAYS_WARNING
        : DEV_DAYS_WARNING
      const alert = daysInStatus > threshold ? 'warning' as const : 'normal' as const
      const flagged = task.labels.some(l => l.toLowerCase().includes('flagged'))

      results.push({
        key: task.key,
        summary: task.summary,
        status: task.status,
        storyPoints: task.storyPoints,
        daysInStatus,
        statusCategory: cat,
        alert,
        flagged,
      })
    }

    return results
  }

  // ── Yesterday activity (per person, returns rich data) ──────

  private async fetchYesterdayActivity(person: PersonConfig, settings: AppSettings): Promise<DailyActivity> {
    const yesterday = this.getYesterday()
    const jiraEmail = person.jiraEmail
    const githubUsername = person.githubUsername

    const promises: Promise<void>[] = []

    let jiraActivity: DailyStandupItem[] = []
    let githubCommits: GitHubCommit[] = []
    let githubPRsMerged: GitHubPR[] = []
    let githubReviews: GitHubReview[] = []
    let githubReviewComments: GitHubReviewComment[] = []

    if (settings.jiraEnabled && settings.jiraBaseUrl && settings.jiraApiToken && jiraEmail) {
      promises.push((async () => {
        try {
          const boardId = person.jiraBoardId ?? settings.jiraBoardId
          const jiraConfig: JiraConfig = {
            baseUrl: settings.jiraBaseUrl!,
            email: jiraEmail,
            apiToken: settings.jiraApiToken!,
            projectKey: settings.jiraProjectKey,
            boardId,
          }
          const jiraClient = new JiraClient(jiraConfig)
          const standupData = await jiraClient.getDailyStandupData([jiraEmail])
          jiraActivity = standupData[0]?.recentActivity ?? []
        } catch (err) {
          log.warn('Falha ao buscar standup Jira', { slug: person.slug, error: err instanceof Error ? err.message : String(err) })
        }
      })())
    }

    if (settings.githubEnabled && settings.githubToken && githubUsername && settings.githubRepos) {
      promises.push((async () => {
        try {
          const githubConfig: GitHubConfig = {
            token: settings.githubToken!,
            org: settings.githubOrg ?? '',
            repos: settings.githubRepos!,
          }
          const githubClient = new GitHubClient(githubConfig)

          const [commits, prs, reviews, reviewComments] = await Promise.all([
            githubClient.getCommitsByUser(githubUsername, yesterday),
            githubClient.getPRsByUser(githubUsername, yesterday),
            githubClient.getReviewsByUser(githubUsername, yesterday),
            githubClient.getReviewCommentsByUser(githubUsername, yesterday),
          ])

          githubCommits = commits
          githubPRsMerged = prs.filter(p => p.merged)
          githubReviews = reviews
          githubReviewComments = reviewComments
        } catch (err) {
          log.warn('Falha ao buscar atividade GitHub', { slug: person.slug, error: err instanceof Error ? err.message : String(err) })
        }
      })())
    }

    await Promise.all(promises)
    return { jiraActivity, githubCommits, githubPRsMerged, githubReviews, githubReviewComments }
  }

  // ── Deterministic alerts ────────────────────────────────────

  private computeAlerts(personReports: PersonDailyData[], sprintOverview: SprintOverview | null): string[] {
    const alerts: string[] = []

    // B4: Sprint pace
    if (sprintOverview && sprintOverview.inicio && sprintOverview.fim) {
      const startDate = new Date(sprintOverview.inicio).getTime()
      const endDate = new Date(sprintOverview.fim).getTime()
      const now = Date.now()
      const totalDays = (endDate - startDate) / 86_400_000
      const elapsed = (now - startDate) / 86_400_000

      if (totalDays > 0 && elapsed > 0) {
        const pctElapsed = Math.round((elapsed / totalDays) * 100)
        const pctDone = sprintOverview.totalIssues > 0
          ? Math.round((sprintOverview.totalDone / sprintOverview.totalIssues) * 100)
          : 0

        if (pctElapsed > 30 && pctElapsed - pctDone > 20) {
          alerts.push(`⚠️ **Sprint pace**: ${pctElapsed}% do tempo decorrido mas apenas ${pctDone}% das issues entregues — risco de não fechar`)
        }
      }
    }

    for (const report of personReports) {
      // B1: Task parada (cycle time warning) — com contexto de comentários
      for (const task of report.activeTasks) {
        if (task.alert === 'warning') {
          const threshold = (task.statusCategory === 'review' || task.statusCategory === 'queue_review') ? REVIEW_DAYS_WARNING
            : task.statusCategory === 'qa' ? QA_DAYS_WARNING
            : task.statusCategory === 'queue_deploy' ? DEPLOY_DAYS_WARNING : DEV_DAYS_WARNING
          const flagMark = task.flagged ? ' 🚩' : ''
          let alertText = `⚠️ **${task.key}**${flagMark} (${report.nome}) — "${task.summary}" — está em _${task.status}_ há ${task.daysInStatus}d (>${threshold}d)`

          // Contexto: último comentário Jira
          if (task.jiraComments && task.jiraComments.length > 0) {
            const truncated = task.jiraComments[0].length > 200 ? task.jiraComments[0].slice(0, 197) + '...' : task.jiraComments[0]
            alertText += `\n  > Último comentário: "${truncated}"`
          }

          // Contexto: PR review comments relacionados (para tasks em CR/QA)
          if (task.statusCategory === 'review' || task.statusCategory === 'queue_review' || task.statusCategory === 'qa') {
            const relatedPRComments = report.activity.githubReviewComments
              .filter(c => c.body.includes(task.key))
              .slice(0, 1)
            for (const c of relatedPRComments) {
              const body = c.body.replace(/\n/g, ' ').trim()
              const truncated = body.length > 200 ? body.slice(0, 197) + '...' : body
              alertText += `\n  > PR ${c.repo}#${c.prNumber}: "${truncated}"`
            }
          }

          alerts.push(alertText)
        }
      }

      // B2: Possível bloqueio silencioso — sem atividade E tasks paradas há 2+ dias
      const { activity } = report
      const hasActivity = activity.jiraActivity.length > 0 ||
        activity.githubCommits.length > 0 ||
        activity.githubReviews.length > 0
      if (!hasActivity && report.activeTasks.length > 0) {
        const maxDays = Math.max(...report.activeTasks.map(t => t.daysInStatus))
        if (maxDays >= 2) {
          alerts.push(`⚠️ **${report.nome}** sem atualizações no Jira/GitHub com tasks em andamento há ${maxDays}d — verificar se há impedimento`)
        }
      }

      // B3: WIP alto
      if (report.activeTasks.length > WIP_WARNING_THRESHOLD) {
        const devCount = report.activeTasks.filter(t => t.statusCategory === 'dev').length
        const reviewCount = report.activeTasks.filter(t => t.statusCategory === 'review' || t.statusCategory === 'queue_review').length
        const qaCount = report.activeTasks.filter(t => t.statusCategory === 'qa').length
        const breakdown = [
          devCount > 0 ? `${devCount} dev` : '',
          reviewCount > 0 ? `${reviewCount} CR` : '',
          qaCount > 0 ? `${qaCount} QA` : '',
        ].filter(Boolean).join(', ')
        alerts.push(`⚠️ **${report.nome}** com ${report.activeTasks.length} tasks simultâneas no pipeline (${breakdown}) — risco de context switching`)
      }

      // B5: Task moveu pra trás (simplified: issue in Dev status but was in Review yesterday)
      for (const jiraItem of activity.jiraActivity) {
        const isDev = categorizeStatus(jiraItem.status) === 'dev'
        if (isDev) {
          // Check if this issue was previously in review (appears in activity = was updated)
          // If it's in Dev now but was "updated" yesterday, and we have an active task in Dev,
          // we can infer it moved back if the type suggests it was reviewed
          const matchingActive = report.activeTasks.find(t => t.key === jiraItem.issueKey)
          if (matchingActive && matchingActive.daysInStatus <= 1 && matchingActive.statusCategory === 'dev') {
            // Just entered Dev yesterday — could be new or moved back
            // We flag it as "voltou para Dev" only if we detect it was in review before
            // For now, we mark tasks that re-entered Dev recently as worth noting
          }
        }
      }
    }

    return alerts
  }

  // ── Date helpers ────────────────────────────────────────────

  private getYesterday(): string {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  }

  private formatDateBR(dateStr: string): string {
    const [, month, day] = dateStr.split('-')
    return `${day}-${month}-${dateStr.slice(0, 4)}`
  }

  private formatDateLong(dateStr: string): string {
    const [year, month, day] = dateStr.split('-')
    const monthNum = parseInt(month, 10)
    return `${parseInt(day, 10)} de ${MESES[monthNum - 1]} de ${year}`
  }

  // ── Haiku analysis ───────────────────────────────────────────

  private async runHaikuAnalysis(
    settings: AppSettings,
    analysisInput: { sprintOverview: string; perPersonSummary: string; alerts: string; pipelineHealth?: string; sustentacao?: string },
  ): Promise<string | null> {
    const prompt = buildDailyAnalysisPrompt(analysisInput)
    const model = settings.claudeDefaultModel ?? 'haiku'

    log.info('Haiku analysis: iniciando', { model, promptBytes: Buffer.byteLength(prompt, 'utf8') })

    const result = await runClaudePrompt(settings.claudeBinPath, prompt, 60_000, 0, model)

    if (!result.success || !result.data) {
      log.warn('Haiku analysis: falhou', { error: result.error })
      return null
    }

    const data = result.data as { observacoes?: Array<{ titulo?: string; texto?: string; pontos?: string[]; pessoa: string | null; tipo: string }> }
    if (!data.observacoes || !Array.isArray(data.observacoes) || data.observacoes.length === 0) {
      log.warn('Haiku analysis: resposta sem observações válidas')
      return null
    }

    const lines: string[] = [
      '', '## Observações (IA)', '',
      `> *Análise gerada por IA (${model}) com dados de até 1h atrás. Tratar como hipóteses a confirmar.*`,
      '',
    ]
    const typeIcons: Record<string, string> = {
      padrao: '🔍',
      risco: '⚠️',
      destaque: '⭐',
      sugestao: '💡',
    }

    // Filter observations that overlap significantly with deterministic alerts
    const alertsLower = (analysisInput.alerts || '').toLowerCase()
    const deduped = data.observacoes.slice(0, 6).filter(obs => {
      const text = (obs.titulo ?? obs.texto ?? '').toLowerCase()
      const words = text.split(/\s+/).filter(w => w.length > 4)
      if (words.length === 0) return true
      const overlapCount = words.filter(w => alertsLower.includes(w)).length
      return overlapCount / words.length < 0.5
    })

    for (const obs of deduped) {
      const icon = typeIcons[obs.tipo] ?? '🧠'
      const pessoa = obs.pessoa ? ` [${obs.pessoa}]` : ''
      const titulo = obs.titulo ?? obs.texto ?? ''
      lines.push(`### ${icon} ${titulo}${pessoa}`)
      lines.push('')
      if (obs.pontos && obs.pontos.length > 0) {
        for (const ponto of obs.pontos) {
          lines.push(`- ${ponto}`)
        }
      } else if (obs.texto && obs.texto !== titulo) {
        lines.push(`- ${obs.texto}`)
      }
      lines.push('')
    }

    log.info('Haiku analysis: sucesso', { observacoes: data.observacoes.length })
    return lines.join('\n')
  }

  // ── Report builder ──────────────────────────────────────────

  private buildReport(
    personReports: PersonDailyData[],
    sprintOverview: SprintOverview | null,
    today: string,
    allActiveTasks?: TaskCycleInfo[],
    doneTasksPhaseTime?: Map<string, number[]>,
    sustentacao?: SupportBoardSnapshot | null,
  ): { content: string; analysisInput: { sprintOverview: string; perPersonSummary: string; alerts: string; pipelineHealth?: string; sustentacao?: string } } {
    const lines: string[] = []
    const formattedDate = this.formatDateLong(today)
    const collectedAt = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

    lines.push(`# Daily Report — ${formattedDate}`, '')
    lines.push(`> Dados coletados às ${collectedAt}.`, '')
    lines.push(`> 💻 commit · 👀 review · 🔀 PR merged · 🔵 em andamento · 🚀 entregue`, '')

    // ── TL;DR executivo ──────────────────────────────────────
    {
      const pctDone = sprintOverview && sprintOverview.totalIssues > 0
        ? Math.round((sprintOverview.totalDone / sprintOverview.totalIssues) * 100) : null
      const totalBlockers = personReports.reduce((s, r) => s + r.blockers.length, 0)
      const withoutAnyTask = personReports.filter(r =>
        r.activeTasks.length === 0 && r.queueTasks.length === 0 && (r.sprintSummary?.total ?? 0) === 0
      )

      const parts: string[] = []
      if (pctDone !== null) parts.push(`Sprint ${pctDone}% concluída`)
      if (totalBlockers > 0) parts.push(`${totalBlockers} bloqueio(s)`)
      if (withoutAnyTask.length > 0) parts.push(`${withoutAnyTask.length} pessoa(s) sem task no sprint`)

      if (parts.length > 0) {
        lines.push(`> **TL;DR:** ${parts.join(' · ')}`, '')
      }
    }

    // ── Sprint Overview ───────────────────────────────────────
    if (sprintOverview) {
      lines.push(`## Sprint: ${sprintOverview.nome}`, '')
      lines.push(`> ${sprintOverview.totalDone}/${sprintOverview.totalIssues} issues concluídas | ${sprintOverview.totalSPDone}/${sprintOverview.totalSP} SP entregues`, '')

      if (sprintOverview.inicio && sprintOverview.fim) {
        const start = new Date(sprintOverview.inicio)
        const end = new Date(sprintOverview.fim)
        const now = new Date(today)
        const totalDays = Math.ceil((end.getTime() - start.getTime()) / 86_400_000)
        const elapsed = Math.max(0, Math.ceil((now.getTime() - start.getTime()) / 86_400_000))
        const pctElapsed = Math.round((elapsed / totalDays) * 100)
        const pctDone = sprintOverview.totalIssues > 0
          ? Math.round((sprintOverview.totalDone / sprintOverview.totalIssues) * 100) : 0
        lines.push(`> 📅 Dia ${elapsed} de ${totalDays} (${pctElapsed}% tempo) | ${pctDone}% issues concluídas`)
        lines.push('')
      }

      if (sprintOverview.byPerson.length > 0) {
        lines.push('| Pessoa | Done | Dev | CR | QA | Backlog | Total | SP (done/total) |')
        lines.push('|--------|------|-----|----|----|------|-------|-----------------|')
        for (const p of sprintOverview.byPerson) {
          const devCell = p.inDev > 0 ? String(p.inDev) : '-'
          const reviewCell = p.inReview > 0 ? String(p.inReview) : '-'
          const qaCell = p.inQa > 0 ? String(p.inQa) : '-'
          const queueCell = p.inQueue > 0 ? String(p.inQueue) : '-'
          lines.push(`| ${p.nome} | ${p.done} | ${devCell} | ${reviewCell} | ${qaCell} | ${queueCell} | ${p.total} | ${p.spDone}/${p.spTotal} |`)
        }
        lines.push('')
        lines.push('> _SP contabilizados quando a issue atinge status Done no Jira._', '')
      }
    }

    // ── Pipeline Health (per D-07) ────────────────────────────
    let pipelineHealthText = ''
    if (allActiveTasks && allActiveTasks.length > 0) {
      const pipelineData = computePipelineHealth(allActiveTasks, doneTasksPhaseTime ?? new Map())
      if (pipelineData.length > 0) {
        lines.push('## Pipeline Health', '')
        lines.push('| Fase | Tasks | Tempo medio | Mais antiga | Baseline (sprint) | Status |')
        lines.push('|------|-------|-------------|-------------|-------------------|--------|')
        const pipelineLines: string[] = []
        for (const phase of pipelineData) {
          const tempoStr = phase.tempoMedio !== null ? `${phase.tempoMedio.toFixed(1)}d` : '\u2014'
          const antigaStr = phase.maisAntiga ? `${phase.maisAntiga.key} (${phase.maisAntiga.dias}d)` : '\u2014'
          const baselineStr = phase.baseline !== null ? `${phase.baseline.toFixed(1)}d` : '\u2014'
          const statusIcon = phase.status === 'ok' ? '\u2705' : phase.status === 'warning' ? '\u26A0\uFE0F' : '\uD83D\uDD34'
          const line = `| ${phase.fase} | ${phase.tasks} | ${tempoStr} | ${antigaStr} | ${baselineStr} | ${statusIcon} |`
          lines.push(line)
          let phLine = `${phase.fase}: ${phase.tasks} tasks, tempo medio ${tempoStr}, baseline ${baselineStr}, status ${phase.status}`
          if (phase.maisAntiga) {
            phLine += `\n  Mais antiga: ${phase.maisAntiga.key} (${phase.maisAntiga.dias}d)`
          }
          pipelineLines.push(phLine)
        }
        lines.push('')
        pipelineHealthText = pipelineLines.join('\n')
      }
    }

    // ── Métricas de Fluxo (cycle time baseline) ────────────────
    const baselines = personReports.filter(r => r.cycleTimeBaseline != null)
    if (baselines.length > 0) {
      const teamAvg = baselines.reduce((s, r) => s + r.cycleTimeBaseline!, 0) / baselines.length
      lines.push('## Métricas de Fluxo', '')
      lines.push(`> Cycle time médio do time (3 meses): **${teamAvg.toFixed(1)} dias**`, '')
    }

    // ── Alerts (deterministic insights) ───────────────────────
    const alerts = this.computeAlerts(personReports, sprintOverview)
    if (alerts.length > 0) {
      lines.push('## Alertas', '')
      for (const alert of alerts) {
        lines.push(`- ${alert}`)
      }
      lines.push('')
    }

    // ── Per-person sections ───────────────────────────────────
    const allBlockers: Array<{
      person: string
      key: string
      summary: string
      days: number
      flagged: boolean
    }> = []

    for (const report of personReports) {
      lines.push(`## ${report.nome}`, '')

      const { activity } = report

      // ── O que fez ontem ──
      lines.push('### O que fez ontem', '')
      let hasActivity = false

      if (activity.jiraActivity.length > 0) {
        for (const item of activity.jiraActivity) {
          lines.push(`- **${item.issueKey}**: ${item.summary} → _${item.status}_`)
          hasActivity = true
        }
      }

      if (activity.githubCommits.length > 0) {
        // Agrupar commits por repo (per D-12: contagem resumida em vez de listing individual)
        const commitsByRepo = new Map<string, number>()
        for (const commit of activity.githubCommits) {
          commitsByRepo.set(commit.repo, (commitsByRepo.get(commit.repo) ?? 0) + 1)
        }
        for (const [repo, count] of commitsByRepo) {
          lines.push(`- 💻 ${count} commit${count > 1 ? 's' : ''} em \`${repo}\``)
        }
        hasActivity = true
      }

      if (activity.githubPRsMerged.length > 0) {
        for (const pr of activity.githubPRsMerged) {
          lines.push(`- 🔀 PR merged \`${pr.repo}#${pr.number}\`: ${pr.title}`)
          hasActivity = true
        }
      }

      if (activity.githubReviews.length > 0) {
        // Deduplicate reviews by PR, keeping most significant state
        const reviewsByPR = new Map<string, typeof activity.githubReviews[0]>()
        const stateRank: Record<string, number> = { approved: 3, changes_requested: 2, commented: 1, dismissed: 0 }
        for (const review of activity.githubReviews) {
          const key = `${review.repo}#${review.prNumber}`
          const existing = reviewsByPR.get(key)
          if (!existing || (stateRank[review.state] ?? 0) > (stateRank[existing.state] ?? 0)) {
            reviewsByPR.set(key, review)
          }
        }

        const commentsByPR = new Map<string, GitHubReviewComment[]>()
        for (const c of activity.githubReviewComments) {
          const key = `${c.repo}#${c.prNumber}`
          if (!commentsByPR.has(key)) commentsByPR.set(key, [])
          commentsByPR.get(key)!.push(c)
        }

        for (const review of reviewsByPR.values()) {
          const stateLabel = review.state === 'approved' ? 'approved'
            : review.state === 'changes_requested' ? 'changes requested'
            : 'commented'
          lines.push(`- 👀 Review em \`${review.repo}#${review.prNumber}\` — ${stateLabel}`)
          hasActivity = true

          const prKey = `${review.repo}#${review.prNumber}`
          const comments = commentsByPR.get(prKey) ?? []
          if (comments.length > 0) {
            const maxComments = 3
            const shown = comments.slice(0, maxComments)
            for (const comment of shown) {
              const body = comment.body.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
              if (body) {
                const truncated = body.length > 280 ? body.slice(0, 277) + '...' : body
                lines.push(`  > "${truncated}"`)
              }
            }
            if (comments.length > maxComments) {
              lines.push(`  > _(+${comments.length - maxComments} comentários)_`)
            }
          }
        }
      }

      if (!hasActivity) {
        lines.push('- *Sem atividade registrada ontem*')
      }
      lines.push('')

      // ── O que avançou ──
      lines.push('### O que avançou', '')
      const advanced: string[] = []

      const doneOrReviewActivity = activity.jiraActivity.filter(item => {
        const status = item.status.toLowerCase()
        return DONE_STATUSES.some(s => status.includes(s)) ||
               REVIEW_STATUSES.some(s => status.includes(s))
      })

      for (const item of doneOrReviewActivity) {
        const isDone = DONE_STATUSES.some(s => item.status.toLowerCase().includes(s))
        const icon = isDone ? '✅' : '🔄'
        advanced.push(`- ${icon} **${item.issueKey}**: ${item.summary} → _${item.status}_`)
      }

      for (const pr of activity.githubPRsMerged) {
        advanced.push(`- 🚀 PR merged \`${pr.repo}#${pr.number}\`: ${pr.title}`)
      }

      if (advanced.length > 0) {
        lines.push(...advanced)
      } else {
        const hadGitHub = activity.githubCommits.length > 0 || activity.githubReviews.length > 0
        lines.push(hadGitHub
          ? '- *Atividade em código/reviews mas nenhuma task mudou de status*'
          : '- *Nenhum avanço registrado*')
      }
      lines.push('')

      // ── Trabalhando agora (dev/review/qa, with cycle time) ──
      lines.push('### Trabalhando agora', '')
      if (report.activeTasks.length > 0) {
        for (const task of report.activeTasks) {
          const sp = task.storyPoints ? ` (${task.storyPoints} SP)` : ''
          const statusIcon = (task.statusCategory === 'review' || task.statusCategory === 'queue_review') ? '🔄'
            : task.statusCategory === 'qa' ? '🧪'
            : task.statusCategory === 'queue_deploy' ? '🚀' : '🔵'
          const daysLabel = task.daysInStatus > 0 ? ` — há ${task.daysInStatus}d` : ''
          const alertIcon = task.alert === 'warning' ? ' ⚠️' : ''
          const flagIcon = task.flagged ? ' 🚩' : ''
          const baselineNote = report.cycleTimeBaseline != null
            ? (task.daysInStatus > report.cycleTimeBaseline ? ` (baseline: ${report.cycleTimeBaseline}d)` : '')
            : (task.daysInStatus > 3 ? ' (sem baseline)' : '')
          lines.push(`- ${statusIcon} **${task.key}**${flagIcon}: ${task.summary}${sp} — _${task.status}_${daysLabel}${baselineNote}${alertIcon}`)
        }
      } else {
        lines.push('- *Nenhuma task em andamento*')
      }
      lines.push('')

      // ── Impedimentos ──
      lines.push('### Impedimentos', '')
      if (report.blockers.length > 0) {
        for (const b of report.blockers) {
          const flagIcon = b.flagged ? ' 🚩' : ''
          lines.push(`- 🔴 **${b.key}** — "${b.summary}" (há ${b.days} dias)${flagIcon}`)
          if (b.comments.length > 0) {
            const latest = b.comments[0]
            const truncated = latest.length > 200 ? latest.slice(0, 197) + '...' : latest
            lines.push(`  > ${truncated}`)
          }
          allBlockers.push({
            person: report.nome,
            key: b.key,
            summary: b.summary,
            days: b.days,
            flagged: b.flagged,
          })
        }
      } else {
        const hasAnyActivity = activity.jiraActivity.length > 0 ||
          activity.githubCommits.length > 0 || activity.githubReviews.length > 0
        if (!hasAnyActivity && report.activeTasks.length > 0) {
          const maxDays = Math.max(...report.activeTasks.map(t => t.daysInStatus))
          if (maxDays >= 2) {
            lines.push('- ⚠️ *Sem impedimento formal, mas sem updates no Jira/GitHub — verificar se há bloqueio*')
          } else {
            lines.push('- *Nenhum impedimento*')
          }
        } else {
          lines.push('- *Nenhum impedimento*')
        }
      }
      lines.push('')
    }

    // ── Team-level: Bloqueios ─────────────────────────────────

    if (allBlockers.length > 0) {
      lines.push('## Bloqueios do Time', '')
      for (const b of allBlockers) {
        const severity = b.days > 3 ? '🔴' : b.days > 1 ? '🟡' : '🔵'
        const flag = b.flagged ? ' 🚩' : ''
        lines.push(`- ${severity} ${b.key} (${b.person}) — há ${b.days} dias${flag}`)
      }
      lines.push('')
    }

    // ── Sustentação ──────────────────────────────────────────
    let sustentacaoText = ''
    if (sustentacao) {
      const lines_sust: string[] = []
      lines_sust.push('## Sustentação', '')
      lines_sust.push(`> Atualizado em: ${sustentacao.atualizadoEm.slice(0, 10)} | Abertos: ${sustentacao.ticketsAbertos} | Breach: ${sustentacao.ticketsEmBreach.length}`, '')

      if (sustentacao.complianceRate7d !== null) {
        lines_sust.push(`> SLA compliance 7d: **${sustentacao.complianceRate7d}%**${sustentacao.complianceRate30d !== null ? ` | 30d: **${sustentacao.complianceRate30d}%**` : ''}`, '')
      }

      // Cruzar porAssignee com pessoas do time
      const assigneeEntries = Object.entries(sustentacao.porAssignee)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])

      if (assigneeEntries.length > 0) {
        lines_sust.push('### Carga por pessoa', '')
        for (const [slug, count] of assigneeEntries) {
          const person = personReports.find(p => p.slug === slug)
          const nome = person?.nome ?? slug
          const alert = count >= 5 ? ' ⚠️' : count >= 3 ? ' 🔵' : ''
          lines_sust.push(`- **${nome}**: ${count} ticket(s) aberto(s)${alert}`)
        }
        lines_sust.push('')
      }

      if (sustentacao.ticketsEmBreach.length > 0) {
        lines_sust.push('### Tickets em Breach de SLA', '')
        for (const ticket of sustentacao.ticketsEmBreach.slice(0, 5)) {
          const assignee = ticket.assignee ?? 'sem assignee'
          lines_sust.push(`- **${ticket.key}** — ${ticket.summary} (${ticket.ageDias}d, ${assignee})`)
        }
        if (sustentacao.ticketsEmBreach.length > 5) {
          lines_sust.push(`- _...e mais ${sustentacao.ticketsEmBreach.length - 5} tickets_`)
        }
        lines_sust.push('')
      }

      // Vazão semanal (últimas 4 semanas)
      const inOutRecent = (sustentacao.inOutSemanal ?? []).slice(-4)
      if (inOutRecent.length > 0) {
        lines_sust.push('### Vazão Semanal', '')
        lines_sust.push('| Semana | Entrada | Saída | Saldo |')
        lines_sust.push('|--------|---------|-------|-------|')
        const mesesPt = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
        for (const entry of inOutRecent) {
          const mon = new Date(entry.semana + 'T00:00:00')
          const sun = new Date(mon)
          sun.setDate(mon.getDate() + 6)
          const label = `${mon.getDate()}/${mesesPt[mon.getMonth()]}-${sun.getDate()}/${mesesPt[sun.getMonth()]}`
          const saldo = entry.in - entry.out
          const saldoStr = saldo > 0 ? `+${saldo}` : saldo === 0 ? '0' : `${saldo}`
          lines_sust.push(`| ${label} | ${entry.in} | ${entry.out} | ${saldoStr} |`)
        }
        lines_sust.push('')
      }

      // Alertas críticos de sustentação (com contexto rico quando disponível)
      const alertasCriticos = (sustentacao.alertas ?? []).filter(a => a.severidade === 'critico')
      if (alertasCriticos.length > 0) {
        lines_sust.push('### Alertas de Sustentação', '')
        for (const alerta of alertasCriticos) {
          if (alerta.summary) {
            const assigneeStr = alerta.assignee ? `, ${alerta.assignee}` : ''
            const statusStr = alerta.status ? `, ${alerta.status}` : ''
            lines_sust.push(`- **${alerta.ticketKey}** — ${alerta.summary} (${alerta.mensagem.match(/(\d+)d aberto/)?.[1] ?? '?'}d${statusStr}${assigneeStr})`)
            if (alerta.lastComment) {
              lines_sust.push(`  > "${alerta.lastComment.body.slice(0, 120)}${alerta.lastComment.body.length > 120 ? '…' : ''}" — ${alerta.lastComment.author}`)
            }
          } else {
            lines_sust.push(`- ${alerta.mensagem}`)
          }
        }
        lines_sust.push('')
      }

      lines.push(...lines_sust)

      // Texto resumido para o analysisInput da IA
      const alertasTextParts: string[] = []
      if (alertasCriticos.length > 0) {
        alertasTextParts.push(`Alertas criticos sustentação (${alertasCriticos.length}):`)
        for (const a of alertasCriticos.slice(0, 5)) {
          if (a.summary) {
            const commentSnippet = a.lastComment ? ` | ultimo comentario: "${a.lastComment.body.slice(0, 100)}"` : ''
            alertasTextParts.push(`  - ${a.ticketKey}: ${a.summary} (${a.status ?? '?'}, ${a.assignee ?? 'sem assignee'})${commentSnippet}`)
          } else {
            alertasTextParts.push(`  - ${a.mensagem}`)
          }
        }
      }

      // Tendência de vazão para a IA
      let vazaoTextParts: string[] = []
      if (inOutRecent.length >= 2) {
        const vazaoDesc = inOutRecent.map(e => `+${e.in}/-${e.out}`).join(', ')
        const totalIn = inOutRecent.reduce((s, e) => s + e.in, 0)
        const totalOut = inOutRecent.reduce((s, e) => s + e.out, 0)
        const tendencia = totalIn > totalOut * 1.15 ? 'acumulando' : totalOut > totalIn * 1.15 ? 'reduzindo' : 'estável'
        vazaoTextParts = [
          `Vazão ${inOutRecent.length} semanas: ${vazaoDesc}`,
          `Tendência: ${tendencia} (entrada total ${totalIn}, saída total ${totalOut})`,
        ]
      }

      sustentacaoText = [
        `Board: ${sustentacao.ticketsAbertos} abertos, ${sustentacao.ticketsEmBreach.length} em breach`,
        sustentacao.complianceRate7d !== null ? `SLA compliance 7d: ${sustentacao.complianceRate7d}%` : '',
        assigneeEntries.length > 0
          ? 'Carga por pessoa: ' + assigneeEntries.map(([slug, n]) => {
              const nome = personReports.find(p => p.slug === slug)?.nome ?? slug
              return `${nome} (${n} tickets)`
            }).join(', ')
          : '',
        ...vazaoTextParts,
        ...alertasTextParts,
      ].filter(Boolean).join('\n')
    }

    // Build analysis input for Haiku
    const sprintSummaryText = sprintOverview
      ? `${sprintOverview.nome}: ${sprintOverview.totalDone}/${sprintOverview.totalIssues} issues, ${sprintOverview.totalSPDone}/${sprintOverview.totalSP} SP\n` +
        sprintOverview.byPerson.map(p => `  ${p.nome}: ${p.done}/${p.total} tasks, ${p.spDone}/${p.spTotal} SP`).join('\n')
      : ''

    const perPersonLines: string[] = []
    for (const report of personReports) {
      const { activity } = report
      const parts: string[] = [`${report.nome}:`]

      if (activity.jiraActivity.length > 0) {
        parts.push(`  Jira ontem: ${activity.jiraActivity.map(i => `${i.issueKey} (${i.status})`).join(', ')}`)
      }
      if (activity.githubCommits.length > 0) {
        parts.push(`  Commits: ${activity.githubCommits.length} em ${[...new Set(activity.githubCommits.map(c => c.repo))].join(', ')}`)
      }
      if (activity.githubReviews.length > 0) {
        parts.push(`  Reviews: ${activity.githubReviews.length} (${activity.githubReviews.map(r => `${r.repo}#${r.prNumber} ${r.state}`).join(', ')})`)
      }
      if (activity.githubPRsMerged.length > 0) {
        parts.push(`  PRs merged: ${activity.githubPRsMerged.map(p => `${p.repo}#${p.number}`).join(', ')}`)
      }
      if (report.activeTasks.length > 0) {
        parts.push(`  Trabalhando: ${report.activeTasks.map(t => `${t.key} (${t.status}, ${t.daysInStatus}d)`).join(', ')}`)
      }
      if (report.blockers.length > 0) {
        parts.push(`  Bloqueios: ${report.blockers.map(b => `${b.key} (${b.days}d)`).join(', ')}`)
        for (const b of report.blockers) {
          if (b.comments.length > 0) {
            parts.push(`  Comentários blocker (${b.key}): ${b.comments.slice(0, 2).map(c => c.slice(0, 150)).join(' | ')}`)
          }
        }
      }

      // Comentários Jira de tasks stuck (contexto para diagnóstico)
      const stuckWithComments = report.activeTasks.filter(t => t.jiraComments && t.jiraComments.length > 0)
      for (const task of stuckWithComments) {
        parts.push(`  Comentários Jira (${task.key}): ${task.jiraComments!.slice(0, 2).map(c => c.slice(0, 150)).join(' | ')}`)
      }

      // PR review comments substantivos (contexto para análise cruzada)
      if (activity.githubReviewComments.length > 0) {
        const significantComments = activity.githubReviewComments
          .filter(c => c.body.trim().length > 20)
          .slice(0, 3)
        if (significantComments.length > 0) {
          parts.push(`  PR review comments: ${significantComments.map(c => `${c.repo}#${c.prNumber}: "${c.body.replace(/\n/g, ' ').trim().slice(0, 150)}"`).join(' | ')}`)
        }
      }

      if (!activity.jiraActivity.length && !activity.githubCommits.length && !activity.githubReviews.length) {
        parts.push('  Sem atividade ontem')
      }

      perPersonLines.push(parts.join('\n'))
    }

    const analysisInput = {
      sprintOverview: sprintSummaryText,
      perPersonSummary: perPersonLines.join('\n\n'),
      alerts: alerts.join('\n'),
      pipelineHealth: pipelineHealthText || undefined,
      sustentacao: sustentacaoText || undefined,
    }

    return { content: lines.join('\n'), analysisInput }
  }
}

// ── Pure functions ──────────────────────────────────────────────

function categorizeStatus(status: string): PipelinePhase {
  const s = status.toLowerCase()
  // QA checked first — "To Do QA" + "QA" agrupados (per D-02)
  if (QA_STATUSES.some(q => s.includes(q))) return 'qa'
  // Review: "To Do CR" → queue_review, "CR" / "Code Review" → review (per D-02)
  if (REVIEW_STATUSES.some(r => s.includes(r))) {
    return s.includes('to do') ? 'queue_review' : 'review'
  }
  // Deploy queue: "Ready to Deploy" etc.
  if (DEPLOY_STATUSES.some(d => s.includes(d))) return 'queue_deploy'
  // Generic queue patterns (Ready for Dev, Backlog, To Do, etc.)
  if (QUEUE_PATTERNS.some(q => s.includes(q))) return 'queue_dev'
  // Dev statuses
  if (DEV_STATUSES.some(d => s.includes(d))) return 'dev'
  return 'queue_dev'
}

function shortName(nome: string): string {
  const parts = nome.trim().split(/\s+/)
  if (parts.length <= 2) return nome
  return `${parts[0]} ${parts[parts.length - 1]}`
}

function computeDaysInCurrentStatus(changelog: JiraChangelogEntry[], currentStatus: string): number {
  // Find the last status transition TO the current status
  const statusTransitions = changelog
    .flatMap(entry => entry.items
      .filter(item => item.field === 'status')
      .map(item => ({ to: item.toString, created: entry.created }))
    )
    .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()) // newest first

  const lastTransition = statusTransitions.find(t =>
    t.to?.toLowerCase() === currentStatus.toLowerCase()
  )

  if (lastTransition) {
    return Math.floor((Date.now() - new Date(lastTransition.created).getTime()) / 86_400_000)
  }

  // Fallback: no transition found — return 0
  return 0
}

const PIPELINE_PHASE_LABELS: Record<PipelinePhase, string> = {
  queue_dev: 'Ready for Dev',
  dev: 'Dev',
  queue_review: 'To Do CR',
  review: 'CR',
  qa: 'QA',
  queue_deploy: 'Ready to Deploy',
}

const PIPELINE_DEFAULT_THRESHOLDS: Partial<Record<PipelinePhase, number>> = {
  dev: 5,
  queue_review: 3,
  review: 3,
  qa: 3,
  queue_deploy: 2,
}

const PIPELINE_PHASE_ORDER: PipelinePhase[] = ['queue_dev', 'dev', 'queue_review', 'review', 'qa', 'queue_deploy']

function computePipelineHealth(
  activeTasks: TaskCycleInfo[],
  doneTasksPhaseTime: Map<string, number[]>,
): PipelinePhaseData[] {
  const result: PipelinePhaseData[] = []

  for (const phase of PIPELINE_PHASE_ORDER) {
    const tasksInPhase = activeTasks.filter(t => t.statusCategory === phase)
    if (tasksInPhase.length === 0) continue

    const tempoMedio = tasksInPhase.reduce((s, t) => s + t.daysInStatus, 0) / tasksInPhase.length

    const oldest = tasksInPhase.reduce((max, t) => t.daysInStatus > max.daysInStatus ? t : max, tasksInPhase[0])
    const maisAntiga = { key: oldest.key, dias: oldest.daysInStatus }

    const doneTimes = doneTasksPhaseTime.get(phase) ?? []
    const baseline = doneTimes.length >= 3
      ? doneTimes.reduce((s, v) => s + v, 0) / doneTimes.length
      : null

    const ref = baseline ?? PIPELINE_DEFAULT_THRESHOLDS[phase] ?? null
    let status: 'ok' | 'warning' | 'critical' = 'ok'
    if (ref !== null) {
      if (tempoMedio > 2 * ref) status = 'critical'
      else if (tempoMedio > ref) status = 'warning'
    }

    result.push({
      fase: PIPELINE_PHASE_LABELS[phase],
      phaseKey: phase,
      tasks: tasksInPhase.length,
      tempoMedio,
      maisAntiga,
      baseline,
      status,
    })
  }

  return result
}

function computePhaseTimesFromDoneTasks(
  doneTasks: JiraIssue[],
  changelog: Map<string, JiraChangelogEntry[]>,
): Map<string, number[]> {
  const result = new Map<string, number[]>()

  for (const task of doneTasks) {
    const entries = changelog.get(task.key)
    if (!entries) continue

    // Collect status transitions sorted chronologically
    const transitions = entries
      .flatMap(entry => entry.items
        .filter(item => item.field === 'status')
        .map(item => ({
          fromString: item.fromString ?? '',
          toString: item.toString ?? '',
          created: entry.created,
        }))
      )
      .sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime())

    let prevTime = new Date(task.created).getTime()

    for (const tr of transitions) {
      const trTime = new Date(tr.created).getTime()
      const fromPhase = categorizeStatus(tr.fromString)
      const toPhase = categorizeStatus(tr.toString)

      if (fromPhase !== toPhase) {
        const days = (trTime - prevTime) / 86_400_000
        if (days >= 0) {
          if (!result.has(fromPhase)) result.set(fromPhase, [])
          result.get(fromPhase)!.push(days)
        }
      }
      prevTime = trTime
    }
  }

  return result
}

async function batchParallel<T, R>(items: T[], fn: (item: T) => Promise<R>, batchSize: number): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
  }
  return results
}

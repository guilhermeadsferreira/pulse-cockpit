import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { PersonRegistry, type PersonConfig } from '../registry/PersonRegistry'
import { SettingsManager, type AppSettings } from '../registry/SettingsManager'
import { JiraClient, JiraConfig, type DailyStandupItem, type JiraIssue, type JiraChangelogEntry } from './JiraClient'
import { GitHubClient, GitHubConfig, type GitHubCommit, type GitHubPR, type GitHubReview, type GitHubReviewComment } from './GitHubClient'
import { ExternalDataPass } from './ExternalDataPass'
import { runClaudePrompt } from '../ingestion/ClaudeRunner'
import { buildDailyAnalysisPrompt } from '../prompts/daily-analysis.prompt'
import { Logger } from '../logging/Logger'

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
  statusCategory: 'dev' | 'review' | 'queue'
  alert: 'normal' | 'warning' | null
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

const DEV_STATUSES = ['dev', 'progress', 'doing', 'development', 'em andamento']
const REVIEW_STATUSES = ['review', 'code review', 'em revisão']
const DONE_STATUSES = ['done', 'closed', 'concluído', 'resolved']
const QUEUE_PATTERNS = ['ready', 'backlog', 'to do', 'todo', 'selected', 'awaiting', 'a fazer']

// Thresholds para alertas de cycle time por task
const DEV_DAYS_WARNING = 5
const REVIEW_DAYS_WARNING = 3
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

    const registry = new PersonRegistry(this.workspacePath)
    const people = registry.list().filter(p => p.relacao === 'liderado')
    const settings = SettingsManager.load()

    // 1. Fetch sprint data ONCE (not per-person)
    const { sprintOverview, sprintIssuesByPerson, jiraClient } = await this.fetchSprintData(people, settings)

    // 2. Fetch yesterday activity + cycle time for ALL people in parallel (batches of 3)
    const personReports = await this.fetchAllPeopleData(people, settings, sprintIssuesByPerson, jiraClient)

    // 3. Build deterministic report
    const { content, analysisInput } = this.buildReport(personReports, sprintOverview, today)

    // 4. Enrich with Haiku analysis (graceful degradation)
    let finalContent = content
    if (settings.claudeBinPath) {
      try {
        const aiSection = await this.runHaikuAnalysis(settings, analysisInput)
        if (aiSection) {
          finalContent = content + aiSection
        }
      } catch (err) {
        log.warn('Haiku analysis falhou (graceful)', { error: err instanceof Error ? err.message : String(err) })
      }
    }

    mkdirSync(this.relatoriosDir, { recursive: true })
    writeFileSync(filePath, finalContent, 'utf-8')
    log.info('daily report gerado', { date: today, path: filePath })
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
  }> {
    const sprintIssuesByPerson = new Map<string, JiraIssue[]>()

    if (!settings.jiraEnabled || !settings.jiraBaseUrl || !settings.jiraApiToken || !settings.jiraBoardId) {
      return { sprintOverview: null, sprintIssuesByPerson, jiraClient: null }
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
        return { sprintOverview: null, sprintIssuesByPerson, jiraClient }
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
        byPerson.push({ nome: shortName(person.nome), total: issues.length, done, spTotal: sp, spDone })
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

      return { sprintOverview, sprintIssuesByPerson, jiraClient }
    } catch (err) {
      log.warn('falha ao buscar sprint data', { error: err instanceof Error ? err.message : String(err) })
      return { sprintOverview: null, sprintIssuesByPerson, jiraClient: null }
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

      // Categorize tasks: dev, review, or queue
      const devOrReviewTasks: JiraIssue[] = []
      const queueTasks: JiraIssue[] = []

      for (const task of indeterminateTasks) {
        const cat = categorizeStatus(task.status)
        if (cat === 'dev' || cat === 'review') {
          devOrReviewTasks.push(task)
        } else {
          queueTasks.push(task)
        }
      }

      // Fetch cycle time for active tasks (changelog per task — few calls)
      const activeTasks = await this.enrichWithCycleTime(devOrReviewTasks, jiraClient)

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
      const threshold = cat === 'review' ? REVIEW_DAYS_WARNING : DEV_DAYS_WARNING
      const alert = daysInStatus > threshold ? 'warning' as const : 'normal' as const

      results.push({
        key: task.key,
        summary: task.summary,
        status: task.status,
        storyPoints: task.storyPoints,
        daysInStatus,
        statusCategory: cat,
        alert,
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
      // B1: Task parada (cycle time warning)
      for (const task of report.activeTasks) {
        if (task.alert === 'warning') {
          const threshold = task.statusCategory === 'review' ? REVIEW_DAYS_WARNING : DEV_DAYS_WARNING
          alerts.push(`⚠️ **${task.key}** (${report.nome}) está em _${task.status}_ há ${task.daysInStatus} dias — acima do esperado (>${threshold}d)`)
        }
      }

      // B2: Pessoa sem atividade com tasks em andamento
      const { activity } = report
      const hasActivity = activity.jiraActivity.length > 0 ||
        activity.githubCommits.length > 0 ||
        activity.githubReviews.length > 0
      if (!hasActivity && report.activeTasks.length > 0) {
        alerts.push(`⚠️ **${report.nome}** sem atividade ontem mas tem ${report.activeTasks.length} task(s) em andamento — possível bloqueio silencioso`)
      }

      // B3: WIP alto
      if (report.activeTasks.length > WIP_WARNING_THRESHOLD) {
        alerts.push(`⚠️ **${report.nome}** com ${report.activeTasks.length} tasks simultâneas em desenvolvimento — risco de context switching`)
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
    analysisInput: { sprintOverview: string; perPersonSummary: string; alerts: string },
  ): Promise<string | null> {
    const prompt = buildDailyAnalysisPrompt(analysisInput)
    const model = settings.claudeDefaultModel ?? 'haiku'

    log.info('Haiku analysis: iniciando', { model, promptBytes: Buffer.byteLength(prompt, 'utf8') })

    const result = await runClaudePrompt(settings.claudeBinPath, prompt, 60_000, 0, model)

    if (!result.success || !result.data) {
      log.warn('Haiku analysis: falhou', { error: result.error })
      return null
    }

    const data = result.data as { observacoes?: Array<{ texto: string; pessoa: string | null; tipo: string }> }
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
      const words = obs.texto.toLowerCase().split(/\s+/).filter(w => w.length > 4)
      if (words.length === 0) return true
      const overlapCount = words.filter(w => alertsLower.includes(w)).length
      return overlapCount / words.length < 0.5
    })

    for (const obs of deduped) {
      const icon = typeIcons[obs.tipo] ?? '🧠'
      const pessoa = obs.pessoa ? ` [${obs.pessoa}]` : ''
      lines.push(`- ${icon}${pessoa} ${obs.texto}`)
    }
    lines.push('')

    log.info('Haiku analysis: sucesso', { observacoes: data.observacoes.length })
    return lines.join('\n')
  }

  // ── Report builder ──────────────────────────────────────────

  private buildReport(
    personReports: PersonDailyData[],
    sprintOverview: SprintOverview | null,
    today: string,
  ): { content: string; analysisInput: { sprintOverview: string; perPersonSummary: string; alerts: string } } {
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
      const inactiveWithTasks = personReports.filter(r => {
        const a = r.activity
        return !a.jiraActivity.length && !a.githubCommits.length && !a.githubReviews.length
          && r.activeTasks.length > 0
      })

      const parts: string[] = []
      if (pctDone !== null) parts.push(`Sprint ${pctDone}% concluída`)
      if (totalBlockers > 0) parts.push(`${totalBlockers} bloqueio(s)`)
      if (inactiveWithTasks.length > 0) parts.push(`${inactiveWithTasks.length} pessoa(s) sem atividade`)

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
        lines.push('| Pessoa | Tasks (done/total) | SP (done/total) |')
        lines.push('|--------|-------------------|-----------------|')
        for (const p of sprintOverview.byPerson) {
          lines.push(`| ${p.nome} | ${p.done}/${p.total} | ${p.spDone}/${p.spTotal} |`)
        }
        lines.push('')
        lines.push('> _SP contabilizados quando a issue atinge status Done no Jira._', '')
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
        for (const commit of activity.githubCommits) {
          const msg = commit.message.length > 120 ? commit.message.slice(0, 117) + '...' : commit.message
          lines.push(`- 💻 \`${commit.repo}\`: ${msg}`)
          hasActivity = true
        }
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

      // ── Trabalhando agora (A2: only dev/review, with A3: cycle time) ──
      lines.push('### Trabalhando agora', '')
      if (report.activeTasks.length > 0) {
        for (const task of report.activeTasks) {
          const sp = task.storyPoints ? ` (${task.storyPoints} SP)` : ''
          const statusIcon = task.statusCategory === 'review' ? '🔄' : '🔵'
          const daysLabel = task.daysInStatus > 0 ? ` — há ${task.daysInStatus}d` : ''
          const alertIcon = task.alert === 'warning' ? ' ⚠️' : ''
          const baselineNote = report.cycleTimeBaseline != null
            ? (task.daysInStatus > report.cycleTimeBaseline ? ` (baseline: ${report.cycleTimeBaseline}d)` : '')
            : (task.daysInStatus > 3 ? ' (sem baseline)' : '')
          lines.push(`- ${statusIcon} **${task.key}**: ${task.summary}${sp} — _${task.status}_${daysLabel}${baselineNote}${alertIcon}`)
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
          lines.push('- ⚠️ *Sem impedimento formal, mas sem atividade com tasks em andamento — verificar*')
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
    }

    return { content: lines.join('\n'), analysisInput }
  }
}

// ── Pure functions ──────────────────────────────────────────────

function categorizeStatus(status: string): 'dev' | 'review' | 'queue' {
  const s = status.toLowerCase()
  if (QUEUE_PATTERNS.some(q => s.includes(q))) return 'queue'
  if (REVIEW_STATUSES.some(r => s.includes(r))) return 'review'
  if (DEV_STATUSES.some(d => s.includes(d))) return 'dev'
  return 'queue'
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

async function batchParallel<T, R>(items: T[], fn: (item: T) => Promise<R>, batchSize: number): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
  }
  return results
}

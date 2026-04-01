import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { PersonRegistry, type PersonConfig } from '../registry/PersonRegistry'
import { SettingsManager, type AppSettings } from '../registry/SettingsManager'
import { ExternalDataPass, type ExternalDataSnapshot } from './ExternalDataPass'
import { JiraClient, JiraConfig } from './JiraClient'
import { GitHubClient, GitHubConfig } from './GitHubClient'
import { Logger } from '../logging/Logger'

const log = Logger.getInstance().child('WeeklyReportGenerator')

interface WeeklyGitHubData {
  commits: number
  prsMerged: number
  reviews: number
}

interface WeeklyPreviousData {
  commits30d?: number
  prsMerged30d?: number
}

interface PersonWeeklyData {
  nome: string
  slug: string
  snapshot: ExternalDataSnapshot | null
  weeklyGithub: WeeklyGitHubData
  previous: WeeklyPreviousData
  narrativeContext: string
  baseline: { avgCommits: number; avgPRsMerged: number; avgReviews: number } | null
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

export class WeeklyReportGenerator {
  private workspacePath: string
  private relatoriosDir: string
  private externalPass: ExternalDataPass

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath
    this.relatoriosDir = join(workspacePath, 'relatorios')
    this.externalPass = new ExternalDataPass(workspacePath)
  }

  async generate(weekStart?: string, weekEnd?: string, force?: boolean): Promise<string> {
    const end = weekEnd ?? this.getDateStr(0)
    const start = weekStart ?? this.getDateStr(-7)
    const formattedStart = this.formatDateBR(start)
    const formattedEnd = this.formatDateBR(end)
    const filePath = join(this.relatoriosDir, `Weekly-${formattedStart}-a-${formattedEnd}.md`)

    if (existsSync(filePath) && !force) {
      log.debug('weekly report já existe, pulando geração', { start, end })
      return filePath
    }
    if (force && existsSync(filePath)) {
      log.info('weekly report: regenerando (force)', { start, end })
      unlinkSync(filePath)
    }

    log.info('generateWeeklyReport: iniciando', { start, end })

    const registry = new PersonRegistry(this.workspacePath)
    const people = registry.list().filter(p => p.relacao === 'liderado')
    const settings = SettingsManager.load()

    const personReports: PersonWeeklyData[] = []

    for (const person of people) {
      if (!person.jiraEmail && !person.githubUsername) continue

      let snapshot: ExternalDataSnapshot | null = null
      let weeklyGithub: WeeklyGitHubData = { commits: 0, prsMerged: 0, reviews: 0 }

      try {
        snapshot = await this.externalPass.run(person.slug, true)
      } catch (err) {
        log.warn('falha ao buscar dados para weekly', { slug: person.slug, error: err instanceof Error ? err.message : String(err) })
      }

      try {
        weeklyGithub = await this.fetchWeekGitHubData(person, settings, start, end)
      } catch (err) {
        log.warn('falha ao buscar dados GitHub da semana', { slug: person.slug, error: err instanceof Error ? err.message : String(err) })
      }

      // Load previous month data for trend indicators
      const previous: WeeklyPreviousData = {}
      const historico = this.externalPass.loadHistorico(person.slug)
      if (historico) {
        const months = Object.keys(historico).sort().reverse()
        if (months.length > 0) {
          const prev = historico[months[0]]
          previous.commits30d = prev.github?.commits30d
          previous.prsMerged30d = prev.github?.prsMerged30d
        }
      }

      const narrativeContext = this.externalPass.extractNarrativeContext(person.slug)
      const baseline = this.externalPass.computeBaseline3Months(person.slug)

      personReports.push({
        nome: person.nome,
        slug: person.slug,
        snapshot,
        weeklyGithub,
        previous,
        narrativeContext,
        baseline,
      })

      await sleep(200)
    }

    const content = this.buildReport(personReports, start, end)

    mkdirSync(this.relatoriosDir, { recursive: true })
    writeFileSync(filePath, content, 'utf-8')
    log.info('weekly report gerado', { start, end, path: filePath })
    return filePath
  }

  private async fetchWeekGitHubData(person: PersonConfig, settings: AppSettings, start: string, end: string): Promise<WeeklyGitHubData> {
    const githubUsername = person.githubUsername
    if (!settings.githubEnabled || !settings.githubToken || !githubUsername || !settings.githubRepos) {
      return { commits: 0, prsMerged: 0, reviews: 0 }
    }

    try {
      const githubConfig: GitHubConfig = {
        token: settings.githubToken,
        org: settings.githubOrg ?? '',
        repos: settings.githubRepos,
      }
      const githubClient = new GitHubClient(githubConfig)

      const since = start
      const [commits, prs, reviews] = await Promise.all([
        githubClient.getCommitsByUser(githubUsername, since),
        githubClient.getPRsByUser(githubUsername, since),
        githubClient.getReviewsByUser(githubUsername, since),
      ])

      const endDate = new Date(end)
      endDate.setDate(endDate.getDate() + 1)
      const endStr = endDate.toISOString().slice(0, 10)

      const weekCommits = commits.filter(c => c.date >= start && c.date < endStr).length
      const weekPRs = prs.filter(p => p.merged && p.mergedAt && p.mergedAt >= start && p.mergedAt < endStr).length
      const weekReviews = reviews.filter(r => r.submittedAt >= start && r.submittedAt < endStr).length

      return { commits: weekCommits, prsMerged: weekPRs, reviews: weekReviews }
    } catch (err) {
      log.warn('Falha ao buscar dados GitHub da semana', { slug: person.slug, error: err instanceof Error ? err.message : String(err) })
      return { commits: 0, prsMerged: 0, reviews: 0 }
    }
  }

  private getDateStr(offsetDays: number): string {
    const d = new Date()
    d.setDate(d.getDate() + offsetDays)
    return d.toISOString().slice(0, 10)
  }

  private formatDateBR(dateStr: string): string {
    const [year, month, day] = dateStr.split('-')
    const monthNum = parseInt(month, 10)
    return `${day}-${month}-${year}`
  }

  private formatDateLong(dateStr: string): string {
    const [year, month, day] = dateStr.split('-')
    const monthNum = parseInt(month, 10)
    return `${parseInt(day, 10)} de ${MESES[monthNum - 1]} de ${year}`
  }

  private buildReport(personReports: PersonWeeklyData[], start: string, end: string): string {
    const lines: string[] = []
    const formattedStart = this.formatDateLong(start)
    const formattedEnd = this.formatDateLong(end)

    lines.push(`# Weekly Report — ${formattedStart} a ${formattedEnd}`, '')

    const allBlockers: Array<{
      person: string
      key: string
      summary: string
      days: number
    }> = []
    const allRisks: string[] = []
    let totalCommits = 0
    let totalPRs = 0
    let totalReviews = 0
    let totalIssuesClosed = 0
    let totalSP = 0

    for (const report of personReports) {
      lines.push(`## ${report.nome}`, '')

      if (report.narrativeContext) {
        lines.push(`> ${report.narrativeContext}`, '')
      }

      const jira = report.snapshot?.jira
      const weekly = report.weeklyGithub

      lines.push('### Resumo da semana', '')
      if (jira) {
        lines.push(`- Issues fechadas: **${jira.issuesFechadasSprint}** (${jira.storyPointsSprint} SP)`)
        totalIssuesClosed += jira.issuesFechadasSprint
        totalSP += jira.storyPointsSprint
      }
      // Weekly avg from 30d rolling snapshot for trend comparison
      const weeklyAvgCommits = report.previous.commits30d != null ? report.previous.commits30d / 4.3 : undefined
      const weeklyAvgPRs = report.previous.prsMerged30d != null ? report.previous.prsMerged30d / 4.3 : undefined
      lines.push(`- Commits: **${weekly.commits}**${formatTrend(weekly.commits, weeklyAvgCommits, 'vs avg/semana anterior')}`)
      lines.push(`- PRs merged: **${weekly.prsMerged}**${formatTrend(weekly.prsMerged, weeklyAvgPRs, 'vs avg/semana anterior')}`)
      lines.push(`- Code reviews: **${weekly.reviews}**`)
      if (report.baseline) {
        lines.push(`- Baseline pessoal (3 meses): commits ${report.baseline.avgCommits}/sem, PRs ${report.baseline.avgPRsMerged}/sem, reviews ${report.baseline.avgReviews}/sem`)
      }
      totalCommits += weekly.commits
      totalPRs += weekly.prsMerged
      totalReviews += weekly.reviews
      lines.push('')

      if (jira?.sprintAtual) {
        lines.push('### Sprint Atual', '')
        lines.push(`- Nome: **${jira.sprintAtual.nome}**`)
        lines.push(`- Progresso: ${jira.sprintAtual.issuesConcluidas}/${jira.sprintAtual.totalIssues} concluídas`)
        lines.push(`- SP: ${jira.sprintAtual.entregue}/${jira.sprintAtual.comprometido} entregues`)
        lines.push('')
      }

      lines.push('### Fazendo / Vai fazer hoje', '')
      if (jira) {
        lines.push(`- Issues abertas: **${jira.issuesAbertas}** | Workload: ${jira.workloadScore}`)
        if (jira.cycleTimeByStage) {
          lines.push(`- Cycle time médio: ${jira.cycleTimeByStage.total} dias`)
        }
      } else {
        lines.push('- *Sem dados disponíveis*')
      }
      lines.push('')

      lines.push('### Impedimentos', '')
      if (jira && jira.blockersAtivos.length > 0) {
        for (const b of jira.blockersAtivos) {
          const days = Math.floor((Date.now() - new Date(b.blockedSince).getTime()) / 86_400_000)
          const flagIcon = b.flagged ? '🚩' : ''
          lines.push(`- 🔴 **${b.key}** — "${b.summary}" (há ${days} dias) ${flagIcon}`)
          if (b.comments.length > 0) {
            lines.push(`  > ${b.comments[0].slice(0, 200)}`)
          }
          allBlockers.push({ person: report.nome, key: b.key, summary: b.summary, days })
        }
      } else {
        lines.push('- *Nenhum impedimento*')
      }
      lines.push('')

      lines.push('')
    }

    if (allBlockers.length > 0) {
      lines.push('## Bloqueios do Time', '')
      for (const b of allBlockers) {
        const severity = b.days > 3 ? '🔴' : b.days > 1 ? '🟡' : '🔵'
        lines.push(`- ${severity} ${b.key} (${b.person}) — há ${b.days} dias`)
      }
      lines.push('')
    }

    for (const report of personReports) {
      const insights = report.snapshot?.insights ?? []
      for (const insight of insights) {
        if (insight.severidade === 'alta') {
          allRisks.push(`- ⚠️ [${report.nome}] ${insight.descricao}`)
        }
      }
    }

    if (allRisks.length > 0) {
      lines.push('## Riscos', '')
      for (const risk of allRisks) {
        lines.push(risk)
      }
      lines.push('')
    }

    lines.push('## Resumo do Time', '')
    lines.push(`- Total issues fechadas: **${totalIssuesClosed}** (${totalSP} SP)`)
    lines.push(`- Total commits: **${totalCommits}**`)
    lines.push(`- Total PRs merged: **${totalPRs}**`)
    lines.push(`- Total code reviews: **${totalReviews}**`)
    if (allBlockers.length > 0) {
      lines.push(`- Total bloqueios ativos: **${allBlockers.length}**`)
    }
    lines.push('')

    return lines.join('\n')
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Returns a trend suffix string like " (↑15% vs avg/semana anterior)" or "".
 * @param current - current period value
 * @param previous - previous period value (may be undefined if no history)
 * @param label - context label for the comparison period
 */
function formatTrend(current: number, previous: number | undefined, label: string): string {
  if (previous == null || previous === 0) return ''
  const pct = Math.round(((current - previous) / previous) * 100)
  if (Math.abs(pct) <= 10) return ` (→ estável)`
  const arrow = pct > 0 ? '↑' : '↓'
  return ` (${arrow}${Math.abs(pct)}% ${label})`
}

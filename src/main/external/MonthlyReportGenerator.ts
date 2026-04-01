import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { PersonRegistry, type PersonConfig } from '../registry/PersonRegistry'
import { SettingsManager, type AppSettings } from '../registry/SettingsManager'
import { ExternalDataPass, type ExternalDataSnapshot } from './ExternalDataPass'
import { GitHubClient, GitHubConfig } from './GitHubClient'
import { Logger } from '../logging/Logger'

const log = Logger.getInstance().child('MonthlyReportGenerator')

interface MonthlyGitHubData {
  commits: number
  prsMerged: number
  reviews: number
}

interface MonthlyPreviousData {
  commits30d?: number
  prsMerged30d?: number
}

interface PersonMonthlyData {
  nome: string
  slug: string
  snapshot: ExternalDataSnapshot | null
  monthlyGithub: MonthlyGitHubData
  previous: MonthlyPreviousData
  narrativeContext: string
  baseline: { avgCommits: number; avgPRsMerged: number; avgReviews: number } | null
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

export class MonthlyReportGenerator {
  private workspacePath: string
  private relatoriosDir: string
  private externalPass: ExternalDataPass

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath
    this.relatoriosDir = join(workspacePath, 'relatorios')
    this.externalPass = new ExternalDataPass(workspacePath)
  }

  async generate(yearMonth?: string, force?: boolean): Promise<string> {
    const now = new Date()
    const targetYear = yearMonth ? parseInt(yearMonth.split('-')[0], 10) : now.getFullYear()
    const targetMonth = yearMonth ? parseInt(yearMonth.split('-')[1], 10) : now.getMonth() + 1

    const monthStr = String(targetMonth).padStart(2, '0')
    const monthName = MESES[targetMonth - 1]
    const filePath = join(this.relatoriosDir, `Monthly-${monthStr}-${targetYear}.md`)

    if (existsSync(filePath) && !force) {
      log.debug('monthly report já existe, pulando geração', { year: targetYear, month: targetMonth })
      return filePath
    }
    if (force && existsSync(filePath)) {
      log.info('monthly report: regenerando (force)', { year: targetYear, month: targetMonth })
      unlinkSync(filePath)
    }

    log.info('generateMonthlyReport: iniciando', { year: targetYear, month: targetMonth })

    const registry = new PersonRegistry(this.workspacePath)
    const people = registry.list().filter(p => p.relacao === 'liderado')
    const settings = SettingsManager.load()

    const monthStart = `${targetYear}-${monthStr}-01`
    const monthEnd = this.getMonthEnd(targetYear, targetMonth)

    const personReports: PersonMonthlyData[] = []

    for (const person of people) {
      if (!person.jiraEmail && !person.githubUsername) continue

      let snapshot: ExternalDataSnapshot | null = null
      let monthlyGithub: MonthlyGitHubData = { commits: 0, prsMerged: 0, reviews: 0 }

      try {
        snapshot = await this.externalPass.run(person.slug, true)
      } catch (err) {
        log.warn('falha ao buscar dados para monthly', { slug: person.slug, error: err instanceof Error ? err.message : String(err) })
      }

      try {
        monthlyGithub = await this.fetchMonthGitHubData(person, settings, monthStart, monthEnd)
      } catch (err) {
        log.warn('falha ao buscar dados GitHub do mês', { slug: person.slug, error: err instanceof Error ? err.message : String(err) })
      }

      // Load previous month data for trend indicators
      const previous: MonthlyPreviousData = {}
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
        monthlyGithub,
        previous,
        narrativeContext,
        baseline,
      })

      await sleep(200)
    }

    const content = this.buildReport(personReports, targetYear, targetMonth)

    mkdirSync(this.relatoriosDir, { recursive: true })
    writeFileSync(filePath, content, 'utf-8')
    log.info('monthly report gerado', { year: targetYear, month: targetMonth, path: filePath })
    return filePath
  }

  private getMonthEnd(year: number, month: number): string {
    const lastDay = new Date(year, month, 0).getDate()
    return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  }

  private async fetchMonthGitHubData(person: PersonConfig, settings: AppSettings, start: string, end: string): Promise<MonthlyGitHubData> {
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

      const [commits, prs, reviews] = await Promise.all([
        githubClient.getCommitsByUser(githubUsername, start),
        githubClient.getPRsByUser(githubUsername, start),
        githubClient.getReviewsByUser(githubUsername, start),
      ])

      const endDate = new Date(end)
      endDate.setDate(endDate.getDate() + 1)
      const endStr = endDate.toISOString().slice(0, 10)

      const monthCommits = commits.filter(c => c.date >= start && c.date < endStr).length
      const monthPRs = prs.filter(p => p.merged && p.mergedAt && p.mergedAt >= start && p.mergedAt < endStr).length
      const monthReviews = reviews.filter(r => r.submittedAt >= start && r.submittedAt < endStr).length

      return { commits: monthCommits, prsMerged: monthPRs, reviews: monthReviews }
    } catch (err) {
      log.warn('Falha ao buscar dados GitHub do mês', { slug: person.slug, error: err instanceof Error ? err.message : String(err) })
      return { commits: 0, prsMerged: 0, reviews: 0 }
    }
  }

  private buildReport(personReports: PersonMonthlyData[], year: number, month: number): string {
    const lines: string[] = []
    const monthName = MESES[month - 1]

    lines.push(`# Monthly Report — ${monthName} ${year}`, '')

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
      const monthly = report.monthlyGithub

      lines.push('### Resumo do mês', '')
      if (jira) {
        lines.push(`- Issues fechadas: **${jira.issuesFechadasSprint}** (${jira.storyPointsSprint} SP)`)
        totalIssuesClosed += jira.issuesFechadasSprint
        totalSP += jira.storyPointsSprint
      }
      lines.push(`- Commits: **${monthly.commits}**${formatTrend(monthly.commits, report.previous.commits30d, 'vs mês anterior')}`)
      lines.push(`- PRs merged: **${monthly.prsMerged}**${formatTrend(monthly.prsMerged, report.previous.prsMerged30d, 'vs mês anterior')}`)
      lines.push(`- Code reviews: **${monthly.reviews}**`)
      if (report.baseline) {
        lines.push(`- Baseline pessoal (3 meses): commits ${report.baseline.avgCommits}/mes, PRs ${report.baseline.avgPRsMerged}/mes, reviews ${report.baseline.avgReviews}/mes`)
      }
      totalCommits += monthly.commits
      totalPRs += monthly.prsMerged
      totalReviews += monthly.reviews
      lines.push('')

      if (jira?.sprintAtual) {
        lines.push('### Sprint Atual', '')
        lines.push(`- Nome: **${jira.sprintAtual.nome}**`)
        lines.push(`- Progresso: ${jira.sprintAtual.issuesConcluidas}/${jira.sprintAtual.totalIssues} concluídas`)
        lines.push(`- SP: ${jira.sprintAtual.entregue}/${jira.sprintAtual.comprometido} entregues`)
        lines.push('')
      }

      lines.push('### Status', '')
      if (jira) {
        lines.push(`- Issues abertas: **${jira.issuesAbertas}** | Workload: ${jira.workloadScore}`)
        if (jira.bugsAtivos > 0) {
          lines.push(`- Bugs ativos: **${jira.bugsAtivos}**`)
        }
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

function formatTrend(current: number, previous: number | undefined, label: string): string {
  if (previous == null || previous === 0) return ''
  const pct = Math.round(((current - previous) / previous) * 100)
  if (Math.abs(pct) <= 10) return ` (→ estável)`
  const arrow = pct > 0 ? '↑' : '↓'
  return ` (${arrow}${Math.abs(pct)}% ${label})`
}

import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { PersonRegistry, type PersonConfig } from '../registry/PersonRegistry'
import { SettingsManager, type AppSettings } from '../registry/SettingsManager'
import { ExternalDataPass, type ExternalDataSnapshot } from './ExternalDataPass'
import { JiraClient, JiraConfig, type DailyStandupData } from './JiraClient'
import { GitHubClient, GitHubConfig } from './GitHubClient'
import { Logger } from '../logging/Logger'

const log = Logger.getInstance().child('DailyReportGenerator')

interface DailyActivity {
  jiraUpdated: DailyStandupData | null
  githubYesterdayCommits: number
  githubYesterdayPRs: number
  githubYesterdayReviews: number
}

interface PersonDailyData {
  nome: string
  slug: string
  snapshot: ExternalDataSnapshot | null
  activity: DailyActivity | null
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

export class DailyReportGenerator {
  private workspacePath: string
  private relatoriosDir: string
  private externalPass: ExternalDataPass

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath
    this.relatoriosDir = join(workspacePath, 'relatorios')
    this.externalPass = new ExternalDataPass(workspacePath)
  }

  async generate(date?: string): Promise<string> {
    const today = date ?? new Date().toISOString().slice(0, 10)
    const formattedDate = this.formatDateBR(today)
    const filePath = join(this.relatoriosDir, `Daily-${formattedDate}.md`)

    log.info('generateDailyReport: iniciando', { date: today })

    const registry = new PersonRegistry(this.workspacePath)
    const people = registry.list().filter(p => p.relacao === 'liderado')
    const settings = SettingsManager.load()

    const personReports: PersonDailyData[] = []

    for (const person of people) {
      if (!person.jiraEmail && !person.githubUsername) continue

      let snapshot: ExternalDataSnapshot | null = null
      let activity: DailyActivity | null = null

      try {
        snapshot = await this.externalPass.run(person.slug, true)
      } catch (err) {
        log.warn('falha ao buscar dados para daily', { slug: person.slug, error: err instanceof Error ? err.message : String(err) })
      }

      try {
        activity = await this.fetchYesterdayActivity(person, settings)
      } catch (err) {
        log.warn('falha ao buscar atividade de ontem', { slug: person.slug, error: err instanceof Error ? err.message : String(err) })
      }

      personReports.push({
        nome: person.nome,
        slug: person.slug,
        snapshot,
        activity,
      })

      await sleep(200)
    }

    const content = this.buildReport(personReports, today)

    mkdirSync(this.relatoriosDir, { recursive: true })
    writeFileSync(filePath, content, 'utf-8')
    log.info('daily report gerado', { date: today, path: filePath })
    return filePath
  }

  private async fetchYesterdayActivity(person: PersonConfig, settings: AppSettings): Promise<DailyActivity | null> {
    const yesterday = this.getYesterday()
    const jiraEmail = person.jiraEmail
    const githubUsername = person.githubUsername

    let jiraUpdated: DailyStandupData | null = null
    let githubYesterdayCommits = 0
    let githubYesterdayPRs = 0
    let githubYesterdayReviews = 0

    if (settings.jiraEnabled && settings.jiraBaseUrl && settings.jiraApiToken && jiraEmail) {
      try {
        const jiraConfig: JiraConfig = {
          baseUrl: settings.jiraBaseUrl,
          email: jiraEmail,
          apiToken: settings.jiraApiToken,
          projectKey: settings.jiraProjectKey,
          boardId: settings.jiraBoardId,
        }
        const jiraClient = new JiraClient(jiraConfig)
        const standupData = await jiraClient.getDailyStandupData([jiraEmail])
        jiraUpdated = standupData[0] || null
      } catch (err) {
        log.warn('Falha ao buscar standup Jira', { slug: person.slug, error: err instanceof Error ? err.message : String(err) })
      }
    }

    if (settings.githubEnabled && settings.githubToken && githubUsername && settings.githubRepos) {
      try {
        const githubConfig: GitHubConfig = {
          token: settings.githubToken,
          org: settings.githubOrg ?? '',
          repos: settings.githubRepos,
        }
        const githubClient = new GitHubClient(githubConfig)

        const [commits, prs, reviews] = await Promise.all([
          githubClient.getCommitsByUser(githubUsername, yesterday),
          githubClient.getPRsByUser(githubUsername, yesterday),
          githubClient.getReviewsByUser(githubUsername, yesterday),
        ])

        githubYesterdayCommits = commits.length
        githubYesterdayPRs = prs.filter(p => p.merged).length
        githubYesterdayReviews = reviews.length
      } catch (err) {
        log.warn('Falha ao buscar atividade GitHub', { slug: person.slug, error: err instanceof Error ? err.message : String(err) })
      }
    }

    return { jiraUpdated, githubYesterdayCommits, githubYesterdayPRs, githubYesterdayReviews }
  }

  private getYesterday(): string {
    const d = new Date()
    d.setDate(d.getDate() - 1)
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

  private buildReport(
    personReports: PersonDailyData[],
    today: string,
  ): string {
    const lines: string[] = []
    const formattedDate = this.formatDateLong(today)

    lines.push(`# Daily Report — ${formattedDate}`, '')

    const allBlockers: Array<{
      person: string
      key: string
      summary: string
      days: number
      comment: string | null
      flagged: boolean
    }> = []
    const allRisks: string[] = []
    let teamCycleTime = { todoToInProgress: 0, inProgressToReview: 0, reviewToDone: 0, total: 0 }
    let cycleTimeCount = 0

    for (const report of personReports) {
      lines.push(`## ${report.nome}`, '')

      const jira = report.snapshot?.jira
      const github = report.snapshot?.github
      const activity = report.activity

      lines.push('### O que fez ontem', '')
      let hasYesterdayActivity = false

      if (activity?.jiraUpdated && activity.jiraUpdated.recentActivity.length > 0) {
        for (const item of activity.jiraUpdated.recentActivity.slice(0, 5)) {
          lines.push(`- ${item.issueKey}: **${item.summary}** — moveu para "${item.status}"`)
          hasYesterdayActivity = true
        }
      }

      if (activity && activity.githubYesterdayCommits > 0) {
        lines.push(`- Commits: **${activity.githubYesterdayCommits}** commit(s)`)
        hasYesterdayActivity = true
      }

      if (activity && activity.githubYesterdayReviews > 0) {
        lines.push(`- Reviews: **${activity.githubYesterdayReviews}** code review(s) feita(s)`)
        hasYesterdayActivity = true
      }

      if (!hasYesterdayActivity) {
        lines.push('- *Sem atividade registrada ontem*')
      }
      lines.push('')

      lines.push('### O que finalizou', '')
      if (jira && jira.sprintAtual && jira.sprintAtual.issuesConcluidas > 0) {
        lines.push(`- ${jira.sprintAtual.issuesConcluidas} issue(s) fechada(s) na sprint (${jira.sprintAtual.entregue} SP)`)
      } else {
        lines.push('- *Nenhuma issue finalizada ontem*')
      }
      if (activity?.githubYesterdayPRs && activity.githubYesterdayPRs > 0) {
        lines.push(`- ${activity.githubYesterdayPRs} PR(s) mergeado(s)`)
      }
      lines.push('')

      lines.push('### Fazendo / Vai fazer hoje', '')
      if (jira) {
        if (jira.sprintAtual) {
          lines.push(`- Sprint atual: **${jira.sprintAtual.nome}**`)
          lines.push(`- ${jira.sprintAtual.issuesConcluidas}/${jira.sprintAtual.totalIssues} concluídas, ${jira.sprintAtual.entregue}/${jira.sprintAtual.comprometido} SP`)
        }
        lines.push(`- Issues abertas: **${jira.issuesAbertas}** | Workload: ${jira.workloadScore}`)
      } else {
        lines.push('- *Sem dados Jira disponíveis*')
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
          allBlockers.push({
            person: report.nome,
            key: b.key,
            summary: b.summary,
            days,
            comment: b.comments[0] || null,
            flagged: b.flagged,
          })
        }
      } else {
        lines.push('- *Nenhum impedimento*')
      }
      lines.push('')

      lines.push('### Observações', '')
      lines.push('- *—*')
      lines.push('')

      if (jira?.cycleTimeByStage) {
        teamCycleTime.todoToInProgress += jira.cycleTimeByStage.todoToInProgress
        teamCycleTime.inProgressToReview += jira.cycleTimeByStage.inProgressToReview
        teamCycleTime.reviewToDone += jira.cycleTimeByStage.reviewToDone
        teamCycleTime.total += jira.cycleTimeByStage.total
        cycleTimeCount++
      }

      if (!jira && !github) {
        lines.push('### Cycle Time (médias do time)', '')
        lines.push('- *Sem dados disponíveis*')
        lines.push('')
      }

      lines.push('')
    }

    if (cycleTimeCount > 0) {
      const avg = (v: number) => Math.round((v / cycleTimeCount) * 10) / 10
      lines.push('### Cycle Time (médias do time)', '')
      lines.push(`- To Do → In Progress: **${avg(teamCycleTime.todoToInProgress)}** dias`)
      lines.push(`- In Progress → Review: **${avg(teamCycleTime.inProgressToReview)}** dias`)
      lines.push(`- Review → Done: **${avg(teamCycleTime.reviewToDone)}** dias`)
      lines.push(`- Total médio: **${avg(teamCycleTime.total)}** dias`)
      lines.push('')
    }

    if (allBlockers.length > 0) {
      lines.push('## Bloqueios do Time', '')
      for (const b of allBlockers) {
        const severity = b.days > 3 ? '🔴' : b.days > 1 ? '🟡' : '🔵'
        const flag = b.flagged ? ' 🚩' : ''
        lines.push(`- ${severity} ${b.key} (${b.person}) — há ${b.days} dias${flag}`)
        if (b.comment) {
          lines.push(`  > ${b.comment.slice(0, 200)}`)
        }
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

    return lines.join('\n')
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

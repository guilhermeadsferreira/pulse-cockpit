import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { PersonRegistry } from '../registry/PersonRegistry'
import { ExternalDataPass, type ExternalDataSnapshot } from './ExternalDataPass'
import type { JiraSprint } from './JiraClient'
import type { JiraPersonMetrics, SprintSummary } from './JiraMetrics'
import type { GitHubPersonMetrics } from './GitHubMetrics'
import { Logger } from '../logging/Logger'

const log = Logger.getInstance().child('SprintReportGenerator')

interface PersonSprintData {
  nome: string
  slug: string
  snapshot: ExternalDataSnapshot | null
  previousCommits30d?: number
  previousPrsMerged30d?: number
}

export class SprintReportGenerator {
  private workspacePath: string
  private relatoriosDir: string
  private externalPass: ExternalDataPass

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath
    this.relatoriosDir = join(workspacePath, 'relatorios')
    this.externalPass = new ExternalDataPass(workspacePath)
  }

  async generate(sprint: JiraSprint, force?: boolean): Promise<string> {
    const safeName = sprint.name.replace(/[^a-zA-Z0-9\s\-_]/g, '').replace(/\s+/g, '-')
    const filePath = join(this.relatoriosDir, `sprint_${safeName}.md`)

    if (existsSync(filePath) && !force) {
      log.debug('sprint report já existe', { sprint: sprint.name })
      return filePath
    }
    if (force && existsSync(filePath)) {
      log.info('sprint report: regenerando (force)', { sprint: sprint.name })
      unlinkSync(filePath)
    }

    const registry = new PersonRegistry(this.workspacePath)
    const people = registry.list().filter(p => p.relacao === 'liderado')

    const personData: PersonSprintData[] = []

    for (const person of people) {
      if (!person.jiraEmail && !person.githubUsername) continue

      let snapshot: ExternalDataSnapshot | null = null
      try {
        snapshot = await this.externalPass.run(person.slug)
      } catch (err) {
        log.warn('falha ao buscar dados para sprint report', { slug: person.slug, error: err instanceof Error ? err.message : String(err) })
      }

      // Load previous month data for trend indicators (best effort)
      let previousCommits30d: number | undefined
      let previousPrsMerged30d: number | undefined
      const historico = this.externalPass.loadHistorico(person.slug)
      if (historico) {
        const months = Object.keys(historico).sort().reverse()
        if (months.length > 0) {
          const prev = historico[months[0]]
          previousCommits30d = prev.github?.commits30d
          previousPrsMerged30d = prev.github?.prsMerged30d
        }
      }

      personData.push({
        nome: person.nome,
        slug: person.slug,
        snapshot,
        previousCommits30d,
        previousPrsMerged30d,
      })

      await sleep(200)
    }

    const content = this.buildReport(sprint, personData)

    mkdirSync(this.relatoriosDir, { recursive: true })
    writeFileSync(filePath, content, 'utf-8')
    log.info('sprint report gerado', { sprint: sprint.name, path: filePath })
    return filePath
  }

  private buildReport(sprint: JiraSprint, personData: PersonSprintData[]): string {
    const lines: string[] = [
      `# Sprint Report — "${sprint.name}"`,
      `**Período:** ${sprint.startDate ?? '?'} → ${sprint.endDate ?? '?'}`,
      '',
    ]

    // Aggregate
    let totalComprometido = 0
    let totalEntregue = 0
    let totalIssues = 0
    let totalIssuesDone = 0

    const tableRows: Array<{
      nome: string
      issues: number
      sp: number
      prs: number
      commits: number
      status: string
    }> = []

    const allBlockers: string[] = []
    const allInsights: string[] = []

    for (const person of personData) {
      const jira = person.snapshot?.jira
      const github = person.snapshot?.github

      const sprintData = jira?.sprintAtual
      const issues = sprintData?.totalIssues ?? 0
      const issuesDone = sprintData?.issuesConcluidas ?? 0
      const sp = sprintData?.comprometido ?? 0
      const spDelivered = sprintData?.entregue ?? 0
      const prs = github?.prsMerged30d ?? 0
      const commits = github?.commits30d ?? 0

      let status = '🟢'
      if (jira && jira.blockersAtivos.length > 0) status = '🟡 blocker'
      else if (jira?.workloadScore === 'alto') status = '🟡 overload'
      else if (github && github.commits30d === 0 && issues > 0) status = '🔴 baixa atividade'

      totalComprometido += sp
      totalEntregue += spDelivered
      totalIssues += issues
      totalIssuesDone += issuesDone

      tableRows.push({
        nome: person.nome,
        issues,
        sp,
        prs,
        commits,
        status,
      })

      // Blockers
      if (jira) {
        for (const b of jira.blockersAtivos) {
          const days = Math.floor((Date.now() - new Date(b.blockedSince).getTime()) / 86_400_000)
          allBlockers.push(`- ${b.key}: "${b.summary}" (${person.nome}) — ${days} dias`)
        }
      }

      // Insights
      if (person.snapshot) {
        for (const insight of person.snapshot.insights) {
          if (insight.severidade === 'alta' || insight.severidade === 'media') {
            const icon = insight.severidade === 'alta' ? '⚠️' : '🔶'
            allInsights.push(`- ${icon} ${person.nome}: ${insight.descricao}`)
          }
        }
      }
    }

    // Summary section
    lines.push('## Resumo', '')
    lines.push(`- Comprometido: ${totalComprometido} SP (${totalIssues} issues) | Entregue: ${totalEntregue} SP (${totalIssuesDone} issues)`)
    if (totalIssues > 0) {
      const pct = Math.round((totalIssuesDone / totalIssues) * 100)
      lines.push(`- Conclusão: ${pct}%`)
    }
    lines.push('')

    // Per-person table
    lines.push('## Por Pessoa', '')
    lines.push('| Pessoa | Issues | SP | PRs | Commits | Status |')
    lines.push('|--------|--------|----|----|---------|--------|')
    for (const row of tableRows) {
      const person = personData.find(p => p.nome === row.nome)
      const commitsTrend = formatTrend(row.commits, person?.previousCommits30d, 'vs mês ant.')
      const prsTrend = formatTrend(row.prs, person?.previousPrsMerged30d, 'vs mês ant.')
      lines.push(`| ${row.nome} | ${row.issues} | ${row.sp} | ${row.prs}${prsTrend} | ${row.commits}${commitsTrend} | ${row.status} |`)
    }
    lines.push('')

    // Blockers
    if (allBlockers.length > 0) {
      lines.push('## Blockers Encontrados', '')
      for (const b of allBlockers) {
        lines.push(b)
      }
      lines.push('')
    }

    // Insights
    if (allInsights.length > 0) {
      lines.push('## Insights', '')
      for (const i of allInsights) {
        lines.push(i)
      }
      lines.push('')
    }

    return lines.join('\n')
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function formatTrend(current: number, previous: number | undefined, label: string): string {
  if (previous == null || previous === 0) return ''
  const pct = Math.round(((current - previous) / previous) * 100)
  if (Math.abs(pct) <= 10) return ` (→)`
  const arrow = pct > 0 ? '↑' : '↓'
  return ` (${arrow}${Math.abs(pct)}% ${label})`
}

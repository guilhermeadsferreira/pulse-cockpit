import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { PersonRegistry } from '../registry/PersonRegistry'
import { ExternalDataPass, type ExternalDataSnapshot } from './ExternalDataPass'
import { JiraClient } from './JiraClient'
import { Logger } from '../logging/Logger'

const log = Logger.getInstance().child('DailyReportGenerator')

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
    const filePath = join(this.relatoriosDir, `daily_${today}.md`)

    if (existsSync(filePath)) {
      log.debug('daily report já existe', { date: today })
      return filePath
    }

    const registry = new PersonRegistry(this.workspacePath)
    const people = registry.list().filter(p => p.relacao === 'liderado')

    const personReports: Array<{
      nome: string
      slug: string
      snapshot: ExternalDataSnapshot | null
    }> = []

    for (const person of people) {
      if (!person.jiraEmail && !person.githubUsername) continue

      let snapshot: ExternalDataSnapshot | null = null
      try {
        snapshot = await this.externalPass.run(person.slug)
      } catch (err) {
        log.warn('falha ao buscar dados para daily', { slug: person.slug, error: err instanceof Error ? err.message : String(err) })
      }

      personReports.push({
        nome: person.nome,
        slug: person.slug,
        snapshot,
      })

      await sleep(200)
    }

    const content = this.buildReport(personReports, today)

    mkdirSync(this.relatoriosDir, { recursive: true })
    writeFileSync(filePath, content, 'utf-8')
    log.info('daily report gerado', { date: today, path: filePath })
    return filePath
  }

  private buildReport(
    personReports: Array<{ nome: string; slug: string; snapshot: ExternalDataSnapshot | null }>,
    today: string,
  ): string {
    const lines: string[] = [
      `# Daily Report — ${today}`,
      '',
    ]

    const allBlockers: Array<{ person: string; key: string; days: number }> = []
    const allRisks: string[] = []
    let totalIssuesMoved = 0
    let totalPRsMerged = 0
    let totalCommits = 0

    // Per person
    lines.push('## Por Pessoa', '')

    for (const report of personReports) {
      lines.push(`### ${report.nome}`, '')

      const jira = report.snapshot?.jira
      const github = report.snapshot?.github

      // Ontem (Jira)
      if (jira) {
        const sprint = jira.sprintAtual
        if (sprint) {
          lines.push(`- **Hoje (Jira):** Sprint "${sprint.nome}" — ${sprint.issuesConcluidas}/${sprint.totalIssues} concluídas, ${sprint.entregue}/${sprint.comprometido} SP`)
        }
        lines.push(`- **Issues abertas:** ${jira.issuesAbertas} | Workload: ${jira.workloadScore}`)
        if (jira.bugsAtivos > 0) {
          lines.push(`- **Bugs ativos:** ${jira.bugsAtivos}`)
        }
        totalIssuesMoved += jira.issuesFechadasSprint
      }

      // Ontem (GitHub)
      if (github) {
        if (github.commits30d > 0) {
          lines.push(`- **GitHub:** ${github.commits30d} commits (30d), ${github.prsMerged30d} PRs merged`)
        }
        if (github.prsAbertos > 0) {
          lines.push(`- **PRs abertos:** ${github.prsAbertos} (${github.tempoMedioAbertoDias} dias em média)`)
        }
        if (github.prsRevisados > 0) {
          lines.push(`- **Reviews:** ${github.prsRevisados} code reviews feitas`)
        }
        totalPRsMerged += github.prsMerged30d
        totalCommits += github.commits30d
      }

      // Blockers
      if (jira && jira.blockersAtivos.length > 0) {
        for (const b of jira.blockersAtivos) {
          const days = Math.floor((Date.now() - new Date(b.blockedSince).getTime()) / 86_400_000)
          lines.push(`- **Blockers:** ${b.key} — "${b.summary}" (há ${days} dias)`)
          allBlockers.push({ person: report.nome, key: b.key, days })
        }
      } else if (jira || github) {
        lines.push(`- **Blockers:** Nenhum`)
      }

      if (!jira && !github) {
        lines.push(`- *Sem dados externos disponíveis*`)
      }

      lines.push('')
    }

    // Time-wide blockers
    if (allBlockers.length > 0) {
      lines.push('## Bloqueios do Time', '')
      for (const b of allBlockers) {
        const severity = b.days > 3 ? '🔴' : b.days > 1 ? '🟡' : '🔵'
        lines.push(`- ${severity} ${b.key} (${b.person}) — há ${b.days} dias`)
      }
      lines.push('')
    }

    // Risks from insights
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

    // Summary
    const activePeople = personReports.filter(r => r.snapshot !== null).length
    lines.push('## Resumo', '')
    lines.push(`- ${activePeople} pessoas ativas | ${totalIssuesMoved} issues concluídas | ${totalCommits} commits (30d) | ${totalPRsMerged} PRs merged`)
    if (allBlockers.length > 0) {
      lines.push(`- ${allBlockers.length} blocker(s) ativo(s)`)
    }
    lines.push('')

    return lines.join('\n')
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

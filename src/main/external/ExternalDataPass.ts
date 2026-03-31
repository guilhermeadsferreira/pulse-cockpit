import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import yaml from 'js-yaml'
import { SettingsManager, type AppSettings } from '../registry/SettingsManager'
import { PersonRegistry, type PersonConfig } from '../registry/PersonRegistry'
import { DemandaRegistry } from '../registry/DemandaRegistry'
import { fetchJiraMetrics, type JiraPersonMetrics } from './JiraMetrics'
import { fetchGitHubMetrics, type GitHubPersonMetrics } from './GitHubMetrics'
import { analyze, type CrossInsight, type CrossAnalyzerInput } from './CrossAnalyzer'
import { Logger } from '../logging/Logger'

const log = Logger.getInstance().child('ExternalDataPass')

export interface ExternalDataSnapshot {
  jira: JiraPersonMetrics | null
  github: GitHubPersonMetrics | null
  insights: CrossInsight[]
  atualizadoEm: string
}

export interface ExternalDataHistory {
  historico: Record<string, { jira: Partial<JiraPersonMetrics> | null; github: Partial<GitHubPersonMetrics> | null; insights: CrossInsight[] }>
  atual: ExternalDataSnapshot
}

interface CacheEntry {
  data: ExternalDataSnapshot
  fetchedAt: number
}

const CACHE_DIR_NAME = 'cache'
const EXTERNAL_CACHE_SUBDIR = 'external'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

export class ExternalDataPass {
  private workspacePath: string
  private cacheDir: string

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath
    this.cacheDir = join(workspacePath, '..', CACHE_DIR_NAME, EXTERNAL_CACHE_SUBDIR)
  }

  /**
   * Main entry point: runs external data fetch for a single person.
   * Called from IngestionPipeline after syncItemToPerson().
   * Graceful degradation: never throws, logs errors and returns null on failure.
   */
  async run(slug: string): Promise<ExternalDataSnapshot | null> {
    const settings = SettingsManager.load()
    const jiraEnabled = !!(settings.jiraEnabled && settings.jiraBaseUrl && settings.jiraApiToken)
    const githubEnabled = !!(settings.githubEnabled && settings.githubToken)

    if (!jiraEnabled && !githubEnabled) {
      return null
    }

    const registry = new PersonRegistry(this.workspacePath)
    const person = registry.get(slug)
    if (!person) {
      log.debug('pessoa não encontrada, pulando', { slug })
      return null
    }

    const hasExternalIdentity = !!(person.jiraEmail || person.githubUsername)
    if (!hasExternalIdentity) {
      log.debug('sem identidade externa, pulando', { slug })
      return null
    }

    // Check cache
    const cached = this.readCache(slug)
    if (cached && !this.isCacheExpired(cached)) {
      log.debug('cache hit', { slug, age: Date.now() - cached.fetchedAt })
      return cached.data
    }

    try {
      const snapshot = await this.fetchAndAnalyze(settings, person)
      this.writeCache(slug, snapshot)
      this.updateExternalDataYaml(slug, snapshot)
      this.updatePerfilSection(slug, snapshot)
      this.generateDemandasIfNeeded(slug, snapshot.insights, snapshot.atualizadoEm)
      return snapshot
    } catch (err) {
      log.error('ExternalDataPass falhou (graceful degradation)', { slug, error: err instanceof Error ? err.message : String(err) })
      return null
    }
  }

  private async fetchAndAnalyze(settings: AppSettings, person: PersonConfig): Promise<ExternalDataSnapshot> {
    let jiraMetrics: JiraPersonMetrics | null = null
    let githubMetrics: GitHubPersonMetrics | null = null

    const fetchPromises: Promise<void>[] = []

    if (settings.jiraEnabled && settings.jiraBaseUrl && settings.jiraApiToken && settings.jiraEmail && person.jiraEmail) {
      fetchPromises.push(
        fetchJiraMetrics({
          config: {
            baseUrl: settings.jiraBaseUrl,
            email: settings.jiraEmail,
            apiToken: settings.jiraApiToken,
            projectKey: settings.jiraProjectKey,
            boardId: settings.jiraBoardId,
          },
          email: person.jiraEmail!,
        }).then(m => { jiraMetrics = m })
          .catch(err => log.warn('Jira fetch falhou', { slug: person.slug, error: err.message }))
      )
    }

    if (settings.githubEnabled && settings.githubToken && person.githubUsername) {
      fetchPromises.push(
        fetchGitHubMetrics({
          config: {
            token: settings.githubToken,
            org: settings.githubOrg ?? '',
            repos: settings.githubRepos ?? [],
          },
          username: person.githubUsername,
        }).then(m => { githubMetrics = m })
          .catch(err => log.warn('GitHub fetch falhou', { slug: person.slug, error: err.message }))
      )
    }

    await Promise.all(fetchPromises)

    // Load previous month data for comparison
    const previous = this.loadPreviousMonth(person.slug)

    const analysisInput: CrossAnalyzerInput = {
      jira: jiraMetrics,
      github: githubMetrics,
      previousJira: previous?.jira ?? null,
      previousGithub: previous?.github ?? null,
    }

    const insights = analyze(analysisInput)

    return {
      jira: jiraMetrics,
      github: githubMetrics,
      insights,
      atualizadoEm: new Date().toISOString(),
    }
  }

  // ── Cache ─────────────────────────────────────────────────────

  private readCache(slug: string): CacheEntry | null {
    const cachePath = this.getCachePath(slug)
    if (!existsSync(cachePath)) return null
    try {
      return JSON.parse(readFileSync(cachePath, 'utf-8')) as CacheEntry
    } catch {
      return null
    }
  }

  private writeCache(slug: string, data: ExternalDataSnapshot): void {
    const cachePath = this.getCachePath(slug)
    mkdirSync(this.cacheDir, { recursive: true })
    writeFileSync(cachePath, JSON.stringify({ data, fetchedAt: Date.now() }, null, 2), 'utf-8')
  }

  private isCacheExpired(entry: CacheEntry): boolean {
    return (Date.now() - entry.fetchedAt) > CACHE_TTL_MS
  }

  private getCachePath(slug: string): string {
    return join(this.cacheDir, `${slug}.json`)
  }

  // ── external_data.yaml ────────────────────────────────────────

  private updateExternalDataYaml(slug: string, snapshot: ExternalDataSnapshot): void {
    const externalPath = join(this.workspacePath, 'pessoas', slug, 'external_data.yaml')
    const monthKey = snapshot.atualizadoEm.slice(0, 7) // "2026-03"

    let existing: ExternalDataHistory = { historico: {}, atual: snapshot }
    if (existsSync(externalPath)) {
      try {
        existing = yaml.load(readFileSync(externalPath, 'utf-8')) as ExternalDataHistory
      } catch {
        // reset on parse error
      }
    }

    // Preserve current as history for the previous month
    if (existing.atual && existing.atual.atualizadoEm && !existing.historico[monthKey]) {
      existing.historico[monthKey] = {
        jira: existing.atual.jira ? summarizeJira(existing.atual.jira) : null,
        github: existing.atual.github ? summarizeGithub(existing.atual.github) : null,
        insights: existing.atual.insights,
      }
    }

    existing.atual = snapshot

    mkdirSync(join(this.workspacePath, 'pessoas', slug), { recursive: true })
    writeFileSync(externalPath, yaml.dump(existing, { lineWidth: 120, quotingType: '"' }), 'utf-8')
  }

  private loadPreviousMonth(slug: string): { jira: Partial<JiraPersonMetrics> | null; github: Partial<GitHubPersonMetrics> | null } | null {
    const externalPath = join(this.workspacePath, 'pessoas', slug, 'external_data.yaml')
    if (!existsSync(externalPath)) return null
    try {
      const data = yaml.load(readFileSync(externalPath, 'utf-8')) as ExternalDataHistory
      if (!data.historico) return null
      const months = Object.keys(data.historico).sort().reverse()
      if (months.length === 0) return null
      const prev = data.historico[months[0]]
      return { jira: prev.jira, github: prev.github }
    } catch {
      return null
    }
  }

  // ── Perfil.md ─────────────────────────────────────────────────

  private updatePerfilSection(slug: string, snapshot: ExternalDataSnapshot): void {
    const perfilPath = join(this.workspacePath, 'pessoas', slug, 'perfil.md')
    if (!existsSync(perfilPath)) return

    const content = readFileSync(perfilPath, 'utf-8')
    const today = snapshot.atualizadoEm.slice(0, 10)

    const sectionLines = this.buildExternalSection(snapshot, today)
    const sectionOpen = '## Dados Externos'
    const sectionMarker = '<!-- BLOCO EXTERNO — sobrescrito a cada atualização -->'

    let updated: string
    if (content.includes(sectionMarker)) {
      // Replace existing section
      const escaped = sectionMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const closeMarker = '<!-- FIM BLOCO EXTERNO -->'
      const escapedClose = closeMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(`(${escaped}\n)[\\s\\S]*?(${escapedClose})`)
      if (re.test(content)) {
        updated = content.replace(re, `$1${sectionLines}\n$2`)
      } else {
        updated = content
      }
    } else {
      // Append new section at end
      updated = content.trimEnd() + `\n\n${sectionOpen}\n${sectionMarker}\n${sectionLines}\n<!-- FIM BLOCO EXTERNO -->\n`
    }

    const tmpPath = perfilPath + '.tmp'
    writeFileSync(tmpPath, updated, 'utf-8')
    const { renameSync } = require('fs')
    renameSync(tmpPath, perfilPath)
  }

  private buildExternalSection(snapshot: ExternalDataSnapshot, today: string): string {
    const lines: string[] = []

    if (snapshot.jira) {
      const jira = snapshot.jira
      lines.push(`### Jira (atualizado: ${today})`)
      if (jira.sprintAtual) {
        lines.push(`- Sprint atual: "${jira.sprintAtual.nome}" (${jira.sprintAtual.inicio} → ${jira.sprintAtual.fim})`)
        lines.push(`- Issues: ${jira.sprintAtual.issuesConcluidas}/${jira.sprintAtual.totalIssues} concluídas`)
        lines.push(`- Story points: ${jira.sprintAtual.comprometido} comprometidos, ${jira.sprintAtual.entregue} entregues`)
      }
      lines.push(`- Issues abertas: ${jira.issuesAbertas} | Workload: ${jira.workloadScore}`)
      if (jira.bugsAtivos > 0) lines.push(`- Bugs ativos: ${jira.bugsAtivos}`)
      if (jira.tempoMedioCicloDias > 0) lines.push(`- Tempo médio de ciclo: ${jira.tempoMedioCicloDias} dias`)
      lines.push('')
    }

    if (snapshot.github) {
      const gh = snapshot.github
      lines.push(`### GitHub (atualizado: ${today})`)
      lines.push(`- PRs abertos: ${gh.prsAbertos} | Merged (30d): ${gh.prsMerged30d}`)
      lines.push(`- Commits (30d): ${gh.commits30d} (${gh.commitsPorSemana}/semana)`)
      if (gh.prsRevisados > 0) lines.push(`- Code reviews feitas: ${gh.prsRevisados}`)
      if (gh.tempoMedioAbertoDias > 0) lines.push(`- Tempo médio até merge: ${gh.tempoMedioAbertoDias} dias`)
      lines.push('')
    }

    if (snapshot.insights.length > 0) {
      lines.push('### Insights Cruzados')
      for (const insight of snapshot.insights) {
        const icon = insight.severidade === 'alta' ? '⚠️' : insight.severidade === 'media' ? '🔶' : 'ℹ️'
        lines.push(`- ${icon} [${insight.tipo}] ${insight.descricao} (${today})`)
      }
      lines.push('')
    }

    return lines.join('\n')
  }

  // ── Demandas automáticas ──────────────────────────────────────

  private generateDemandasIfNeeded(slug: string, insights: CrossInsight[], date: string): void {
    const highSeverity = insights.filter(i => i.severidade === 'alta' && i.gerarDemanda)
    if (highSeverity.length === 0) return

    const demandaReg = new DemandaRegistry(this.workspacePath)
    for (const insight of highSeverity) {
      const demandaId = `ext-${date}-${insight.tipo}-${Math.random().toString(36).slice(2, 7)}`
      demandaReg.save({
        id: demandaId,
        descricao: `[${insight.tipo}] ${insight.descricao}`,
        descricaoLonga: insight.evidencia,
        origem: 'Sistema',
        pessoaSlug: slug,
        prazo: null,
        criadoEm: date,
        atualizadoEm: date,
        status: 'open',
      })
      log.info('demanda criada automaticamente', { slug, tipo: insight.tipo, id: demandaId })
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function summarizeJira(jira: JiraPersonMetrics): Partial<JiraPersonMetrics> {
  return {
    issuesFechadasSprint: jira.issuesFechadasSprint,
    storyPointsSprint: jira.storyPointsSprint,
    bugsAtivos: jira.bugsAtivos,
    workloadScore: jira.workloadScore,
  }
}

function summarizeGithub(github: GitHubPersonMetrics): Partial<GitHubPersonMetrics> {
  return {
    commits30d: github.commits30d,
    prsMerged30d: github.prsMerged30d,
    prsRevisados: github.prsRevisados,
    tempoMedioAbertoDias: github.tempoMedioAbertoDias,
  }
}

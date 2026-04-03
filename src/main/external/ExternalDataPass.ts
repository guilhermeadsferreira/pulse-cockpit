import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import yaml from 'js-yaml'
import { SettingsManager, type AppSettings } from '../registry/SettingsManager'
import { PersonRegistry, type PersonConfig } from '../registry/PersonRegistry'
import { ActionRegistry } from '../registry/ActionRegistry'
import { DemandaRegistry } from '../registry/DemandaRegistry'
import { JiraClient } from './JiraClient'
import { fetchJiraMetrics, type JiraPersonMetrics } from './JiraMetrics'
import { fetchGitHubMetrics, type GitHubPersonMetrics } from './GitHubMetrics'
import { analyze, type CrossInsight, type CrossAnalyzerInput, type ProfileContext } from './CrossAnalyzer'
import { GitHubClient } from './GitHubClient'
import { Logger } from '../logging/Logger'

const log = Logger.getInstance().child('ExternalDataPass')

const CACHE_TTL_7_DAYS_MS = 7 * 24 * 60 * 60 * 1000

async function getRepos(settings: AppSettings): Promise<string[]> {
  const { githubToken, githubOrg, githubRepos, githubTeamSlug, githubReposCachedAt } = settings

  if (githubRepos && githubRepos.length > 0) {
    return githubRepos
  }

  if (githubTeamSlug && githubToken && githubOrg) {
    const cacheAge = githubReposCachedAt
      ? Date.now() - new Date(githubReposCachedAt).getTime()
      : Infinity

    if (cacheAge > CACHE_TTL_7_DAYS_MS) {
      try {
        const client = new GitHubClient({ token: githubToken, org: githubOrg, repos: [] })
        const repos = await client.listTeamRepos(githubTeamSlug)
        SettingsManager.save({
          ...settings,
          githubRepos: repos,
          githubReposCachedAt: new Date().toISOString(),
        })
        log.info('Repos syncados automaticamente do team', { teamSlug: githubTeamSlug, count: repos.length })
        return repos
      } catch (err) {
        log.warn('Sync automático de repos falhou (graceful)', { error: err instanceof Error ? err.message : String(err) })
      }
    }
  }

  return githubRepos ?? []
}

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
   * @param forceRefresh bypasses cache and always fetches fresh data
   */
  async run(slug: string, forceRefresh = false): Promise<ExternalDataSnapshot | null> {
    const settings = SettingsManager.load()
    const jiraEnabled = !!(settings.jiraEnabled && settings.jiraBaseUrl && settings.jiraApiToken)
    const githubEnabled = !!(settings.githubEnabled && settings.githubToken)

    if (!jiraEnabled && !githubEnabled) {
      log.info('ExternalDataPass.run: integrações desativadas', { slug })
      return null
    }

    const registry = new PersonRegistry(this.workspacePath)
    const person = registry.get(slug)
    if (!person) {
      log.warn('ExternalDataPass.run: pessoa não encontrada', { slug })
      return null
    }

    const hasExternalIdentity = !!(person.jiraEmail || person.githubUsername)
    if (!hasExternalIdentity) {
      log.debug('ExternalDataPass.run: sem identidade externa, pulando', { slug })
      return null
    }

    // Check cache (unless force refresh)
    if (!forceRefresh) {
      const cached = this.readCache(slug)
      if (cached && !this.isCacheExpired(cached)) {
        log.debug('ExternalDataPass.run: cache hit (bypassed by forceRefresh=false)', { slug, age: Date.now() - cached.fetchedAt })
        return cached.data
      }
    } else {
      log.info('ExternalDataPass.run: forçando refresh (bypassing cache)', { slug })
    }

    try {
      log.info('ExternalDataPass.run: buscando dados frescos', { slug, jiraEnabled, githubEnabled })
      const snapshot = await this.fetchAndAnalyze(settings, person)
      this.writeCache(slug, snapshot)
      this.updateExternalDataYaml(slug, snapshot)
      this.updatePerfilSection(slug, snapshot)
      this.generateDemandasIfNeeded(slug, snapshot.insights, snapshot.atualizadoEm)
      log.info('ExternalDataPass.run: sucesso', { slug, hasJira: !!snapshot.jira, hasGithub: !!snapshot.github })

      // Sync actions with Jira — auto-close actions whose issues are Done
      if (jiraEnabled && settings.jiraBaseUrl && settings.jiraApiToken && settings.jiraEmail) {
        try {
          const jiraClient = new JiraClient({
            baseUrl: settings.jiraBaseUrl,
            email: settings.jiraEmail,
            apiToken: settings.jiraApiToken,
            projectKey: settings.jiraProjectKey,
            boardId: settings.jiraBoardId,
          })
          const actionRegistry = new ActionRegistry(this.workspacePath)
          const closedCount = await this.syncActionsWithJira(slug, jiraClient, actionRegistry)
          if (closedCount > 0) {
            log.info('Jira sync: acoes auto-fechadas', { slug, closedCount })
          }
        } catch (err) {
          log.warn('Jira sync falhou (graceful)', { slug, error: err instanceof Error ? err.message : String(err) })
        }
      }

      return snapshot
    } catch (err) {
      log.error('ExternalDataPass.run: falhou', { slug, error: err instanceof Error ? err.message : String(err) })
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
      const repos = await getRepos(settings)
      fetchPromises.push(
        fetchGitHubMetrics({
          config: {
            token: settings.githubToken,
            org: settings.githubOrg ?? '',
            repos,
          },
          username: person.githubUsername,
        }).then(m => { githubMetrics = m })
          .catch(err => log.warn('GitHub fetch falhou', { slug: person.slug, error: err.message }))
      )
    }

    await Promise.all(fetchPromises)

    // Load previous month data for comparison
    const previous = this.loadPreviousMonth(person.slug)

    // Load full history for trend detection (up to 6 months)
    const historico = this.loadHistorico(person.slug)
    const historicoMensal = historico
      ? Object.entries(historico)
          .sort(([a], [b]) => b.localeCompare(a))
          .slice(0, 6)
          .map(([mes, snap]) => ({
            mes,
            github: snap.github?.commits30d != null ? {
              commits30d: snap.github.commits30d ?? 0,
              prsMerged30d: snap.github.prsMerged30d ?? 0,
              collaborationScore: snap.github.collaborationScore ?? 0,
            } : null,
            jira: snap.jira?.workloadScore != null ? {
              workloadScore: snap.jira.workloadScore ?? null,
            } : null,
          }))
      : undefined

    const analysisInput: CrossAnalyzerInput = {
      jira: jiraMetrics,
      github: githubMetrics,
      previousJira: previous?.jira ?? null,
      previousGithub: previous?.github ?? null,
      historicoMensal,
    }

    const profileContext = this.extractProfileContext(person.slug)
    const insights = analyze(analysisInput, undefined, person.nivel, profileContext)

    return {
      jira: jiraMetrics,
      github: githubMetrics,
      insights,
      atualizadoEm: new Date().toISOString(),
    }
  }

  // ── Profile Context (ausência) ─────────────────────────────────

  private extractProfileContext(slug: string): ProfileContext {
    const defaultCtx: ProfileContext = { emFerias: false, emLicenca: false }

    // Check notas_manuais from PersonConfig
    const registry = new PersonRegistry(this.workspacePath)
    const person = registry.get(slug)
    const notasManuais = person?.notas_manuais ?? ''

    // Check perfil.md for absence patterns in ## Notas section
    const perfilPath = join(this.workspacePath, 'pessoas', slug, 'perfil.md')
    let perfilNotas = ''
    if (existsSync(perfilPath)) {
      try {
        const content = readFileSync(perfilPath, 'utf-8')
        const notasMatch = content.match(/## Notas\s*\n([\s\S]*?)(?=\n##|$)/)
        if (notasMatch) {
          const notasLines = notasMatch[1].trim().split('\n')
          perfilNotas = notasLines.slice(-5).join('\n')
        }
      } catch {
        // graceful degradation
      }
    }

    const textToCheck = `${notasManuais}\n${perfilNotas}`.toLowerCase()

    const emFerias = /f[eé]rias/i.test(textToCheck)
    const emLicenca = /licen[cç]a/i.test(textToCheck)
    const ausente = /ausente|afastad[oa]/i.test(textToCheck)

    if (!emFerias && !emLicenca && !ausente) {
      return defaultCtx
    }

    let ausenciaDescricao: string | undefined
    if (emFerias) ausenciaDescricao = 'em férias'
    else if (emLicenca) ausenciaDescricao = 'em licença'
    else if (ausente) ausenciaDescricao = 'ausente/afastado'

    return {
      emFerias: emFerias || ausente,
      emLicenca,
      ausenciaDescricao,
    }
  }

  // ── Narrative Context ──────────────────────────────────────────

  /**
   * Builds a narrative paragraph about a person from their config.yaml.
   * Used by report generators to add human context to numeric data.
   */
  extractNarrativeContext(slug: string): string {
    const registry = new PersonRegistry(this.workspacePath)
    const person = registry.get(slug)
    if (!person) return ''

    const area = person.area ?? 'nao especificada'
    const inicioEmpresa = person.inicio_na_empresa ?? 'data nao registrada'
    const inicioFuncao = person.inicio_na_funcao ?? 'data nao registrada'

    let promoText = ''
    if (person.em_processo_promocao) {
      promoText = ` Atualmente em processo de promocao para ${person.objetivo_cargo_alvo ?? 'proximo nivel'}.`
    }

    let pdiText = ''
    const pdiAtivos = (person.pdi ?? []).filter(p => p.status !== 'concluido')
    if (pdiAtivos.length > 0) {
      pdiText = ` PDI com ${pdiAtivos.length} objetivo(s) ativo(s).`
    }

    return `${person.nome} atua como ${person.cargo} (${person.nivel}) na area ${area}, na empresa desde ${inicioEmpresa} e na funcao atual desde ${inicioFuncao}.${promoText}${pdiText}`
  }

  // ── Baseline 3 Months ────────────────────────────────────────

  /**
   * Computes the average commits, PRs merged and reviews over the last 3 months of history.
   * Returns null if no historical data is available.
   */
  computeBaseline3Months(slug: string): { avgCommits: number; avgPRsMerged: number; avgReviews: number } | null {
    const historico = this.loadHistorico(slug)
    if (!historico) return null

    const months = Object.keys(historico).sort().reverse().slice(0, 3)
    if (months.length === 0) return null

    let totalCommits = 0
    let totalPRs = 0
    let totalReviews = 0
    let countCommits = 0
    let countPRs = 0
    let countReviews = 0

    for (const key of months) {
      const entry = historico[key]
      if (entry.github?.commits30d != null) {
        totalCommits += entry.github.commits30d
        countCommits++
      }
      if (entry.github?.prsMerged30d != null) {
        totalPRs += entry.github.prsMerged30d
        countPRs++
      }
      if (entry.github?.prsRevisados != null) {
        totalReviews += entry.github.prsRevisados
        countReviews++
      }
    }

    if (countCommits === 0 && countPRs === 0 && countReviews === 0) return null

    return {
      avgCommits: countCommits > 0 ? Math.round(totalCommits / countCommits) : 0,
      avgPRsMerged: countPRs > 0 ? Math.round(totalPRs / countPRs) : 0,
      avgReviews: countReviews > 0 ? Math.round(totalReviews / countReviews) : 0,
    }
  }

  /**
   * Computes the average cycle time (days) over the last 3 months of history.
   * Returns null if no historical cycle time data is available.
   */
  computeCycleTimeBaseline(slug: string): number | null {
    const historico = this.loadHistorico(slug)
    if (!historico) return null

    const months = Object.keys(historico).sort().reverse().slice(0, 3)
    let total = 0
    let count = 0

    for (const key of months) {
      const ct = historico[key].jira?.tempoMedioCicloDias
      if (ct != null && ct > 0) {
        total += ct
        count++
      }
    }

    return count > 0 ? Math.round((total / count) * 10) / 10 : null
  }

  // ── Jira Action Sync ───────────────────────────────────────────

  private async syncActionsWithJira(
    slug: string,
    jiraClient: JiraClient,
    actionRegistry: ActionRegistry,
  ): Promise<number> {
    const actions = actionRegistry.list(slug)
    const openActions = actions.filter(a => a.status === 'open' || a.status === 'in_progress')
    let closedCount = 0

    for (const action of openActions) {
      const jiraKeyRegex = /\b([A-Z][A-Z0-9]+-\d+)\b/
      const textToSearch = `${action.texto ?? ''} ${action.descricao ?? ''} ${action.fonteArtefato ?? ''}`
      const match = textToSearch.match(jiraKeyRegex)
      if (!match) continue

      const issueKey = match[1]
      try {
        const issues = await jiraClient.searchIssuesByEmail('', `key = "${issueKey}"`)
        if (issues.length === 0) continue

        const issue = issues[0]
        if (issue.statusCategory === 'done') {
          actionRegistry.updateStatusWithSource(slug, action.id, 'done', 'jira-sync')
          closedCount++
          log.info('acao auto-fechada via Jira sync', { slug, actionId: action.id, issueKey, issueStatus: issue.status })
        }
      } catch (err) {
        log.warn('falha ao verificar issue Jira para acao', { slug, actionId: action.id, issueKey, error: err instanceof Error ? err.message : String(err) })
      }
    }

    return closedCount
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

  /**
   * Returns the historico map from external_data.yaml for trend comparisons.
   * Keys are YYYY-MM strings, values contain summarized jira/github metrics.
   */
  loadHistorico(slug: string): ExternalDataHistory['historico'] | null {
    const externalPath = join(this.workspacePath, 'pessoas', slug, 'external_data.yaml')
    if (!existsSync(externalPath)) return null
    try {
      const data = yaml.load(readFileSync(externalPath, 'utf-8')) as ExternalDataHistory
      return data.historico ?? null
    } catch {
      return null
    }
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
    avgCommentsPerReview: github.avgCommentsPerReview,
    approvalRate: github.approvalRate,
    collaborationScore: github.collaborationScore,
    testCoverageRatio: github.testCoverageRatio,
  }
}

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { SettingsManager } from '../registry/SettingsManager'
import { PersonRegistry } from '../registry/PersonRegistry'
import { ExternalDataPass } from './ExternalDataPass'
import { DailyReportGenerator } from './DailyReportGenerator'
import { SprintReportGenerator } from './SprintReportGenerator'
import { JiraClient } from './JiraClient'
import { Logger } from '../logging/Logger'

const log = Logger.getInstance().child('Scheduler')

interface SchedulerState {
  lastDailyRun: string | null
  lastSprintId: number | null
  lastSprintName: string | null
}

const CACHE_DIR_NAME = 'cache'
const AGENDA_DAYS_BEFORE = 2 // Gerar pauta 2 dias antes do proximo 1:1 esperado

export class Scheduler {
  private workspacePath: string
  private statePath: string
  private externalPass: ExternalDataPass

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath
    this.statePath = join(workspacePath, '..', CACHE_DIR_NAME, 'scheduler-state.json')
    this.externalPass = new ExternalDataPass(workspacePath)
  }

  /**
   * Called on app ready event.
   * Runs daily report for all people with external identity if 1x/day has passed.
   */
  async onAppStart(): Promise<void> {
    const settings = SettingsManager.load()
    const jiraEnabled = !!(settings.jiraEnabled && settings.jiraBaseUrl && settings.jiraApiToken)
    const githubEnabled = !!(settings.githubEnabled && settings.githubToken)

    if (!jiraEnabled && !githubEnabled) {
      log.debug('integrações externas desativadas, scheduler não roda')
      return
    }

    if (this.shouldRunDaily()) {
      log.info('daily trigger: iniciando refresh externo')
      await this.runForAllPeople()
      this.markDailyRun()

      // Generate daily report if enabled
      if (settings.dailyReportEnabled) {
        try {
          const generator = new DailyReportGenerator(this.workspacePath)
          await generator.generate()
          log.info('daily report gerado com sucesso')
        } catch (err) {
          log.warn('daily report falhou', { error: err instanceof Error ? err.message : String(err) })
        }
      }
    }

    if (jiraEnabled && settings.jiraBoardId) {
      await this.checkSprintChange(settings)
    }

    // Auto-generate agendas for upcoming 1:1s
    try {
      const { generated } = await this.checkAgendaGeneration()
      if (generated.length > 0) {
        log.info('pautas auto-geradas no startup', { count: generated.length, people: generated })
      }
    } catch (err) {
      log.warn('auto agenda check falhou', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  /**
   * On-demand refresh triggered via IPC.
   * Ignores daily cooldown — forces fresh data for all people.
   */
  async refreshAll(): Promise<{ updated: number; errors: number }> {
    return this.runForAllPeople()
  }

  /**
   * On-demand refresh for a single person, triggered via IPC.
   */
  async refreshPerson(slug: string): Promise<boolean> {
    try {
      const result = await this.externalPass.run(slug)
      return result !== null
    } catch (err) {
      log.warn('refresh person falhou', { slug, error: err instanceof Error ? err.message : String(err) })
      return false
    }
  }

  /**
   * On-demand daily report generation, triggered via IPC.
   */
  async generateDailyReport(): Promise<string> {
    const generator = new DailyReportGenerator(this.workspacePath)
    return generator.generate()
  }

  /**
   * On-demand sprint report generation, triggered via IPC.
   */
  async generateSprintReport(): Promise<string | null> {
    const settings = SettingsManager.load()
    if (!settings.jiraEnabled || !settings.jiraBaseUrl || !settings.jiraApiToken || !settings.jiraBoardId) {
      log.warn('sprint report requer Jira ativo com board configurado')
      return null
    }

    const client = new JiraClient({
      baseUrl: settings.jiraBaseUrl,
      email: settings.jiraEmail ?? '',
      apiToken: settings.jiraApiToken,
      boardId: settings.jiraBoardId,
    })

    const sprint = await client.getCurrentSprint(settings.jiraBoardId)
    if (!sprint) {
      log.warn('nenhum sprint ativo encontrado')
      return null
    }

    const generator = new SprintReportGenerator(this.workspacePath)
    return generator.generate(sprint)
  }

  // ── Auto agenda generation ────────────────────────────────────

  /**
   * Verifica se algum liderado precisa de pauta gerada automaticamente.
   * Criterio: proximo 1:1 esperado em <= AGENDA_DAYS_BEFORE dias e nao ha pauta recente.
   */
  async checkAgendaGeneration(): Promise<{ generated: string[] }> {
    const settings = SettingsManager.load()
    if (!settings.claudeBinPath) {
      log.warn('auto agenda: Claude CLI nao configurado')
      return { generated: [] }
    }

    const registry = new PersonRegistry(settings.workspacePath)
    const people = registry.list().filter(p => p.relacao === 'liderado')
    const today = new Date()
    const generated: string[] = []

    for (const person of people) {
      try {
        // Calcular quando e o proximo 1:1 esperado
        const perfil = registry.getPerfil(person.slug)
        const ultimo1on1 = perfil?.frontmatter?.ultimo_1on1 as string | null | undefined
        if (!ultimo1on1) continue // Sem historico de 1:1 — nao gerar automaticamente

        const frequenciaDias = person.frequencia_1on1_dias ?? 14
        const ultimoDate = new Date(ultimo1on1)
        const proximoDate = new Date(ultimoDate.getTime() + frequenciaDias * 86_400_000)
        const diasAteProximo = Math.floor((proximoDate.getTime() - today.getTime()) / 86_400_000)

        // Gerar se proximo 1:1 e em <= AGENDA_DAYS_BEFORE dias
        if (diasAteProximo > AGENDA_DAYS_BEFORE) continue
        if (diasAteProximo < -3) continue // Ja passou muito — nao gerar pauta atrasada

        // Verificar se ja existe pauta recente (ultimos 3 dias)
        const pautas = registry.listPautas(person.slug)
        const pautaRecente = pautas.find(p => {
          const diasSincePauta = Math.floor((today.getTime() - new Date(p.date).getTime()) / 86_400_000)
          return diasSincePauta <= 3
        })
        if (pautaRecente) continue // Ja tem pauta recente — nao duplicar

        log.info('agenda auto-generation triggered', { slug: person.slug, diasAteProximo, frequenciaDias })

        // Gerar pauta chamando funcao extraida diretamente (sem IPC, sem BrowserWindow)
        // Dynamic import to avoid circular dependency (index.ts imports Scheduler)
        const { generateAgendaForPerson } = await import('../index')
        const result = await generateAgendaForPerson(person.slug, settings.workspacePath, settings.claudeBinPath)
        if (result?.success) {
          generated.push(person.slug)
          log.info('pauta auto-gerada', { slug: person.slug })
        }
      } catch (err) {
        log.warn('auto agenda generation falhou', { slug: person.slug, error: err instanceof Error ? err.message : String(err) })
      }
    }

    return { generated }
  }

  // ── Daily logic ───────────────────────────────────────────────

  private shouldRunDaily(): boolean {
    const state = this.loadState()
    if (!state.lastDailyRun) return true
    const today = new Date().toISOString().slice(0, 10)
    return state.lastDailyRun !== today
  }

  private markDailyRun(): void {
    const state = this.loadState()
    state.lastDailyRun = new Date().toISOString().slice(0, 10)
    this.saveState(state)
  }

  // ── Sprint change detection ───────────────────────────────────

  private async checkSprintChange(settings: import('../registry/SettingsManager').AppSettings): Promise<void> {
    if (!settings.jiraBaseUrl || !settings.jiraApiToken || !settings.jiraBoardId) return

    try {
      const client = new JiraClient({
        baseUrl: settings.jiraBaseUrl,
        email: settings.jiraEmail ?? '',
        apiToken: settings.jiraApiToken,
        boardId: settings.jiraBoardId,
      })

      const sprint = await client.getCurrentSprint(settings.jiraBoardId)
      if (!sprint) return

      const state = this.loadState()
      if (state.lastSprintId !== sprint.id) {
        log.info('sprint mudou', { from: state.lastSprintName, to: sprint.name, id: sprint.id })
        state.lastSprintId = sprint.id
        state.lastSprintName = sprint.name
        this.saveState(state)

        // Sprint changed → refresh all people
        await this.runForAllPeople()

        // Generate sprint report if enabled
        if (settings.sprintReportEnabled) {
          try {
            const generator = new SprintReportGenerator(this.workspacePath)
            await generator.generate(sprint)
            log.info('sprint report gerado com sucesso', { sprint: sprint.name })
          } catch (err) {
            log.warn('sprint report falhou', { error: err instanceof Error ? err.message : String(err) })
          }
        }
      }
    } catch (err) {
      log.warn('sprint change check falhou', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  // ── Bulk refresh ──────────────────────────────────────────────

  private async runForAllPeople(): Promise<{ updated: number; errors: number }> {
    const registry = new PersonRegistry(this.workspacePath)
    const people = registry.list().filter(p => p.relacao === 'liderado')
    let updated = 0
    let errors = 0

    for (const person of people) {
      if (!person.jiraEmail && !person.githubUsername) continue

      try {
        const result = await this.externalPass.run(person.slug)
        if (result) {
          updated++
        } else {
          // null result means integrations disabled or no identity — not an error
        }
      } catch (err) {
        errors++
        log.warn('scheduler refresh falhou', { slug: person.slug, error: err instanceof Error ? err.message : String(err) })
      }

      // Small delay between people to respect rate limits
      await sleep(200)
    }

    log.info('scheduler bulk refresh completo', { updated, errors, total: people.length })
    return { updated, errors }
  }

  // ── State persistence ─────────────────────────────────────────

  private loadState(): SchedulerState {
    if (!existsSync(this.statePath)) {
      return { lastDailyRun: null, lastSprintId: null, lastSprintName: null }
    }
    try {
      return JSON.parse(readFileSync(this.statePath, 'utf-8')) as SchedulerState
    } catch {
      return { lastDailyRun: null, lastSprintId: null, lastSprintName: null }
    }
  }

  private saveState(state: SchedulerState): void {
    const dir = join(this.workspacePath, '..', CACHE_DIR_NAME)
    mkdirSync(dir, { recursive: true })
    writeFileSync(this.statePath, JSON.stringify(state, null, 2), 'utf-8')
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

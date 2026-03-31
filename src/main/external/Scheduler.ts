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

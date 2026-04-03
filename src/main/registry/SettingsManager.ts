import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { execSync } from 'child_process'

export type LLMProvider = 'claude-cli' | 'openrouter'

export type IngestionOperation =
  | 'ingestionPass1'
  | 'ingestionPass2'
  | 'ceremonySinals'
  | 'ingestionDeep1on1'
  | 'profileCompression'
  | 'agendaGeneration'
  | 'cycleReport'
  | 'autoAvaliacao'
  | 'weeklySynthesis'

export interface OperationProviderConfig {
  provider: LLMProvider
  model?: string
  fallbackToClaude?: boolean
}

export interface AppSettings {
  workspacePath: string
  claudeBinPath: string
  managerName?: string
  managerRole?: string
  /** Modelo Claude padrão para todas as operações via claude-cli. Padrão: 'haiku'. Aceita: 'haiku', 'sonnet', 'opus' */
  claudeDefaultModel?: string
  /** @deprecated Use claudeDefaultModel. Modelo Claude para o Deep 1:1 especificamente. */
  ingestionModel?: string
  /** API key do OpenRouter. Armazenada em plaintext (uso pessoal). */
  openRouterApiKey?: string
  /** @deprecated Use defaultProvider='openrouter' em vez de useHybridModel */
  useHybridModel?: boolean
  /** Modelo OpenRouter padrão. Ex: 'google/gemma-3-27b-it' */
  openRouterModel?: string
  /** API key do Google AI (Gemini) para pré-processamento de transcrições. Armazenada em plaintext. */
  googleAiApiKey?: string
  /** Ativar pré-processamento Gemini (limpa transcrições antes de enviar ao modelo). Só tem efeito se googleAiApiKey presente. */
  useGeminiPreprocessing?: boolean
  /** Provider padrão global. Todas as operações sem override usam este. */
  defaultProvider?: LLMProvider
  /** Override de provider por operação. Operações sem override herdam defaultProvider. */
  providers?: Partial<Record<IngestionOperation, OperationProviderConfig>>

  // Jira
  jiraBaseUrl?: string
  jiraEmail?: string
  jiraApiToken?: string
  jiraProjectKey?: string
  jiraBoardId?: number
  jiraEnabled?: boolean

  // GitHub
  githubToken?: string
  githubOrg?: string
  githubTeamSlug?: string
  githubRepos?: string[]
  githubReposCachedAt?: string
  githubEnabled?: boolean

  // Relatórios
  dailyReportEnabled?: boolean
  dailyReportTime?: string
  sprintReportEnabled?: boolean

  // App state
  lastOpenedAt?: string  // ISO 8601

  // Sustentação
  jiraSupportBoardId?: number
  jiraSupportProjectKey?: string
  /** Threshold de SLA por tipo de issue (tipo → dias). Padrão: todos os tipos com 5 dias. */
  jiraSlaThresholds?: Record<string, number>
  /** Mapeamento regex→tema para categorizar tickets de suporte por assunto. Ex: {"saldo|balance": "Divergência de Saldo"} */
  jiraSupportCategories?: Record<string, string>
}

const SETTINGS_DIR  = join(homedir(), '.pulsecockpit')
const SETTINGS_FILE = join(SETTINGS_DIR, 'settings.json')

function detectClaudeBin(): string {
  // When launched as a packaged app, PATH is limited and doesn't include
  // paths set in .zshrc/.bashrc. Use a login shell to get the full PATH.
  for (const shell of ['zsh', 'bash']) {
    try {
      const result = execSync(`${shell} -l -c "which claude"`, {
        encoding: 'utf-8',
        timeout: 5000,
      }).trim()
      if (result) return result
    } catch { /* try next */ }
  }
  return ''
}

const DEFAULTS: AppSettings = {
  workspacePath:  join(homedir(), 'PulseCockpit'),
  claudeBinPath:  detectClaudeBin(),
  managerName:    '',
  managerRole:    '',
  githubTeamSlug: '',
  githubRepos:    [],
}

export const SettingsManager = {
  load(): AppSettings {
    if (!existsSync(SETTINGS_FILE)) return { ...DEFAULTS }
    try {
      const raw = readFileSync(SETTINGS_FILE, 'utf-8')
      return { ...DEFAULTS, ...JSON.parse(raw) }
    } catch {
      return { ...DEFAULTS }
    }
  },

  save(settings: AppSettings): void {
    if (!existsSync(SETTINGS_DIR)) {
      mkdirSync(SETTINGS_DIR, { recursive: true })
    }
    writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8')
  },

  detectClaudeBin,
}

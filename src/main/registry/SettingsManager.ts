import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { execSync } from 'child_process'

export interface AppSettings {
  workspacePath: string
  claudeBinPath: string
  managerName?: string
  managerRole?: string
  /** API key do OpenRouter para modelo híbrido. Armazenada em plaintext (uso pessoal). */
  openRouterApiKey?: string
  /** Ativar modelo híbrido (OpenRouter para passes elegíveis). Só tem efeito se openRouterApiKey presente. */
  useHybridModel?: boolean
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

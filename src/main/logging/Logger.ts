import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readdirSync, statSync, createReadStream } from 'fs'
import { createWriteStream, WriteStream } from 'fs'
import { SettingsManager } from '../registry/SettingsManager'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  timestamp: string
  level: LogLevel
  module: string
  message: string
  data?: Record<string, unknown>
}

const SENSITIVE_KEYS = ['apiKey', 'token', 'password', 'secret', 'authorization']

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

function maskSensitive(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!data) return undefined
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      result[key] = '[REDACTED]'
    } else if (typeof value === 'object' && value !== null) {
      result[key] = maskSensitive(value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  }
  return result
}

function maskSensitiveValue(value: unknown): unknown {
  if (typeof value === 'string' && SENSITIVE_KEYS.some(sk => value.toLowerCase().includes(sk.toLowerCase()))) {
    return '[REDACTED]'
  }
  if (typeof value === 'object' && value !== null) {
    return maskSensitive(value as Record<string, unknown>)
  }
  return value
}

class Logger {
  private static instance: Logger

  private level: LogLevel = 'info'
  private logDir: string
  private currentStream: WriteStream | null = null
  private currentDate: string = ''
  private buffer: LogEntry[] = []
  private maxBufferSize = 2000
  private retentionDays = 7
  private mainWindowGetter: (() => Electron.BrowserWindow | null) | null = null

  private constructor() {
    this.logDir = join(app.getPath('userData'), 'logs')
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  setMainWindowGetter(fn: () => Electron.BrowserWindow | null): void {
    this.mainWindowGetter = fn
  }

  child(module: string): ModuleLogger {
    return new ModuleLogger(this, module)
  }

  setLevel(level: LogLevel): void {
    this.level = level
  }

  setRetentionDays(days: number): void {
    this.retentionDays = days
  }

  initFromSettings(): void {
    const settings = SettingsManager.load()
    if (settings.logLevel) {
      this.level = settings.logLevel
    }
    this.ensureDir()
    this.ensureStream()
    this.cleanOldLogs()
  }

  private ensureDir(): void {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true })
    }
  }

  private ensureStream(): void {
    const today = new Date().toISOString().slice(0, 10)
    if (this.currentDate === today && this.currentStream) return

    if (this.currentStream) {
      this.currentStream.end()
    }

    const fileName = `pulse-${today}.log`
    const filePath = join(this.logDir, fileName)
    this.currentStream = createWriteStream(filePath, { flags: 'a' })
    this.currentDate = today
  }

  private rotateIfNeeded(): void {
    const today = new Date().toISOString().slice(0, 10)
    if (today !== this.currentDate) {
      this.ensureStream()
    }
  }

  private write(entry: LogEntry): void {
    if (LEVEL_ORDER[entry.level] < LEVEL_ORDER[this.level]) return

    this.rotateIfNeeded()
    this.ensureStream()

    const maskedEntry = {
      ...entry,
      data: entry.data ? maskSensitive(entry.data) : undefined,
    }

    const line = JSON.stringify({
      ts: maskedEntry.timestamp,
      level: maskedEntry.level,
      mod: maskedEntry.module,
      msg: maskedEntry.message,
      data: maskedEntry.data,
    }) + '\n'

    this.currentStream?.write(line)

    this.buffer.push(entry)
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift()
    }

    const win = this.mainWindowGetter?.()
    if (win && !win.isDestroyed()) {
      win.webContents.send('log:entry', entry)
    }
  }

  private writeEntry(level: LogLevel, module: string, message: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      data,
    }
    this.write(entry)
  }

  cleanOldLogs(): void {
    if (!existsSync(this.logDir)) return
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - this.retentionDays)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    try {
      const files = readdirSync(this.logDir)
      for (const file of files) {
        if (!file.startsWith('pulse-') || !file.endsWith('.log')) continue
        const fileDate = file.slice(6, 16)
        if (fileDate < cutoffStr) {
          const filePath = join(this.logDir, file)
          try {
            const { unlinkSync } = require('fs')
            unlinkSync(filePath)
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }

  getRecentLogs(limit?: number, levelFilter?: LogLevel, moduleFilter?: string): LogEntry[] {
    let entries = [...this.buffer]
    if (levelFilter) {
      entries = entries.filter(e => e.level === levelFilter)
    }
    if (moduleFilter) {
      entries = entries.filter(e => e.module === moduleFilter)
    }
    const max = limit ?? 200
    return entries.slice(-max)
  }

  getLogFiles(): Array<{ name: string; size: number; date: string }> {
    if (!existsSync(this.logDir)) return []
    try {
      return readdirSync(this.logDir)
        .filter(f => f.startsWith('pulse-') && f.endsWith('.log'))
        .map(f => {
          const stats = statSync(join(this.logDir, f))
          return {
            name: f,
            size: stats.size,
            date: f.slice(6, 16),
          }
        })
        .sort((a, b) => b.date.localeCompare(a.date))
    } catch {
      return []
    }
  }

  readLogFile(fileName: string): string {
    const filePath = join(this.logDir, fileName)
    if (!existsSync(filePath)) return ''
    try {
      const { readFileSync } = require('fs')
      return readFileSync(filePath, 'utf-8')
    } catch {
      return ''
    }
  }
}

class ModuleLogger {
  constructor(private logger: Logger, private module: string) {}

  debug(message: string, data?: Record<string, unknown>): void {
    this.logger['writeEntry']('debug', this.module, message, data)
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.logger['writeEntry']('info', this.module, message, data)
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.logger['writeEntry']('warn', this.module, message, data)
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.logger['writeEntry']('error', this.module, message, data)
  }

  perf(message: string, startTime: number, data?: Record<string, unknown>): void {
    const elapsed = Date.now() - startTime
    this.logger['writeEntry']('info', this.module, message, { elapsed, ...data })
  }
}

export { Logger, ModuleLogger }
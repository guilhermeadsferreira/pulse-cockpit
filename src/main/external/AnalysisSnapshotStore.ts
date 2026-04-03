import * as fs from 'fs'
import * as path from 'path'
import { Logger } from '../logging/Logger'
import type { TicketAnalysisSnapshot } from '../../renderer/src/types/ipc'

const log = Logger.getInstance().child('AnalysisSnapshotStore')

const DEFAULT_RETENTION_DAYS = 30

/**
 * Persistência de snapshots de análise por ticket.
 * Armazena um JSON por dia em {cacheDir}/sustentacao/analises/.
 */
export class AnalysisSnapshotStore {
  private readonly dir: string

  constructor(cacheDir: string) {
    this.dir = path.join(cacheDir, 'sustentacao', 'analises')
    this.ensureDir()
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true })
    }
  }

  private filePath(date: string): string {
    return path.join(this.dir, `${date}.json`)
  }

  /** Salva snapshot do dia (sobrescreve se já existe para o mesmo dia) */
  save(snapshot: TicketAnalysisSnapshot): void {
    try {
      this.ensureDir()
      fs.writeFileSync(this.filePath(snapshot.date), JSON.stringify(snapshot, null, 2), 'utf-8')
      log.info('Análise salva', { date: snapshot.date, tickets: snapshot.tickets.length })
    } catch (err) {
      log.error('Falha ao salvar análise', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  /** Carrega análise mais recente disponível (null se nenhuma) */
  loadLatest(): TicketAnalysisSnapshot | null {
    const dates = this.listDates()
    if (dates.length === 0) return null
    return this.loadByDate(dates[dates.length - 1])
  }

  /** Carrega análise por data (YYYY-MM-DD), retorna null se não existe */
  loadByDate(date: string): TicketAnalysisSnapshot | null {
    const fp = this.filePath(date)
    if (!fs.existsSync(fp)) return null
    try {
      return JSON.parse(fs.readFileSync(fp, 'utf-8')) as TicketAnalysisSnapshot
    } catch (err) {
      log.warn('Falha ao ler análise', { date, error: err instanceof Error ? err.message : String(err) })
      return null
    }
  }

  /** Lista datas disponíveis em ordem crescente */
  listDates(): string[] {
    this.ensureDir()
    try {
      return fs.readdirSync(this.dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', ''))
        .sort()
    } catch {
      return []
    }
  }

  /** Remove análises mais antigas que retentionDays */
  cleanup(retentionDays: number = DEFAULT_RETENTION_DAYS): void {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - retentionDays)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    for (const date of this.listDates()) {
      if (date < cutoffStr) {
        try {
          fs.unlinkSync(this.filePath(date))
          log.info('Análise removida (retenção)', { date })
        } catch {
          // ignore
        }
      }
    }
  }
}

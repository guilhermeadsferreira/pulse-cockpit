import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { Logger } from '../logging/Logger'

const log = Logger.getInstance().child('MetricsWriter')

// ── Types ──────────────────────────────────────────────────────

export interface AlertEntry {
  tipo: 'blocker' | 'wip_alto' | 'cycle_time'
  descricao: string
  desde: string
}

export interface WeeklyEntry {
  semana: string
  velocity: number
  deltaSP: number | null
  prsMerged: number
  reviews: number
  collaborationScore: number
  cycleTimeMedio: number
}

export interface SprintEntry {
  nome: string
  spEntregues: number
  spPlanejados: number
  cycleTimeMedio: number
  entregas: string[]
  bloqueios: string[]
}

export interface MonthlyEntry {
  mes: string
  destaques: string[]
  pontosAtencao: string[]
  deltasVsMesAnterior: Record<string, string>
}

export interface MomentoAtualEntry {
  velocity: string
  cycleTime: string
  codeReview: string
  alertasAtivos: number
}

export interface SustentacaoWeeklyEntry {
  semana: string        // formato "YYYY-MM-DD a YYYY-MM-DD"
  ticketsAbertos: number
  breachCount: number
  complianceRate7d: number | null
}

// ── Section delimiters ─────────────────────────────────────────

const SECTIONS = {
  MOMENTO_ATUAL:       { open: '<!-- METRICAS:MOMENTO_ATUAL -->',       close: '<!-- FIM:MOMENTO_ATUAL -->' },
  ALERTAS:             { open: '<!-- METRICAS:ALERTAS -->',             close: '<!-- FIM:ALERTAS -->' },
  SEMANAS:             { open: '<!-- METRICAS:SEMANAS -->',             close: '<!-- FIM:SEMANAS -->' },
  SPRINTS:             { open: '<!-- METRICAS:SPRINTS -->',             close: '<!-- FIM:SPRINTS -->' },
  MESES:               { open: '<!-- METRICAS:MESES -->',               close: '<!-- FIM:MESES -->' },
  SUSTENTACAO_ANALISE: { open: '<!-- METRICAS:SUSTENTACAO_ANALISE -->', close: '<!-- FIM:SUSTENTACAO_ANALISE -->' },
  SUSTENTACAO_SEMANAL: { open: '<!-- METRICAS:SUSTENTACAO_SEMANAL -->', close: '<!-- FIM:SUSTENTACAO_SEMANAL -->' },
} as const

type SectionKey = keyof typeof SECTIONS

// ── Retention limits ───────────────────────────────────────────

const RETENTION: Partial<Record<SectionKey, number>> = {
  SEMANAS: 12,
  SPRINTS: 6,
  MESES: 6,
  SUSTENTACAO_SEMANAL: 12,
}

// ── MetricsWriter ──────────────────────────────────────────────

export class MetricsWriter {
  private pessoasDir: string

  constructor(workspacePath: string) {
    this.pessoasDir = join(workspacePath, 'pessoas')
  }

  // ── Public methods ─────────────────────────────────────────

  writeAlerts(slug: string, alerts: AlertEntry[]): void {
    const filePath = this.ensureFile(slug)
    let content = readFileSync(filePath, 'utf-8')

    let newSection: string
    if (alerts.length === 0) {
      newSection = '## Alertas Ativos\n\nNenhum alerta ativo.\n'
    } else {
      const lines = ['## Alertas Ativos', '']
      for (const a of alerts) {
        lines.push(`- **${a.tipo}**: ${a.descricao} (desde ${a.desde})`)
      }
      lines.push('')
      newSection = lines.join('\n')
    }

    content = this.replaceSection(content, 'ALERTAS', newSection)
    writeFileSync(filePath, content, 'utf-8')
    log.debug('alertas persistidos', { slug, count: alerts.length })
  }

  writeWeekly(slug: string, entry: WeeklyEntry): void {
    const filePath = this.ensureFile(slug)
    let content = readFileSync(filePath, 'utf-8')

    let deltaStr: string
    if (entry.deltaSP === null) {
      deltaStr = '(sem comparacao)'
    } else if (entry.deltaSP === 0) {
      deltaStr = '(=)'
    } else if (entry.deltaSP > 0) {
      deltaStr = `(+${entry.deltaSP} vs semana anterior)`
    } else {
      deltaStr = `(${entry.deltaSP} vs semana anterior)`
    }

    const entryLines = [
      `### Semana ${entry.semana}`,
      `- velocity: ${entry.velocity} SP ${deltaStr}`,
      `- PRs merged: ${entry.prsMerged}`,
      `- reviews: ${entry.reviews}`,
      `- collaboration: ${entry.collaborationScore}`,
      `- cycle time medio: ${entry.cycleTimeMedio}d`,
      '',
    ].join('\n')

    content = this.appendToSection(content, 'SEMANAS', entryLines)
    content = this.applyRetentionToContent(content, 'SEMANAS', RETENTION.SEMANAS!)
    writeFileSync(filePath, content, 'utf-8')
    log.debug('metricas semanais persistidas', { slug, semana: entry.semana })
  }

  writeSprint(slug: string, entry: SprintEntry): void {
    const filePath = this.ensureFile(slug)
    let content = readFileSync(filePath, 'utf-8')

    const lines = [
      `### Sprint ${entry.nome}`,
      `- SP entregues: ${entry.spEntregues}/${entry.spPlanejados}`,
      `- cycle time medio: ${entry.cycleTimeMedio}d`,
    ]
    if (entry.entregas.length > 0) {
      lines.push(`- entregas: ${entry.entregas.join(', ')}`)
    }
    if (entry.bloqueios.length > 0) {
      lines.push(`- bloqueios: ${entry.bloqueios.join(', ')}`)
    }
    lines.push('')

    const entryText = lines.join('\n')

    content = this.appendToSection(content, 'SPRINTS', entryText)
    content = this.applyRetentionToContent(content, 'SPRINTS', RETENTION.SPRINTS!)
    writeFileSync(filePath, content, 'utf-8')
    log.debug('metricas de sprint persistidas', { slug, sprint: entry.nome })
  }

  writeMonthly(slug: string, entry: MonthlyEntry): void {
    const filePath = this.ensureFile(slug)
    let content = readFileSync(filePath, 'utf-8')

    const lines = [`### Mes ${entry.mes}`]
    if (entry.destaques.length > 0) {
      lines.push(`- destaques: ${entry.destaques.join('; ')}`)
    }
    if (entry.pontosAtencao.length > 0) {
      lines.push(`- pontos de atencao: ${entry.pontosAtencao.join('; ')}`)
    }
    const deltas = Object.entries(entry.deltasVsMesAnterior)
    if (deltas.length > 0) {
      for (const [key, val] of deltas) {
        lines.push(`- ${key}: ${val}`)
      }
    }
    lines.push('')

    const entryText = lines.join('\n')

    content = this.appendToSection(content, 'MESES', entryText)
    content = this.applyRetentionToContent(content, 'MESES', RETENTION.MESES!)
    writeFileSync(filePath, content, 'utf-8')
    log.debug('metricas mensais persistidas', { slug, mes: entry.mes })
  }

  updateMomentoAtual(slug: string, momento: MomentoAtualEntry): void {
    const filePath = this.ensureFile(slug)
    let content = readFileSync(filePath, 'utf-8')

    const newSection = [
      '## Momento Atual',
      `- velocity: ${momento.velocity}`,
      `- cycle time: ${momento.cycleTime}`,
      `- code review: ${momento.codeReview}`,
      `- alertas ativos: ${momento.alertasAtivos}`,
      '',
    ].join('\n')

    content = this.replaceSection(content, 'MOMENTO_ATUAL', newSection)
    writeFileSync(filePath, content, 'utf-8')
    log.debug('momento atual atualizado', { slug })
  }

  writeSustentacaoAnalysis(slug: string, analysis: string): void {
    const filePath = this.ensureFile(slug)
    const content = readFileSync(filePath, 'utf-8')
    const date = new Date().toISOString().slice(0, 10)
    const rendered = `**Análise de Sustentação — ${date}**\n\n${analysis}`
    const updated = this.replaceSection(content, 'SUSTENTACAO_ANALISE', rendered)
    writeFileSync(filePath, updated, 'utf-8')
    log.info('MetricsWriter: sustentação análise salva', { slug })
  }

  writeSustentacaoWeekly(slug: string, entry: SustentacaoWeeklyEntry): void {
    try {
      const filePath = this.ensureFile(slug)
      let content = readFileSync(filePath, 'utf-8')

      const complianceStr = entry.complianceRate7d !== null ? `${entry.complianceRate7d}%` : '—'
      const entryLine = `| ${entry.semana} | ${entry.ticketsAbertos} | ${entry.breachCount} | ${complianceStr} |`

      const { open, close } = SECTIONS.SUSTENTACAO_SEMANAL
      const openIdx = content.indexOf(open)
      const closeIdx = content.indexOf(close)

      if (openIdx === -1 || closeIdx === -1) {
        // Section does not exist — build full block with header and first row
        const block = [
          '### Sustentação Semanal',
          '',
          '| Semana | Abertos | Breach | SLA 7d |',
          '|--------|---------|--------|--------|',
          entryLine,
          '',
        ].join('\n')
        content = content.trimEnd() + '\n\n' + open + '\n' + block + '\n' + close + '\n'
      } else {
        // Section exists — extract rows, prepend new entry, apply retention, rewrite
        const sectionInner = content.slice(openIdx + open.length, closeIdx)
        const TABLE_SEP = '|--------|---------|--------|--------|'
        const sepIdx = sectionInner.indexOf(TABLE_SEP)

        let existingRows: string[] = []
        let header: string
        if (sepIdx !== -1) {
          // Extract rows that are data rows (start with '|', not separator/header)
          const afterSep = sectionInner.slice(sepIdx + TABLE_SEP.length + 1)
          existingRows = afterSep
            .split('\n')
            .filter(l => l.startsWith('|') && !l.startsWith('|-----'))
          header = sectionInner.slice(0, sepIdx + TABLE_SEP.length)
        } else {
          header = [
            '',
            '### Sustentação Semanal',
            '',
            '| Semana | Abertos | Breach | SLA 7d |',
            TABLE_SEP,
          ].join('\n')
        }

        // Prepend new row and apply retention (max 12)
        const allRows = [entryLine, ...existingRows].slice(0, RETENTION.SUSTENTACAO_SEMANAL!)
        const newInner = header + '\n' + allRows.join('\n') + '\n'
        content = content.slice(0, openIdx + open.length) + newInner + content.slice(closeIdx)
      }

      writeFileSync(filePath, content, 'utf-8')
      log.debug('sustentacao semanal persistida', { slug, semana: entry.semana })
    } catch (err) {
      log.warn('falha ao persistir sustentacao semanal', { slug, error: err instanceof Error ? err.message : String(err) })
    }
  }

  // ── Section management (private) ──────────────────────────

  private readSection(content: string, sectionKey: SectionKey): string {
    const { open, close } = SECTIONS[sectionKey]
    const openIdx = content.indexOf(open)
    const closeIdx = content.indexOf(close)
    if (openIdx === -1 || closeIdx === -1) return ''
    return content.slice(openIdx + open.length + 1, closeIdx).trimEnd()
  }

  private replaceSection(content: string, sectionKey: SectionKey, newContent: string): string {
    const { open, close } = SECTIONS[sectionKey]
    const openIdx = content.indexOf(open)
    const closeIdx = content.indexOf(close)

    if (openIdx === -1 || closeIdx === -1) {
      // Section not found — append at end
      return content.trimEnd() + '\n\n' + open + '\n' + newContent + '\n' + close + '\n'
    }

    return content.slice(0, openIdx + open.length) + '\n' + newContent + '\n' + content.slice(closeIdx)
  }

  private appendToSection(content: string, sectionKey: SectionKey, entryText: string): string {
    const { open, close } = SECTIONS[sectionKey]
    const closeIdx = content.indexOf(close)

    if (closeIdx === -1) {
      // Section not found — add it with the entry
      return content.trimEnd() + '\n\n' + open + '\n' + entryText + '\n' + close + '\n'
    }

    // Insert entry just before the closing delimiter
    return content.slice(0, closeIdx) + entryText + '\n' + content.slice(closeIdx)
  }

  private applyRetention(sectionContent: string, maxEntries: number): string {
    const entries = sectionContent.split(/(?=^### )/m).filter(e => e.trim().length > 0)
    if (entries.length <= maxEntries) return sectionContent
    // Keep the most recent entries (appended at the end)
    const kept = entries.slice(entries.length - maxEntries)
    return kept.join('')
  }

  private applyRetentionToContent(content: string, sectionKey: SectionKey, maxEntries: number): string {
    const sectionContent = this.readSection(content, sectionKey)
    if (!sectionContent) return content
    const trimmed = this.applyRetention(sectionContent, maxEntries)
    if (trimmed === sectionContent) return content
    // Find the section header (## ...) inside the section content and preserve it
    const headerMatch = sectionContent.match(/^(## .+\n)/)
    const header = headerMatch ? headerMatch[1] : ''
    const trimmedWithHeader = header + trimmed
    return this.replaceSection(content, sectionKey, trimmedWithHeader)
  }

  // ── File management ───────────────────────────────────────

  private ensureFile(slug: string): string {
    const personDir = join(this.pessoasDir, slug)
    const filePath = join(personDir, 'metricas.md')

    if (existsSync(filePath)) return filePath

    if (!existsSync(personDir)) {
      mkdirSync(personDir, { recursive: true })
    }

    const template = [
      `# Metricas — ${slug}`,
      '',
      SECTIONS.MOMENTO_ATUAL.open,
      '## Momento Atual',
      'Sem dados ainda.',
      SECTIONS.MOMENTO_ATUAL.close,
      '',
      SECTIONS.ALERTAS.open,
      '## Alertas Ativos',
      'Nenhum alerta ativo.',
      SECTIONS.ALERTAS.close,
      '',
      SECTIONS.SEMANAS.open,
      '## Semanas',
      SECTIONS.SEMANAS.close,
      '',
      SECTIONS.SPRINTS.open,
      '## Sprints',
      SECTIONS.SPRINTS.close,
      '',
      SECTIONS.MESES.open,
      '## Meses',
      SECTIONS.MESES.close,
      '',
    ].join('\n')

    writeFileSync(filePath, template, 'utf-8')
    log.info('metricas.md criado', { slug, path: filePath })
    return filePath
  }
}

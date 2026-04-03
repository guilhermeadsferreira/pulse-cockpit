import { existsSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { join } from 'path'
import yaml from 'js-yaml'
import { PersonRegistry, type PersonConfig } from '../registry/PersonRegistry'
import { ActionRegistry } from '../registry/ActionRegistry'
import { SettingsManager, type AppSettings } from '../registry/SettingsManager'
import { runWithProvider } from '../ingestion/ClaudeRunner'
import { buildWeeklySynthesisPrompt, type WeeklySynthesisInput, type WeeklySynthesisResult } from '../prompts/weekly-synthesis.prompt'
import { Logger } from '../logging/Logger'

const log = Logger.getInstance().child('WeeklySynthesis')

const SINTESE_OPEN = '<!-- BLOCO GERENCIADO PELA IA — síntese semanal, sobrescrita a cada semana -->'
const SINTESE_CLOSE = '<!-- FIM BLOCO SINTESE_SEMANAL -->'

// Metricas.md section markers (must match MetricsWriter)
const METRICAS_SECTIONS: Record<string, { open: string; close: string }> = {
  MOMENTO_ATUAL:       { open: '<!-- METRICAS:MOMENTO_ATUAL -->',       close: '<!-- FIM:MOMENTO_ATUAL -->' },
  ALERTAS:             { open: '<!-- METRICAS:ALERTAS -->',             close: '<!-- FIM:ALERTAS -->' },
  SUSTENTACAO_SEMANAL: { open: '<!-- METRICAS:SUSTENTACAO_SEMANAL -->', close: '<!-- FIM:SUSTENTACAO_SEMANAL -->' },
}

export class WeeklySynthesisRunner {
  private workspacePath: string

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath
  }

  async runForPerson(slug: string, settings: AppSettings): Promise<void> {
    const input = this.buildInput(slug)
    if (!input) {
      log.debug('dados insuficientes, pulando', { slug })
      return
    }

    const prompt = buildWeeklySynthesisPrompt(input)
    const claudeBinPath = settings.claudeBinPath
    if (!claudeBinPath) {
      log.warn('claudeBinPath não configurado')
      return
    }

    const result = await runWithProvider('weeklySynthesis', settings, prompt, {
      claudeBinPath,
      claudeTimeoutMs: 60_000,
      openRouterTimeoutMs: 60_000,
    })

    if (!result.success) {
      log.warn('prompt falhou', { slug, error: result.error })
      return
    }

    let parsed: WeeklySynthesisResult
    try {
      const clean = result.output.replace(/```json|```/g, '').trim()
      const jsonMatch = clean.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('no JSON found')
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      log.warn('parse JSON falhou', { slug })
      return
    }

    if (!parsed.estado_geral || !parsed.paragrafo || !parsed.para_proxima_1on1) {
      log.warn('campos obrigatórios ausentes', { slug })
      return
    }

    this.persistToProfile(slug, parsed)
    log.info('síntese persistida', { slug, estado: parsed.estado_geral })
  }

  async runForAllLiderados(settings: AppSettings): Promise<void> {
    const registry = new PersonRegistry(this.workspacePath)
    const liderados = registry.list().filter(p => p.relacao === 'liderado')

    // Batches of 3 to avoid overwhelming Claude
    for (let i = 0; i < liderados.length; i += 3) {
      const batch = liderados.slice(i, i + 3)
      await Promise.allSettled(
        batch.map(p => this.runForPerson(p.slug, settings).catch(err =>
          log.warn('falhou para pessoa', { slug: p.slug, error: err instanceof Error ? err.message : String(err) })
        ))
      )
    }
  }

  private buildInput(slug: string): WeeklySynthesisInput | null {
    const registry = new PersonRegistry(this.workspacePath)
    const person = registry.get(slug)
    if (!person) return null

    const perfilPath = join(this.workspacePath, 'pessoas', slug, 'perfil.md')
    if (!existsSync(perfilPath)) return null
    const perfilRaw = readFileSync(perfilPath, 'utf-8')

    const metricasPath = join(this.workspacePath, 'pessoas', slug, 'metricas.md')
    const metricasRaw = existsSync(metricasPath) ? readFileSync(metricasPath, 'utf-8') : ''

    const momentoAtual = extractMetricasSection(metricasRaw, 'MOMENTO_ATUAL')
    const alertasAtivos = extractMetricasSection(metricasRaw, 'ALERTAS')
    const sustentacaoSemanal = extractMetricasSection(metricasRaw, 'SUSTENTACAO_SEMANAL')

    // Actions
    const actionRegistry = new ActionRegistry(this.workspacePath)
    const acoes = actionRegistry.list(slug)
    const hoje = new Date()
    const acoesAbertas = acoes.filter(a => a.status === 'open' || a.status === 'in_progress')
    const acoesResumo = acoesAbertas.length === 0
      ? 'Nenhuma ação aberta'
      : acoesAbertas.map(a => {
          const vencida = a.prazo && new Date(a.prazo) < hoje ? ' [VENCIDA]' : ''
          const ciclos = (a as Record<string, unknown>).ciclos_sem_mencao as number ?? 0
          const abandonada = ciclos >= 2 ? ' [RISCO ABANDONO]' : ''
          return `- ${a.descricao ?? a.texto}${vencida}${abandonada}`
        }).join('\n')

    // PDI
    const pdi = person.pdi ?? []
    const pdiResumo = pdi.length === 0
      ? 'Sem PDI cadastrado'
      : pdi.map(p => `- [${p.status}] ${p.objetivo} (prazo: ${p.prazo ?? 'indefinido'})`).join('\n')

    // External data
    const extPath = join(this.workspacePath, 'pessoas', slug, 'external_data.yaml')
    let workloadScore = 'desconhecido'
    let issuesAbertas = 0
    let blockersAtivos = 0
    let commits30d = 0
    let prsMerged30d = 0
    let collaborationScore = 0

    if (existsSync(extPath)) {
      try {
        const ext = yaml.load(readFileSync(extPath, 'utf-8')) as Record<string, unknown>
        const atual = ext.atual as Record<string, unknown> | undefined
        if (atual) {
          const jira = atual.jira as Record<string, unknown> | undefined
          const github = atual.github as Record<string, unknown> | undefined
          if (jira) {
            workloadScore = (jira.workloadScore as string) ?? 'desconhecido'
            issuesAbertas = (jira.issuesAbertas as number) ?? 0
            const blockers = jira.blockersAtivos as unknown[] | undefined
            blockersAtivos = blockers?.length ?? 0
          }
          if (github) {
            commits30d = (github.commits30d as number) ?? 0
            prsMerged30d = (github.prsMerged30d as number) ?? 0
            collaborationScore = (github.collaborationScore as number) ?? 0
          }
        }
      } catch { /* graceful */ }
    }

    return {
      nome: person.nome,
      perfilResumo: perfilRaw.slice(0, 2000),
      momentoAtual: momentoAtual || 'Sem dados',
      alertasAtivos: alertasAtivos || '',
      sustentacaoSemanal: sustentacaoSemanal || '',
      acoesResumo,
      pdiResumo,
      workloadScore,
      issuesAbertas,
      blockersAtivos,
      commits30d,
      prsMerged30d,
      collaborationScore,
    }
  }

  private persistToProfile(slug: string, result: WeeklySynthesisResult): void {
    const perfilPath = join(this.workspacePath, 'pessoas', slug, 'perfil.md')
    if (!existsSync(perfilPath)) return

    let content = readFileSync(perfilPath, 'utf-8')
    const hoje = new Date().toISOString().slice(0, 10)
    const estadoEmoji: Record<string, string> = { verde: '🟢', amarelo: '🟡', vermelho: '🔴' }
    const emoji = estadoEmoji[result.estado_geral] ?? '🟡'

    const lines = [
      `## Síntese Semanal`,
      '',
      `**${emoji} ${hoje} · confiança ${result.confianca}**`,
      '',
      result.paragrafo,
      '',
      `**Próxima 1:1:** ${result.para_proxima_1on1}`,
    ]

    if (result.sinais_convergentes) {
      lines.push('')
      lines.push(`**Sinais convergentes:** ${result.sinais_convergentes}`)
    }

    const sectionBody = lines.join('\n')

    if (content.includes(SINTESE_CLOSE)) {
      // Replace existing section
      const openIdx = content.indexOf(SINTESE_OPEN)
      const closeIdx = content.indexOf(SINTESE_CLOSE)
      if (openIdx !== -1 && closeIdx !== -1) {
        content = content.slice(0, openIdx + SINTESE_OPEN.length) + '\n' + sectionBody + '\n' + content.slice(closeIdx)
      }
    } else {
      // Append new section before ## Pontos de Atenção (or at end)
      const insertBefore = content.indexOf('## Pontos de Atenção')
      if (insertBefore !== -1) {
        content = content.slice(0, insertBefore) +
          SINTESE_OPEN + '\n' + sectionBody + '\n' + SINTESE_CLOSE + '\n\n' +
          content.slice(insertBefore)
      } else {
        content = content.trimEnd() + '\n\n' + SINTESE_OPEN + '\n' + sectionBody + '\n' + SINTESE_CLOSE + '\n'
      }
    }

    const tmpPath = perfilPath + '.tmp'
    writeFileSync(tmpPath, content, 'utf-8')
    renameSync(tmpPath, perfilPath)
  }
}

function extractMetricasSection(content: string, key: string): string {
  const section = METRICAS_SECTIONS[key]
  if (!section) return ''
  const openIdx = content.indexOf(section.open)
  const closeIdx = content.indexOf(section.close)
  if (openIdx === -1 || closeIdx === -1) return ''
  return content.slice(openIdx + section.open.length, closeIdx).trim()
}

import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import { writeFileSync, readFileSync, mkdirSync, readdirSync, unlinkSync, copyFileSync, existsSync } from 'fs'
import { SettingsManager } from './registry/SettingsManager'
import { PersonRegistry } from './registry/PersonRegistry'
import { DetectedRegistry } from './registry/DetectedRegistry'
import { ActionRegistry } from './registry/ActionRegistry'
import { DemandaRegistry } from './registry/DemandaRegistry'
import { CicloRegistry } from './registry/CicloRegistry'
import { setupWorkspace } from './workspace/WorkspaceSetup'
import { runClaudePrompt, runWithProvider } from './ingestion/ClaudeRunner'
import { readFile } from './ingestion/FileReader'
import { FileWatcher } from './ingestion/FileWatcher'
import { buildAgendaPrompt, renderAgendaMarkdown, type AgendaAIResult, type DeltaSinceLastMeeting } from './prompts/agenda.prompt'
import { buildGestorAgendaPrompt, renderGestorAgendaMarkdown, type AgendaGestorAIResult } from './prompts/agenda-gestor.prompt'
import { buildCyclePrompt, renderCycleMarkdown, type CycleAIResult } from './prompts/cycle.prompt'
import { buildGestorCicloPrompt, renderGestorCicloMarkdown, type GestorCicloAIResult } from './prompts/gestor-ciclo.prompt'
import { buildAutoavaliacaoPrompt, renderAutoavaliacaoMarkdown, type AutoavaliacaoAIResult } from './prompts/autoavaliacao.prompt'
import type { CycleReportParams, AutoavaliacaoParams, DemandaStatus } from '../renderer/src/types/ipc'
import { Logger, type LogLevel } from './logging'
import { Scheduler } from './external/Scheduler'
import { ExternalDataPass } from './external/ExternalDataPass'
import { DailyReportGenerator } from './external/DailyReportGenerator'
import { WeeklyReportGenerator } from './external/WeeklyReportGenerator'
import { MonthlyReportGenerator } from './external/MonthlyReportGenerator'
import { GitHubClient } from './external/GitHubClient'
import { SystemAuditor } from './audit/SystemAuditor'
import { fetchSupportBoardMetricsWithIssues, calcularAlertas } from './external/SupportBoardClient'
import type { SupportBoardSnapshot, SustentacaoHistoryEntry } from '../renderer/src/types/ipc'
import { buildSustentacaoPrompt } from './prompts/sustentacao-analysis.prompt'
import { MetricsWriter } from './external/MetricsWriter'
import yaml from 'js-yaml'

interface ExternalJiraSnapshot {
  sprintAtual?: { nome: string; id: number } | null
  issuesAbertas: number
  issuesFechadasSprint: number
  storyPointsSprint: number
  workloadScore: 'alto' | 'medio' | 'baixo'
  bugsAtivos: number
  blockersAtivos: Array<{ key: string; summary: string }>
  tempoMedioCicloDias: number
}

interface ExternalGitHubSnapshot {
  commits30d: number
  commitsPorSemana: number
  prsMerged30d: number
  prsAbertos: number
  prsRevisados: number
  tempoMedioAbertoDias: number
  tempoMedioReviewDias: number
  tamanhoMedioPR: { additions: number; deletions: number }
  avgCommentsPerReview?: number
  firstReviewTurnaroundDias?: number
  approvalRate?: number
  collaborationScore?: number
  testCoverageRatio?: number
}

interface ExternalCrossInsight {
  tipo: string
  severidade: 'alta' | 'media' | 'baixa'
  descricao: string
  evidencia?: string
  acaoSugerida?: string
  causa_raiz?: string
}

interface ExternalDataSnapshot {
  atualizadoEm: string
  jira: ExternalJiraSnapshot | null
  github: ExternalGitHubSnapshot | null
  insights: ExternalCrossInsight[]
}

function validateExternalSnapshot(data: unknown): ExternalDataSnapshot | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (typeof d.atualizadoEm !== 'string') return null
  return {
    atualizadoEm: d.atualizadoEm,
    jira: (d.jira && typeof d.jira === 'object') ? d.jira as ExternalDataSnapshot['jira'] : null,
    github: (d.github && typeof d.github === 'object') ? d.github as ExternalDataSnapshot['github'] : null,
    insights: Array.isArray(d.insights) ? d.insights as ExternalDataSnapshot['insights'] : [],
  }
}

const APP_ICON = app.isPackaged
  ? join(process.resourcesPath, 'Logo.png')
  : join(__dirname, '../../Logo.png')

let mainWindow: BrowserWindow | null = null
let fileWatcher:  FileWatcher  | null = null

function getRegistry(): PersonRegistry {
  const { workspacePath } = SettingsManager.load()
  return new PersonRegistry(workspacePath)
}

/**
 * Gera pauta de 1:1 para uma pessoa. Extraida do handler IPC para reuso pelo Scheduler.
 * Retorna o resultado da geracao ou throws em caso de erro.
 */
export async function generateAgendaForPerson(
  slug: string,
  workspacePath: string,
  claudeBinPath: string,
): Promise<{ success: boolean; pauta?: string; path?: string; error?: string }> {
  const registry = new PersonRegistry(workspacePath)
  const person = registry.get(slug)
  if (!person) return { success: false, error: 'Pessoa não encontrada.' }

  const configRaw = registry.getConfigRaw(slug)
  const perfilData = registry.getPerfil(slug)
  if (!perfilData) {
    return { success: false, error: 'Perfil não encontrado. Ingira pelo menos um artefato primeiro.' }
  }

  const today = new Date().toISOString().slice(0, 10)
  const pautasAnteriores = registry.getLastPautas(slug, 2)
  const openActions = new ActionRegistry(workspacePath)
    .list(slug)
    .filter((a) => a.status === 'open')
    .map((a) => ({ texto: a.texto, criadoEm: a.criadoEm }))

  const settings = SettingsManager.load()
  let markdown: string

  if (person.relacao === 'gestor') {
    const liderados = registry.getTeamRollup()
    const prompt = buildGestorAgendaPrompt({
      configYaml: configRaw,
      perfilMd: perfilData.raw,
      today,
      liderados,
      pautasAnteriores,
      openActions,
    })
    const result = await runWithProvider('agendaGeneration', settings, prompt, {
      claudeBinPath,
      claudeTimeoutMs: 90_000,
      openRouterTimeoutMs: 90_000,
    })
    if (!result.success || !result.data) {
      return { success: false, error: result.error || 'Falha ao gerar pauta.' }
    }
    const agendaResult = result.data as AgendaGestorAIResult
    markdown = renderGestorAgendaMarkdown(person.nome, today, agendaResult)
  } else {
    const ultimaIngestao = (perfilData.frontmatter.ultima_ingestao as string)
      || (perfilData.frontmatter.ultima_atualizacao as string)?.slice(0, 10)
      || null
    const dadosStale = ultimaIngestao
      ? (Date.now() - new Date(ultimaIngestao).getTime()) > 30 * 24 * 60 * 60 * 1000
      : false
    const actionReg = new ActionRegistry(workspacePath)
    const enrichedActions = actionReg.list(slug)
      .filter((a) => a.status === 'open')
      .map((a) => ({
        texto: a.texto,
        descricao: (a as Record<string, unknown>).descricao as string | undefined,
        criadoEm: a.criadoEm,
        owner: a.owner,
        tipo: (a as Record<string, unknown>).tipo as string | undefined,
        contexto: (a as Record<string, unknown>).contexto as string | undefined,
        ciclos_sem_mencao: (a as Record<string, unknown>).ciclos_sem_mencao as number | undefined,
      }))

    const insightsMatch = perfilData.raw.match(/## Insights de 1:1\n[\s\S]*?<!--[^>]*-->\n([\s\S]*?)<!--/)
    const insightsRecentes = insightsMatch?.[1]?.trim()
      ?.split('\n').filter(Boolean).slice(-5).join('\n') || ''

    const sinaisMatch = perfilData.raw.match(/## Sinais de Terceiros\n[\s\S]*?<!--[^>]*-->\n([\s\S]*?)<!--/)
    const sinaisTerceiros = sinaisMatch?.[1]?.trim() || ''

    const pdiMatch = configRaw.match(/pdi:\n([\s\S]*?)(?=\n\w|\n$|$)/)
    const pdiEstruturado = pdiMatch?.[1]?.trim() || ''

    const externalMatch = perfilData.raw.match(/## Dados Externos\n[\s\S]*?<!--[^>]*-->\n([\s\S]*?)<!--/)
    const externalData = externalMatch?.[1]?.trim() || ''

    // Compute delta since last 1:1
    let deltaSinceLastMeeting: DeltaSinceLastMeeting | undefined
    const ultimo1on1 = perfilData.frontmatter.ultimo_1on1 as string | null
    if (ultimo1on1) {
      const artifacts = registry.listArtifacts(slug)
      const newIngestions = artifacts.filter(a => a.date > ultimo1on1).length

      const saudeMatch = perfilData.raw.match(/## Histórico de Saúde\n[\s\S]*?<!--[^>]*-->\n([\s\S]*?)<!--/)
      const saudeLines = (saudeMatch?.[1] || '').split('\n').filter(l => l.startsWith('- '))
      const healthChanges = saudeLines
        .filter(l => {
          const dateMatch = l.match(/^- (\d{4}-\d{2}-\d{2})/)
          return dateMatch && dateMatch[1] > ultimo1on1
        })
        .map(l => l.replace(/^- /, '').slice(0, 80))
        .slice(-3)

      const overdueActions = enrichedActions.filter(a => {
        const prazo = (a as Record<string, unknown>).prazo as string | undefined
        return prazo && prazo < today && prazo >= ultimo1on1
      }).length

      const atencaoMatch = perfilData.raw.match(/## Pontos de Atenção\n[\s\S]*?<!--[^>]*-->\n([\s\S]*?)<!--/)
      const atencaoLines = (atencaoMatch?.[1] || '').split('\n').filter(l => l.startsWith('- '))
      const newAttentionPoints = atencaoLines.filter(l => {
        const dateMatch = l.match(/\((\d{4}-\d{2}-\d{2})\)/)
        return dateMatch && dateMatch[1] > ultimo1on1
      }).length

      if (newIngestions > 0 || healthChanges.length > 0 || overdueActions > 0 || newAttentionPoints > 0) {
        deltaSinceLastMeeting = { newIngestions, healthChanges, overdueActions, newAttentionPoints }
      }
    }

    const pautaRatings = registry.listPautaRatings(slug).slice(0, 5)

    const prompt = buildAgendaPrompt({ configYaml: configRaw, perfilMd: perfilData.raw, today, dadosStale, pautasAnteriores, openActions: enrichedActions, insightsRecentes, sinaisTerceiros, pdiEstruturado, externalData, deltaSinceLastMeeting, pautaRatings })
    const result = await runWithProvider('agendaGeneration', settings, prompt, {
      claudeBinPath,
      claudeTimeoutMs: 90_000,
      openRouterTimeoutMs: 90_000,
    })
    if (!result.success || !result.data) {
      return { success: false, error: result.error || 'Falha ao gerar pauta.' }
    }
    const agendaResult = result.data as AgendaAIResult
    markdown = renderAgendaMarkdown(person.nome, today, agendaResult)
  }

  registry.savePauta(slug, today, markdown)
  const filePath = join(workspacePath, 'pessoas', slug, 'pautas', `${today}-pauta.md`)
  return { success: true, path: filePath, pauta: markdown }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: '#0B0D11',
    icon: APP_ICON,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (process.env['VITE_DEV_SERVER_URL']) {
    mainWindow.loadURL(process.env['VITE_DEV_SERVER_URL'])
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpcHandlers(): void {
  // ── Debug ─────────────────────────────────────────────────
  ipcMain.handle('ipc:ping', () => ({ ok: true, ts: Date.now() }))

  // ── Logging ───────────────────────────────────────────────
  ipcMain.handle('log:write', (_event, level: LogLevel, module: string, message: string, data?: Record<string, unknown>) => {
    const child = Logger.getInstance().child(module)
    child[level](message, data) as unknown as void
  })

  ipcMain.handle('log:recent', (_event, opts?: { limit?: number; level?: LogLevel; module?: string }) => {
    return Logger.getInstance().getRecentLogs(opts?.limit, opts?.level, opts?.module)
  })

  ipcMain.handle('log:files', () => {
    return Logger.getInstance().getLogFiles()
  })

  ipcMain.handle('log:read-file', (_event, fileName: string) => {
    return Logger.getInstance().readLogFile(fileName)
  })

  // ── Settings ──────────────────────────────────────────────
  ipcMain.handle('settings:load', () => SettingsManager.load())

  ipcMain.handle('settings:save', (_event, settings) => {
    SettingsManager.save(settings)
  })

  ipcMain.handle('settings:detect-claude', () => SettingsManager.detectClaudeBin())

  ipcMain.handle('settings:setup-workspace', async (_event, workspacePath: string) => {
    await setupWorkspace(workspacePath)
    // Restart file watcher pointing at the new workspace
    if (fileWatcher) {
      fileWatcher.stop()
      fileWatcher = new FileWatcher(workspacePath)
      fileWatcher.start()
    }
  })

  ipcMain.handle('settings:select-folder', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Selecionar pasta do workspace',
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // ── People ────────────────────────────────────────────────
  ipcMain.handle('people:list', () => {
    return getRegistry().list()
  })

  ipcMain.handle('people:get', (_event, slug: string) => {
    return getRegistry().get(slug)
  })

  ipcMain.handle('people:save', async (_event, config) => {
    getRegistry().save(config)
    // Always try to sync pending inbox items (person may have been registered after processing)
    if (fileWatcher) {
      const count = await fileWatcher.reprocessPending(config.slug)
      if (count > 0) Logger.getInstance().child('IPC').info('pending synced', { slug: config.slug, count })
    }
  })

  ipcMain.handle('people:delete', (_event, slug: string) => {
    getRegistry().delete(slug)
  })

  // ── Artifacts ─────────────────────────────────────────────
  ipcMain.handle('artifacts:list', (_event, slug: string) => {
    return getRegistry().listArtifacts(slug)
  })

  ipcMain.handle('artifacts:feed', () => {
    return getRegistry().listAllArtifacts()
  })

  ipcMain.handle('artifacts:read', (_event, filePath: string) => {
    try {
      return readFileSync(filePath, 'utf-8')
    } catch {
      return ''
    }
  })

  ipcMain.handle('artifacts:open', (_event, slug: string, fileName: string) => {
    const { workspacePath } = SettingsManager.load()
    const filePath = join(workspacePath, 'pessoas', slug, 'historico', fileName)
    if (existsSync(filePath)) shell.openPath(filePath)
  })

  // ── Resumo Executivo RH (último disponível nos artefatos 1:1) ──
  ipcMain.handle('people:last-resumo-rh', (_event, slug: string) => {
    const { workspacePath } = SettingsManager.load()
    const historicoDir = join(workspacePath, 'pessoas', slug, 'historico')
    if (!existsSync(historicoDir)) return null
    try {
      const files = readdirSync(historicoDir)
        .filter((f) => f.endsWith('.md'))
        .sort()
        .reverse()
      for (const file of files) {
        const content = readFileSync(join(historicoDir, file), 'utf-8')
        const match = content.match(/## Resumo Executivo \(Qulture Rocks\)\n\n([\s\S]+?)(?:\n---|\n##|$)/)
        if (match) {
          const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})/)
          return { resumo: match[1].trim(), date: dateMatch?.[1] ?? null, artifact: file }
        }
      }
      return null
    } catch {
      return null
    }
  })

  // ── Pautas ────────────────────────────────────────────────
  ipcMain.handle('people:list-pautas', (_event, slug: string) => {
    return getRegistry().listPautas(slug)
  })

  ipcMain.handle('people:rate-pauta', (_event, slug: string, date: string, rating: 'util' | 'precisa_melhorar', nota?: string) => {
    getRegistry().savePautaRating(slug, date, rating, nota)
  })

  ipcMain.handle('people:list-pauta-ratings', (_event, slug: string) => {
    return getRegistry().listPautaRatings(slug)
  })

  // ── People: Perfil vivo ───────────────────────────────────
  ipcMain.handle('people:get-perfil', (_event, slug: string) => {
    const { workspacePath } = SettingsManager.load()
    const registry = new PersonRegistry(workspacePath)
    const perfil = registry.getPerfil(slug)
    if (!perfil) return null
    // Inject computed fields so UI doesn't need separate IPC calls
    const openCount = new ActionRegistry(workspacePath).list(slug).filter((a) => a.status === 'open').length
    perfil.frontmatter.acoes_pendentes_count = openCount
    const ultimaIngestao = (perfil.frontmatter.ultima_ingestao as string)
      || (perfil.frontmatter.ultima_atualizacao as string)?.slice(0, 10)
      || null
    perfil.frontmatter.dados_stale = ultimaIngestao
      ? (Date.now() - new Date(ultimaIngestao).getTime()) > 30 * 24 * 60 * 60 * 1000
      : false

    // Detect ceremony-only profiles
    const totalArtefatos = (perfil.frontmatter.total_artefatos as number) ?? 0
    const saudeBlock = perfil.raw.match(/## Histórico de Saúde[\s\S]*?<!-- FIM BLOCO SAUDE -->/)?.[0] ?? ''
    const ceremonySignalCount = saudeBlock.split('\n').filter(l => l.startsWith('- ')).length
    if (totalArtefatos === 0 && ceremonySignalCount > 5) {
      perfil.frontmatter.sugestao_ingestao = `Sinais de ${ceremonySignalCount} cerimônias sem ingestão direta`
    }

    return perfil
  })

  // ── Detected people ───────────────────────────────────────
  ipcMain.handle('detected:list', () => {
    const settings = SettingsManager.load()
    const managerSlug = (settings.managerName ?? '').trim().toLowerCase().replace(/\s+/g, '-')
    const all = new DetectedRegistry(settings.workspacePath).list()
    return managerSlug ? all.filter((p) => p.slug !== managerSlug) : all
  })

  ipcMain.handle('detected:dismiss', (_event, slug: string) => {
    const { workspacePath } = SettingsManager.load()
    new DetectedRegistry(workspacePath).dismiss(slug)
  })

  // ── Ingestion ─────────────────────────────────────────────
  ipcMain.handle('ingestion:queue', () => {
    return fileWatcher ? fileWatcher.getQueue() : []
  })

  ipcMain.handle('ingestion:enqueue', (_event, filePath: string) => {
    if (fileWatcher) fileWatcher.enqueue(filePath)
  })

  ipcMain.handle('ingestion:batch-reingest', async (_event, filePaths: string[]) => {
    if (!fileWatcher) return { processed: 0, errors: ['FileWatcher não inicializado'] }
    return fileWatcher.batchReingest(filePaths)
  })

  ipcMain.handle('ingestion:reset-data', () => {
    const { workspacePath } = SettingsManager.load()
    return FileWatcher.resetGeneratedData(workspacePath)
  })

  ipcMain.handle('ingestion:reset-person-data', (_event, slug: string) => {
    const { workspacePath } = SettingsManager.load()
    const { existsSync, rmSync, mkdirSync, readdirSync } = require('fs')
    const { join } = require('path')

    const personDir = join(workspacePath, 'pessoas', slug)
    if (!existsSync(personDir)) return false

    const perfilPath = join(personDir, 'perfil.md')
    if (existsSync(perfilPath)) rmSync(perfilPath)
    const bakPath = perfilPath + '.bak'
    if (existsSync(bakPath)) rmSync(bakPath)

    const actionsPath = join(personDir, 'actions.yaml')
    if (existsSync(actionsPath)) rmSync(actionsPath)

    const historicoDir = join(personDir, 'historico')
    if (existsSync(historicoDir)) {
      rmSync(historicoDir, { recursive: true })
      mkdirSync(historicoDir, { recursive: true })
    }

    const pautasDir = join(personDir, 'pautas')
    if (existsSync(pautasDir)) {
      rmSync(pautasDir, { recursive: true })
      mkdirSync(pautasDir, { recursive: true })
    }

    Logger.getInstance().child('IPC').warn('person data reset', { slug })
    return true
  })

  ipcMain.handle('ingestion:list-processados', () => {
    const { workspacePath } = SettingsManager.load()
    const processadosDir = require('path').join(workspacePath, 'inbox', 'processados')
    const { existsSync, readdirSync } = require('fs')
    if (!existsSync(processadosDir)) return []
    return readdirSync(processadosDir)
      .filter((f: string) => /\.(md|txt|pdf)$/i.test(f))
      .sort() // alphabetical = chronological when filenames start with date
      .map((f: string) => require('path').join(processadosDir, f))
  })

  // ── AI ────────────────────────────────────────────────────
  ipcMain.handle('ai:test', async () => {
    const log = Logger.getInstance().child('IPC')
    log.debug('ai:test handler called')
    const settings = SettingsManager.load()
    log.debug('ai:test claudeBinPath', { claudeBinPath: settings.claudeBinPath || '(empty)' })
    if (!settings.claudeBinPath) {
      return { success: false, error: 'Claude CLI não configurado. Configure o caminho em Settings.' }
    }
    const prompt = 'Respond with ONLY this exact JSON and nothing else: {"status":"ok","message":"Claude Code CLI funcionando!"}'
    return runClaudePrompt(settings.claudeBinPath, prompt, 30_000)
  })

  ipcMain.handle('ai:generate-agenda', async (_event, slug: string) => {
    const settings = SettingsManager.load()
    if (!settings.claudeBinPath) {
      return { success: false, error: 'Claude CLI não configurado. Configure o caminho em Settings.' }
    }
    try {
      return await generateAgendaForPerson(slug, settings.workspacePath, settings.claudeBinPath)
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('ai:cycle-report', async (_event, params: CycleReportParams) => {
    const { personSlug, periodoInicio, periodoFim } = params
    const settings = SettingsManager.load()
    if (!settings.claudeBinPath) {
      return { success: false, error: 'Claude CLI não configurado. Configure o caminho em Settings.' }
    }
    const registry = getRegistry()
    const person = registry.get(personSlug)
    if (!person) return { success: false, error: 'Pessoa não encontrada.' }

    const configRaw = registry.getConfigRaw(personSlug)
    const perfilData = registry.getPerfil(personSlug)
    if (!perfilData) {
      return { success: false, error: 'Perfil não encontrado. Ingira artefatos antes de gerar o relatório.' }
    }

    const artifacts = registry.listArtifactsWithContent(personSlug, periodoInicio, periodoFim)

    // V2 enrichments for cycle report
    const insightsMatch = perfilData.raw.match(/## Insights de 1:1\n[\s\S]*?<!--[^>]*-->\n([\s\S]*?)<!--/)
    const insights1on1 = insightsMatch?.[1]?.trim() || ''

    const sinaisMatch = perfilData.raw.match(/## Sinais de Terceiros\n[\s\S]*?<!--[^>]*-->\n([\s\S]*?)<!--/)
    const correlacoes = sinaisMatch?.[1]?.trim() || ''

    // Follow-up history: count cumpridas vs abandonadas
    const actionReg = new ActionRegistry(settings.workspacePath)
    const allActions = actionReg.list(personSlug)
    const cumpridas = allActions.filter(a => a.status === 'done').length
    const abandonadas = allActions.filter(a => a.status === 'cancelled').length
    const abertas = allActions.filter(a => a.status === 'open').length
    const followupHistorico = allActions.length > 0
      ? `Ações no período: ${cumpridas} cumpridas, ${abandonadas} abandonadas, ${abertas} em aberto (total: ${allActions.length})`
      : ''

    // Tendencia emocional from frontmatter
    const tendencia = perfilData.frontmatter.tendencia_emocional as string || ''
    const notaTendencia = perfilData.frontmatter.nota_tendencia as string || ''
    const tendenciaEmocional = tendencia ? `${tendencia}${notaTendencia ? ` — ${notaTendencia}` : ''}` : ''

    // PDI evolution
    const pdiMatch = configRaw.match(/pdi:\n([\s\S]*?)(?=\n\w|\n$|$)/)
    const pdiEvolucao = pdiMatch?.[1]?.trim() || ''

    // Extract Dados Externos section from perfil.md
    const externalMatchCycle = perfilData.raw.match(/## Dados Externos\n[\s\S]*?<!--[^>]*-->\n([\s\S]*?)<!--/)
    const externalData = externalMatchCycle?.[1]?.trim() || ''

    const { prompt, truncatedArtifacts, totalArtifacts } = buildCyclePrompt({
      configYaml: configRaw, perfilMd: perfilData.raw, artifacts, periodoInicio, periodoFim,
      insights1on1, correlacoes, followupHistorico, tendenciaEmocional, pdiEvolucao, externalData,
    })

    if (truncatedArtifacts > 0) {
      Logger.getInstance().child('IPC').warn('cycle report context truncated', { truncated: totalArtifacts - truncatedArtifacts, total: totalArtifacts, personSlug })
    }

    const result = await runWithProvider('cycleReport', settings, prompt, {
      claudeBinPath: settings.claudeBinPath,
      claudeTimeoutMs: 120_000,
      openRouterTimeoutMs: 120_000,
    })
    if (!result.success || !result.data) {
      return { success: false, error: result.error || 'Falha ao gerar relatório de ciclo.' }
    }

    const cycleResult = result.data as CycleAIResult
    const today = new Date().toISOString().slice(0, 10)
    const markdown = renderCycleMarkdown(person.nome, periodoInicio, periodoFim, cycleResult)

    const fileName = `${today}-${personSlug}-ciclo.md`
    const filePath = join(settings.workspacePath, 'exports', fileName)
    writeFileSync(filePath, markdown, 'utf-8')

    return { success: true, path: filePath, markdown, result: cycleResult, truncatedArtifacts }
  })

  // ── Actions ───────────────────────────────────────────────
  ipcMain.handle('actions:list', (_event, slug: string) => {
    const { workspacePath } = SettingsManager.load()
    return new ActionRegistry(workspacePath).list(slug)
  })

  ipcMain.handle('actions:save', (_event, action: unknown) => {
    const { workspacePath } = SettingsManager.load()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new ActionRegistry(workspacePath).save(action as any)
  })

  ipcMain.handle('actions:update-status', (_event, slug: string, id: string, status: string) => {
    const { workspacePath } = SettingsManager.load()
    new ActionRegistry(workspacePath).updateStatus(slug, id, status as 'open' | 'done' | 'cancelled')
  })

  ipcMain.handle('actions:delete', (_event, slug: string, id: string) => {
    const { workspacePath } = SettingsManager.load()
    new ActionRegistry(workspacePath).delete(slug, id)
  })

  // ── Demandas (Módulo Eu) ──────────────────────────────────
  ipcMain.handle('demandas:list', () => {
    const { workspacePath } = SettingsManager.load()
    return new DemandaRegistry(workspacePath).list()
  })

  ipcMain.handle('demandas:list-by-person', (_event, personSlug: string) => {
    const { workspacePath } = SettingsManager.load()
    return new DemandaRegistry(workspacePath).list().filter((d) => d.pessoaSlug === personSlug && d.status === 'open')
  })

  ipcMain.handle('demandas:save', (_event, demanda) => {
    const { workspacePath } = SettingsManager.load()
    new DemandaRegistry(workspacePath).save(demanda)
  })

  ipcMain.handle('demandas:delete', (_event, id: string) => {
    const { workspacePath } = SettingsManager.load()
    new DemandaRegistry(workspacePath).delete(id)
  })

  ipcMain.handle('demandas:update-status', (_event, id: string, status: DemandaStatus, addToCiclo: boolean) => {
    const { workspacePath } = SettingsManager.load()
    const updated = new DemandaRegistry(workspacePath).updateStatus(id, status)
    if (addToCiclo && updated && status === 'done') {
      new CicloRegistry(workspacePath).addManualEntry(
        `[Demanda concluída] ${updated.descricao} (origem: ${updated.origem})`
      )
    }
    return updated
  })

  // ── Ciclo (Módulo Eu) ─────────────────────────────────────
  ipcMain.handle('ciclo:list', () => {
    const { workspacePath } = SettingsManager.load()
    return new CicloRegistry(workspacePath).listEntries()
  })

  ipcMain.handle('ciclo:add-manual', (_event, texto: string) => {
    const { workspacePath } = SettingsManager.load()
    return new CicloRegistry(workspacePath).addManualEntry(texto)
  })

  ipcMain.handle('ciclo:delete', (_event, id: string) => {
    const { workspacePath } = SettingsManager.load()
    new CicloRegistry(workspacePath).deleteEntry(id)
  })

  ipcMain.handle('ciclo:ingest-artifact', async (_event, filePath: string) => {
    const settings = SettingsManager.load()
    if (!settings.claudeBinPath) {
      return { success: false, error: 'Claude CLI não configurado. Configure o caminho em Settings.' }
    }
    try {
      const { text } = await readFile(filePath)
      const today = new Date().toISOString().slice(0, 10)
      const prompt = buildGestorCicloPrompt({
        managerName:     settings.managerName ?? 'Gestor',
        managerRole:     settings.managerRole ?? '',
        artifactContent: text,
        today,
      })
      const result = await runWithProvider('autoAvaliacao', settings, prompt, {
        claudeBinPath: settings.claudeBinPath,
        claudeTimeoutMs: 90_000,
        openRouterTimeoutMs: 90_000,
      })
      if (!result.success || !result.data) {
        return { success: false, error: result.error || 'Falha na ingestão do artefato.' }
      }
      const aiResult = result.data as GestorCicloAIResult
      const markdown = renderGestorCicloMarkdown(settings.managerName ?? 'Gestor', aiResult, text)
      const titleSlug = aiResult.titulo
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 40)
      const fileName = `${aiResult.data_artefato}-${titleSlug}.md`
      const cicloReg = new CicloRegistry(settings.workspacePath)
      const savedPath = cicloReg.writeArtifact(fileName, markdown)
      const entry = {
        id:       `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        tipo:     'artifact' as const,
        texto:    aiResult.resumo,
        titulo:   aiResult.titulo,
        criadoEm: aiResult.data_artefato,
        filePath: savedPath,
      }
      cicloReg.addArtifactEntryToLog(entry)
      return { success: true, entry }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('ciclo:autoavaliacao', async (_event, params: AutoavaliacaoParams) => {
    const { periodoInicio, periodoFim } = params
    const settings = SettingsManager.load()
    if (!settings.claudeBinPath) {
      return { success: false, error: 'Claude CLI não configurado. Configure o caminho em Settings.' }
    }
    try {
      const cicloReg = new CicloRegistry(settings.workspacePath)
      const artifacts = cicloReg.listArtifactsWithContent(periodoInicio, periodoFim)
      const allEntries = cicloReg.listEntries()
      const manualEntries = allEntries
        .filter((e) => e.tipo === 'manual' && e.criadoEm >= periodoInicio && e.criadoEm <= periodoFim)
        .map((e) => e.texto)
      const prompt = buildAutoavaliacaoPrompt({
        managerName:   settings.managerName ?? 'Gestor',
        managerRole:   settings.managerRole ?? '',
        artifacts,
        manualEntries,
        periodoInicio,
        periodoFim,
      })
      const result = await runWithProvider('autoAvaliacao', settings, prompt, {
        claudeBinPath: settings.claudeBinPath,
        claudeTimeoutMs: 120_000,
        openRouterTimeoutMs: 120_000,
      })
      if (!result.success || !result.data) {
        return { success: false, error: result.error || 'Falha ao gerar autoavaliação.' }
      }
      const aiResult = result.data as AutoavaliacaoAIResult
      const today = new Date().toISOString().slice(0, 10)
      const markdown = renderAutoavaliacaoMarkdown(
        settings.managerName ?? 'Gestor',
        periodoInicio,
        periodoFim,
        aiResult,
      )
      const exportsDir = join(settings.workspacePath, 'exports')
      mkdirSync(exportsDir, { recursive: true })
      const fileName = `${today}-autoavaliacao.md`
      const filePath = join(exportsDir, fileName)
      writeFileSync(filePath, markdown, 'utf-8')
      return { success: true, path: filePath, markdown, result: aiResult }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // ── Shell ─────────────────────────────────────────────────
  ipcMain.handle('shell:open', (_event, filePath: string) => {
    return shell.openPath(filePath)
  })

  // ── Auto-update ───────────────────────────────────────────
  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall()
  })

  ipcMain.handle('update:get-status', () => lastUpdateStatus)

  // ── Refinamentos ──────────────────────────────────────────
  ipcMain.handle('refinamentos:list', () => {
    const { workspacePath } = SettingsManager.load()
    const dir = join(workspacePath, 'refinamentos')
    if (!existsSync(dir)) return []
    return readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .sort((a, b) => b.localeCompare(a))
      .map((fileName) => {
        const match = fileName.match(/^(\d{4}-\d{2}-\d{2})-/)
        return {
          fileName,
          filePath: join(dir, fileName),
          date: match ? match[1] : '',
        }
      })
  })

  ipcMain.handle('refinamentos:save', (_event, srcPath: string) => {
    const { workspacePath } = SettingsManager.load()
    const dir = join(workspacePath, 'refinamentos')
    mkdirSync(dir, { recursive: true })
    const today = new Date().toISOString().slice(0, 10)
    const baseName = srcPath.split('/').pop() ?? 'doc.md'
    const destName = baseName.startsWith(/^\d{4}-/.source) ? baseName : `${today}-${baseName}`
    copyFileSync(srcPath, join(dir, destName))
    return destName
  })

  ipcMain.handle('refinamentos:read', (_event, filePath: string) => {
    return readFileSync(filePath, 'utf-8')
  })

  ipcMain.handle('refinamentos:delete', (_event, filePath: string) => {
    if (existsSync(filePath)) unlinkSync(filePath)
  })

  // ── External Intelligence ─────────────────────────────────
  ipcMain.handle('external:refresh-daily', async () => {
    const { workspacePath } = SettingsManager.load()
    const log = Logger.getInstance().child('IPC')
    log.info('external:refresh-daily chamado')
    const scheduler = new Scheduler(workspacePath)
    try {
      const result = await scheduler.generateDailyReport()
      log.info('external:refresh-daily sucesso', { result })
      return result
    } catch (err) {
      log.error('external:refresh-daily erro', { error: err instanceof Error ? err.message : String(err) })
      throw err
    }
  })

  ipcMain.handle('external:refresh-sprint', async () => {
    const { workspacePath } = SettingsManager.load()
    const scheduler = new Scheduler(workspacePath)
    return scheduler.generateSprintReport()
  })

  ipcMain.handle('external:refresh-weekly', async () => {
    const { workspacePath } = SettingsManager.load()
    const generator = new WeeklyReportGenerator(workspacePath)
    return generator.generate()
  })

  ipcMain.handle('external:refresh-monthly', async (_event, yearMonth?: string) => {
    const { workspacePath } = SettingsManager.load()
    const generator = new MonthlyReportGenerator(workspacePath)
    return generator.generate(yearMonth)
  })

  ipcMain.handle('external:regenerate-report', async (_event, reportName: string) => {
    const { workspacePath } = SettingsManager.load()
    const log = Logger.getInstance().child('IPC')
    log.info('external:regenerate-report chamado', { reportName })

    if (reportName.startsWith('Daily-')) {
      const generator = new DailyReportGenerator(workspacePath)
      const dateMatch = reportName.match(/Daily-(\d{2})-(\d{2})-(\d{4})/)
      const date = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : undefined
      return generator.generate(date, true)
    }
    if (reportName.startsWith('Weekly-')) {
      const generator = new WeeklyReportGenerator(workspacePath)
      const match = reportName.match(/Weekly-(\d{2})-(\d{2})-(\d{4})-a-(\d{2})-(\d{2})-(\d{4})/)
      if (match) {
        const start = `${match[3]}-${match[2]}-${match[1]}`
        const end = `${match[6]}-${match[5]}-${match[4]}`
        return generator.generate(start, end, true)
      }
      return generator.generate(undefined, undefined, true)
    }
    if (reportName.startsWith('Monthly-')) {
      const generator = new MonthlyReportGenerator(workspacePath)
      const match = reportName.match(/Monthly-(\d{2})-(\d{4})/)
      const yearMonth = match ? `${match[2]}-${match[1]}` : undefined
      return generator.generate(yearMonth, true)
    }
    if (reportName.startsWith('sprint_')) {
      throw new Error('Sprint reports cannot be regenerated without active sprint context')
    }
    throw new Error(`Unknown report type: ${reportName}`)
  })

  ipcMain.handle('external:get-data', async (_event, slug: string): Promise<ExternalDataSnapshot | null> => {
    const { workspacePath } = SettingsManager.load()
    const yamlPath = join(workspacePath, 'pessoas', slug, 'external_data.yaml')
    if (!existsSync(yamlPath)) return null
    try {
      const raw = readFileSync(yamlPath, 'utf-8')
      const parsed = yaml.load(raw)
      if (!parsed || typeof parsed !== 'object') return null
      const doc = parsed as Record<string, unknown>
      const snapshot = doc.atual ?? doc
      return validateExternalSnapshot(snapshot)
    } catch {
      return null
    }
  })

  ipcMain.handle('external:get-historico', async (_event, slug: string) => {
    const { workspacePath } = SettingsManager.load()
    const pass = new ExternalDataPass(workspacePath)
    return pass.loadHistorico(slug) ?? null
  })

  ipcMain.handle('external:list-reports', () => {
    const { workspacePath } = SettingsManager.load()
    const reportsDir = join(workspacePath, 'relatorios')
    if (!existsSync(reportsDir)) return []
    try {
      return readdirSync(reportsDir)
        .filter(f => f.endsWith('.md'))
        .map(f => {
          const stat = require('fs').statSync(join(reportsDir, f))
          return { name: f, date: stat.mtime.toISOString().slice(0, 10), size: stat.size }
        })
        .sort((a, b) => b.date.localeCompare(a.date))
    } catch {
      return []
    }
  })

  ipcMain.handle('external:get-report', (_event, reportPath: string) => {
    const { workspacePath } = SettingsManager.load()
    const fullPath = join(workspacePath, 'relatorios', reportPath)
    if (!existsSync(fullPath)) return ''
    try {
      return readFileSync(fullPath, 'utf-8')
    } catch {
      return ''
    }
  })

  ipcMain.handle('external:refresh-person', async (_event, slug: string) => {
    const { workspacePath } = SettingsManager.load()
    const scheduler = new Scheduler(workspacePath)
    return scheduler.refreshPerson(slug)
  })

  ipcMain.handle('github:sync-team-repos', async () => {
    const settings = SettingsManager.load()
    const { githubToken, githubOrg, githubTeamSlug } = settings

    if (!githubToken || !githubOrg || !githubTeamSlug) {
      return { success: false, error: 'Token, organização e team slug são obrigatórios' }
    }

    try {
      const client = new GitHubClient({ token: githubToken, org: githubOrg, repos: [] })
      const repos = await client.listTeamRepos(githubTeamSlug)
      SettingsManager.save({
        ...settings,
        githubRepos: repos,
        githubReposCachedAt: new Date().toISOString(),
      })
      return { success: true, repos }
    } catch (err) {
      const ghErr = err as { status?: number; message?: string }
      let errorMsg = 'Erro ao sincronizar repositórios'
      if (ghErr.status === 404) {
        errorMsg = 'Team não encontrado ou sem acesso. Verifique o slug.'
      } else if (ghErr.status === 403) {
        errorMsg = 'Sem permissão para listar repos do team. Verifique as permissões do token.'
      } else if (ghErr.message) {
        errorMsg = ghErr.message
      }
      return { success: false, error: errorMsg }
    }
  })

  // ── Escalations ───────────────────────────────────────────────
  ipcMain.handle('actions:escalations', async () => {
    const settings = SettingsManager.load()
    const actionRegistry = new ActionRegistry(settings.workspacePath)
    const personRegistry = new PersonRegistry(settings.workspacePath)
    const liderados = personRegistry.list().filter(p => p.relacao === 'liderado')

    const allEscalations: Array<{
      slug: string
      nome: string
      gestorAction: { id: string; texto: string; descricao?: string; criadoEm: string }
      diasPendente: number
      relatedCount: number
    }> = []

    for (const person of liderados) {
      const escalations = actionRegistry.getEscalations(person.slug)
      for (const esc of escalations) {
        allEscalations.push({
          slug: person.slug,
          nome: person.nome,
          gestorAction: {
            id: esc.gestorAction.id,
            texto: esc.gestorAction.texto,
            descricao: esc.gestorAction.descricao,
            criadoEm: esc.gestorAction.criadoEm,
          },
          diasPendente: esc.diasPendente,
          relatedCount: esc.relatedLideradoActions.length,
        })
      }
    }

    return allEscalations
  })

  // ── Cross-Team Insights ────────────────────────────────────────
  ipcMain.handle('insights:cross-team', async () => {
    const settings = SettingsManager.load()
    const registry = new PersonRegistry(settings.workspacePath)
    const actionReg = new ActionRegistry(settings.workspacePath)
    const liderados = registry.list().filter(p => p.relacao === 'liderado')

    const insights: Array<{ tipo: string; descricao: string; pessoas: string[]; severidade: 'alta' | 'media' | 'baixa' }> = []

    // Coletar perfis e acoes de todos os liderados
    const perfilMap: Record<string, Record<string, unknown>> = {}
    const actionsMapCT: Record<string, import('../renderer/src/types/ipc').Action[]> = {}
    for (const p of liderados) {
      const perfilData = registry.getPerfil(p.slug)
      perfilMap[p.slug] = perfilData?.frontmatter ?? {}
      actionsMapCT[p.slug] = actionReg.list(p.slug)
    }

    // Insight 1: Multiplas pessoas com saude amarelo/vermelho
    const saudeAmarelo = liderados.filter(p => perfilMap[p.slug]?.saude === 'amarelo')
    const saudeVermelho = liderados.filter(p => perfilMap[p.slug]?.saude === 'vermelho')
    if (saudeVermelho.length >= 2) {
      insights.push({
        tipo: 'saude_critica_generalizada',
        descricao: `${saudeVermelho.length} pessoas com saude critica simultaneamente`,
        pessoas: saudeVermelho.map(p => p.nome),
        severidade: 'alta',
      })
    } else if (saudeAmarelo.length >= 3) {
      insights.push({
        tipo: 'saude_atencao_generalizada',
        descricao: `${saudeAmarelo.length} pessoas com saude em atencao — possivel problema sistemico`,
        pessoas: saudeAmarelo.map(p => p.nome),
        severidade: 'media',
      })
    }

    // Insight 2: Estagnacao em multiplos perfis
    const estagnacao = liderados.filter(p => perfilMap[p.slug]?.alerta_estagnacao)
    if (estagnacao.length >= 2) {
      insights.push({
        tipo: 'estagnacao_multipla',
        descricao: `${estagnacao.length} pessoas com estagnacao detectada — avaliar oportunidades e desafios`,
        pessoas: estagnacao.map(p => p.nome),
        severidade: 'media',
      })
    }

    // Insight 3: Muitas acoes vencidas no time
    const today = new Date().toISOString().slice(0, 10)
    const pessoasComVencidas = liderados.filter(p => {
      const vencidas = (actionsMapCT[p.slug] ?? []).filter(a => a.status === 'open' && a.prazo && a.prazo < today)
      return vencidas.length > 0
    })
    if (pessoasComVencidas.length >= 3) {
      insights.push({
        tipo: 'acoes_vencidas_generalizadas',
        descricao: `${pessoasComVencidas.length} pessoas com acoes vencidas — revisao de followup necessaria`,
        pessoas: pessoasComVencidas.map(p => p.nome),
        severidade: 'media',
      })
    }

    // Insight 4: Dados stale em muitas pessoas
    const stale = liderados.filter(p => perfilMap[p.slug]?.dados_stale)
    if (stale.length >= Math.ceil(liderados.length * 0.4) && stale.length >= 2) {
      insights.push({
        tipo: 'dados_desatualizados',
        descricao: `${stale.length} de ${liderados.length} pessoas sem dados ha 30+ dias — cadencia de ingestao baixa`,
        pessoas: stale.map(p => p.nome),
        severidade: 'baixa',
      })
    }

    // Insight 5: Nenhuma evolucao no time
    const comEvolucao = liderados.filter(p => perfilMap[p.slug]?.sinal_evolucao)
    if (liderados.length >= 3 && comEvolucao.length === 0) {
      insights.push({
        tipo: 'sem_evolucao',
        descricao: 'Nenhum liderado com sinal de evolucao — avaliar se ha oportunidades de crescimento',
        pessoas: [],
        severidade: 'baixa',
      })
    }

    // Insight 6: Tendencia emocional deteriorando em multiplos
    const deteriorando = liderados.filter(p => perfilMap[p.slug]?.tendencia_emocional === 'deteriorando')
    if (deteriorando.length >= 2) {
      insights.push({
        tipo: 'tendencia_deteriorando_multipla',
        descricao: `${deteriorando.length} pessoas com tendencia emocional deteriorando — possivel problema de equipe`,
        pessoas: deteriorando.map(p => p.nome),
        severidade: 'alta',
      })
    }

    return insights
  })

  // ── System Audit ─────────────────────────────────────────────
  ipcMain.handle('audit:run', async () => {
    const { workspacePath } = SettingsManager.load()
    try {
      const auditor = new SystemAuditor(workspacePath)
      return await auditor.run()
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ── Sustentacao Board ─────────────────────────────────────────
  function readHistory(historyFile: string): SustentacaoHistoryEntry[] {
    try {
      if (!existsSync(historyFile)) return []
      return JSON.parse(readFileSync(historyFile, 'utf-8')) as SustentacaoHistoryEntry[]
    } catch {
      // history.json corrompido ou inválido — retornar vazio sem propagar erro
      return []
    }
  }

  async function fetchAndCacheSustentacao(): Promise<SupportBoardSnapshot | null> {
    const settings = SettingsManager.load()
    const { jiraSupportProjectKey, jiraBaseUrl, jiraEmail, jiraApiToken, jiraSlaThresholds } = settings

    if (!jiraSupportProjectKey || !jiraBaseUrl || !jiraEmail || !jiraApiToken) {
      return null
    }

    const cacheDir = join(settings.workspacePath, '..', 'cache', 'sustentacao')
    const cacheFile = join(cacheDir, 'board.json')
    const CACHE_TTL_MS = 60 * 60 * 1000

    try {
      if (existsSync(cacheFile)) {
        const cached = JSON.parse(readFileSync(cacheFile, 'utf-8')) as { data: SupportBoardSnapshot; fetchedAt: number }
        if (Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
          Logger.getInstance().child('IPC').info('sustentacao:get-data cache hit')
          const historyFile = join(cacheDir, 'history.json')
          const historyData = readHistory(historyFile).slice(-30)
          // Cache hit — alertas calculados on-the-fly sobre dados cached (sem issues[] raw)
          // Graceful: sem issues raw disponivel no cache, alertas D-07 ficam silenciosos
          const alertasCached = calcularAlertas(cached.data, historyData, [], jiraSlaThresholds ?? {})
          return { ...cached.data, history: historyData, alertas: alertasCached }
        }
      }
    } catch { /* cache inválido — refetch */ }

    Logger.getInstance().child('IPC').info('sustentacao:get-data buscando board', { projectKey: jiraSupportProjectKey })

    const { snapshot: data, issues } = await fetchSupportBoardMetricsWithIssues({
      config: { baseUrl: jiraBaseUrl, email: jiraEmail, apiToken: jiraApiToken },
      projectKey: jiraSupportProjectKey,
      slaThresholds: jiraSlaThresholds,
    })

    try {
      if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true })
      writeFileSync(cacheFile, JSON.stringify({ data, fetchedAt: Date.now() }), 'utf-8')
    } catch (err) {
      Logger.getInstance().child('IPC').warn('sustentacao:get-data falha ao gravar cache', { error: err instanceof Error ? err.message : String(err) })
    }

    // Gravar snapshot no histórico diário (history.json)
    try {
      const historyFile = join(cacheDir, 'history.json')
      const dateKey = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

      const history = readHistory(historyFile)

      // Deduplica: remover entrada do mesmo dia (mantém apenas a mais recente)
      const filtered = history.filter((e) => e.date !== dateKey)

      // Append entrada de hoje (usar apenas campos agregados — sem ticketsEmBreach completo)
      filtered.push({
        date: dateKey,
        fetchedAt: Date.now(),
        ticketsAbertos: data.ticketsAbertos,
        ticketsFechadosUltimos30d: data.ticketsFechadosUltimos30d,
        breachCount: data.ticketsEmBreach.length,
        complianceRate7d: data.complianceRate7d,
        complianceRate30d: data.complianceRate30d,
      })

      // Retenção: 90 dias
      const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000
      const retained = filtered.filter((e) => e.fetchedAt >= cutoff)

      writeFileSync(historyFile, JSON.stringify(retained), 'utf-8')
    } catch (histErr) {
      Logger.getInstance().child('IPC').warn('sustentacao: falha ao gravar history (graceful)', {
        error: histErr instanceof Error ? histErr.message : String(histErr),
      })
    }

    // Calcular alertas proativos (per D-10, D-11)
    const historyForAlerts = readHistory(join(cacheDir, 'history.json'))
    const alertas = calcularAlertas(data, historyForAlerts, issues, jiraSlaThresholds ?? {})
    const dataComAlertas = { ...data, alertas }

    const historyFile = join(cacheDir, 'history.json')
    const historyData = readHistory(historyFile).slice(-30)
    return { ...dataComAlertas, history: historyData }
  }

  ipcMain.handle('sustentacao:get-data', async (): Promise<SupportBoardSnapshot | null> => {
    return fetchAndCacheSustentacao()
  })

  ipcMain.handle('sustentacao:refresh', async (): Promise<SupportBoardSnapshot | null> => {
    const settings = SettingsManager.load()
    const cacheFile = join(settings.workspacePath, '..', 'cache', 'sustentacao', 'board.json')

    try {
      if (existsSync(cacheFile)) {
        writeFileSync(cacheFile, JSON.stringify({ data: null, fetchedAt: 0 }), 'utf-8')
      }
    } catch { /* ignore */ }

    return fetchAndCacheSustentacao()
  })

  ipcMain.handle('sustentacao:run-analysis', async (): Promise<{ analysis?: string; error?: string }> => {
    const settings = SettingsManager.load()
    const { jiraSupportProjectKey, workspacePath, claudeBinPath } = settings

    if (!jiraSupportProjectKey) {
      return { error: 'Board de sustentação não configurado' }
    }

    if (!claudeBinPath) {
      return { error: 'Claude CLI não configurado. Configure o caminho em Settings.' }
    }

    const snapshot = await fetchAndCacheSustentacao()

    if (!snapshot) {
      return { error: 'Dados do board indisponíveis — atualize antes de analisar' }
    }

    const prompt = buildSustentacaoPrompt(snapshot)

    Logger.getInstance().child('IPC').info('sustentacao:run-analysis iniciando análise', {
      ticketsEmBreach: snapshot.ticketsEmBreach.length,
      promptLength: prompt.length,
    })

    const result = await runClaudePrompt(claudeBinPath, prompt, 90_000)

    if (!result.success) {
      return { error: result.error ?? 'Falha na análise de IA' }
    }

    const analysis = result.rawOutput ?? (typeof result.data === 'string' ? result.data : JSON.stringify(result.data))

    Logger.getInstance().child('IPC').info('sustentacao:run-analysis análise concluída', {
      analysisLength: analysis?.length ?? 0,
    })

    // Persistir no metricas.md de cada assignee com >= 3 tickets
    const SIGNIFICANT_TICKET_THRESHOLD = 3
    const metricsWriter = new MetricsWriter(workspacePath)
    const personRegistry = new PersonRegistry(workspacePath)
    const people = personRegistry.list()

    for (const [assigneeKey, count] of Object.entries(snapshot.porAssignee)) {
      if (count < SIGNIFICANT_TICKET_THRESHOLD) continue

      // Mapear assigneeKey (email ou nome do Jira) para slug da pessoa
      const person = people.find(
        (p) =>
          p.jiraEmail === assigneeKey ||
          p.nome.toLowerCase().includes(assigneeKey.toLowerCase()) ||
          assigneeKey.toLowerCase().includes(p.nome.split(' ')[0].toLowerCase()),
      )

      if (!person) {
        Logger.getInstance().child('IPC').warn('sustentacao:run-analysis assignee sem match no PersonRegistry', { assigneeKey })
        continue
      }

      try {
        metricsWriter.writeSustentacaoAnalysis(person.slug, analysis)
        Logger.getInstance().child('IPC').info('sustentacao:run-analysis análise persistida', { slug: person.slug, assigneeKey })
      } catch (err) {
        Logger.getInstance().child('IPC').warn('sustentacao:run-analysis falha ao persistir (graceful)', {
          slug: person.slug,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return { analysis }
  })
}

// Persiste o último status para enviar ao renderer quando ele montar após os eventos
let lastUpdateStatus: { phase: string; version?: string; progress?: number; error?: string } | null = null

function sendUpdateStatus(status: typeof lastUpdateStatus): void {
  lastUpdateStatus = status
  mainWindow?.webContents.send('update:status', status)
}

function logUpdaterError(err: Error): void {
  try {
    const logsDir = join(app.getPath('userData'), 'logs')
    mkdirSync(logsDir, { recursive: true })
    const logFile = join(logsDir, 'updater.log')
    const line = `[${new Date().toISOString()}] ${app.getVersion()} ERROR: ${err.message}\n`
    writeFileSync(logFile, line, { flag: 'a' })
  } catch {
    // falha silenciosa — não deve impedir o app de funcionar
  }
}

function setupAutoUpdater(): void {
  if (!app.isPackaged) return  // só roda em produção

  autoUpdater.autoDownload         = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    sendUpdateStatus({ phase: 'available', version: info.version })
  })

  autoUpdater.on('download-progress', (progress) => {
    sendUpdateStatus({ phase: 'downloading', progress: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', (info) => {
    sendUpdateStatus({ phase: 'ready', version: info.version })
  })

  autoUpdater.on('error', (err) => {
    Logger.getInstance().child('AutoUpdater').error('update error', { error: err.message })
    logUpdaterError(err)
    sendUpdateStatus({ phase: 'error', error: err.message })
  })

  autoUpdater.checkForUpdates()
}

app.whenReady().then(async () => {
  // Set Dock icon on macOS (BrowserWindow.icon doesn't affect the Dock)
  if (process.platform === 'darwin') {
    app.dock?.setIcon(APP_ICON)
  }

  const settings = SettingsManager.load()
  await setupWorkspace(settings.workspacePath)

  Logger.getInstance().initFromSettings()
  Logger.getInstance().setMainWindowGetter(() => mainWindow)

  registerIpcHandlers()
  createWindow()

  // Start FileWatcher after window is created
  fileWatcher = new FileWatcher(settings.workspacePath)
  fileWatcher.start()
  fileWatcher.restorePending() // restore items pending from previous session
  fileWatcher.syncAllPending() // sync pending items whose persons are now registered

  // Scheduler: daily report + sprint change detection + sprint polling
  const scheduler = new Scheduler(settings.workspacePath)
  scheduler.onAppStart().catch((err) => {
    Logger.getInstance().child('Scheduler').warn('onAppStart falhou', { error: err instanceof Error ? err.message : String(err) })
  })
  app.on('before-quit', () => scheduler.stopSprintPolling())

  setupAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  fileWatcher?.stop()
  if (process.platform !== 'darwin') app.quit()
})

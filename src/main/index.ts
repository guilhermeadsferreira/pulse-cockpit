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
import { buildAgendaPrompt, renderAgendaMarkdown, type AgendaAIResult } from './prompts/agenda.prompt'
import { buildGestorAgendaPrompt, renderGestorAgendaMarkdown, type AgendaGestorAIResult } from './prompts/agenda-gestor.prompt'
import { buildCyclePrompt, renderCycleMarkdown, type CycleAIResult } from './prompts/cycle.prompt'
import { buildGestorCicloPrompt, renderGestorCicloMarkdown, type GestorCicloAIResult } from './prompts/gestor-ciclo.prompt'
import { buildAutoavaliacaoPrompt, renderAutoavaliacaoMarkdown, type AutoavaliacaoAIResult } from './prompts/autoavaliacao.prompt'
import type { CycleReportParams, AutoavaliacaoParams, DemandaStatus } from '../renderer/src/types/ipc'
import { Logger, type LogLevel } from './logging'
import { Scheduler } from './external/Scheduler'

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

    const prompt = buildAgendaPrompt({ configYaml: configRaw, perfilMd: perfilData.raw, today, dadosStale, pautasAnteriores, openActions: enrichedActions, insightsRecentes, sinaisTerceiros, pdiEstruturado, externalData })
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

  // ── Pautas ────────────────────────────────────────────────
  ipcMain.handle('people:list-pautas', (_event, slug: string) => {
    return getRegistry().listPautas(slug)
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
    const scheduler = new Scheduler(workspacePath)
    return scheduler.generateDailyReport()
  })

  ipcMain.handle('external:refresh-sprint', async () => {
    const { workspacePath } = SettingsManager.load()
    const scheduler = new Scheduler(workspacePath)
    return scheduler.generateSprintReport()
  })

  ipcMain.handle('external:get-data', async (_event, slug: string) => {
    const { workspacePath } = SettingsManager.load()
    const yamlPath = join(workspacePath, 'pessoas', slug, 'external_data.yaml')
    if (!existsSync(yamlPath)) return null
    try {
      return readFileSync(yamlPath, 'utf-8')
    } catch {
      return null
    }
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

  // Scheduler: daily report + sprint change detection
  const scheduler = new Scheduler(settings.workspacePath)
  scheduler.onAppStart().catch((err) => {
    Logger.getInstance().child('Scheduler').warn('onAppStart falhou', { error: err instanceof Error ? err.message : String(err) })
  })

  setupAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  fileWatcher?.stop()
  if (process.platform !== 'darwin') app.quit()
})

import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import { writeFileSync, readFileSync, mkdirSync } from 'fs'
import { SettingsManager } from './registry/SettingsManager'
import { PersonRegistry } from './registry/PersonRegistry'
import { DetectedRegistry } from './registry/DetectedRegistry'
import { ActionRegistry } from './registry/ActionRegistry'
import { DemandaRegistry } from './registry/DemandaRegistry'
import { CicloRegistry } from './registry/CicloRegistry'
import { setupWorkspace } from './workspace/WorkspaceSetup'
import { runClaudePrompt } from './ingestion/ClaudeRunner'
import { readFile } from './ingestion/FileReader'
import { FileWatcher } from './ingestion/FileWatcher'
import { buildAgendaPrompt, renderAgendaMarkdown, type AgendaAIResult } from './prompts/agenda.prompt'
import { buildGestorAgendaPrompt, renderGestorAgendaMarkdown, type AgendaGestorAIResult } from './prompts/agenda-gestor.prompt'
import { buildCyclePrompt, renderCycleMarkdown, type CycleAIResult } from './prompts/cycle.prompt'
import { buildGestorCicloPrompt, renderGestorCicloMarkdown, type GestorCicloAIResult } from './prompts/gestor-ciclo.prompt'
import { buildAutoavaliacaoPrompt, renderAutoavaliacaoMarkdown, type AutoavaliacaoAIResult } from './prompts/autoavaliacao.prompt'
import type { CycleReportParams, AutoavaliacaoParams, DemandaStatus } from '../renderer/src/types/ipc'

let mainWindow: BrowserWindow | null = null
let fileWatcher:  FileWatcher  | null = null

function getRegistry(): PersonRegistry {
  const { workspacePath } = SettingsManager.load()
  return new PersonRegistry(workspacePath)
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
    const isNew = !getRegistry().get(config.slug)
    getRegistry().save(config)
    // If this is a newly registered person, sync any pending inbox items
    if (isNew && fileWatcher) {
      const count = await fileWatcher.reprocessPending(config.slug)
      if (count > 0) console.log(`[people:save] synced ${count} pending item(s) for "${config.slug}"`)

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
    const { workspacePath } = SettingsManager.load()
    return new DetectedRegistry(workspacePath).list()
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

  // ── AI ────────────────────────────────────────────────────
  ipcMain.handle('ai:test', async () => {
    console.log('[ai:test] handler chamado')
    const settings = SettingsManager.load()
    console.log('[ai:test] claudeBinPath:', settings.claudeBinPath)
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
    const registry = getRegistry()
    const person = registry.get(slug)
    if (!person) return { success: false, error: 'Pessoa não encontrada.' }

    const configRaw = registry.getConfigRaw(slug)
    const perfilData = registry.getPerfil(slug)
    if (!perfilData) {
      return { success: false, error: 'Perfil não encontrado. Ingira pelo menos um artefato primeiro.' }
    }

    const today = new Date().toISOString().slice(0, 10)
    const pautasAnteriores = registry.getLastPautas(slug, 2)
    const openActions = new ActionRegistry(settings.workspacePath)
      .list(slug)
      .filter((a) => a.status === 'open')
      .map((a) => ({ texto: a.texto, criadoEm: a.criadoEm }))

    let markdown: string

    if (person.relacao === 'gestor') {
      // Pauta com o meu gestor — inclui roll-up do time
      const liderados = registry.getTeamRollup()
      const prompt = buildGestorAgendaPrompt({
        configYaml: configRaw,
        perfilMd: perfilData.raw,
        today,
        liderados,
        pautasAnteriores,
        openActions,
      })
      const result = await runClaudePrompt(settings.claudeBinPath, prompt, 90_000)
      if (!result.success || !result.data) {
        return { success: false, error: result.error || 'Falha ao gerar pauta.' }
      }
      const agendaResult = result.data as AgendaGestorAIResult
      markdown = renderGestorAgendaMarkdown(person.nome, today, agendaResult)
    } else {
      // Pauta com liderado, par ou stakeholder — fluxo original
      const ultimaIngestao = (perfilData.frontmatter.ultima_ingestao as string)
        || (perfilData.frontmatter.ultima_atualizacao as string)?.slice(0, 10)
        || null
      const dadosStale = ultimaIngestao
        ? (Date.now() - new Date(ultimaIngestao).getTime()) > 30 * 24 * 60 * 60 * 1000
        : false
      const prompt = buildAgendaPrompt({ configYaml: configRaw, perfilMd: perfilData.raw, today, dadosStale, pautasAnteriores, openActions })
      const result = await runClaudePrompt(settings.claudeBinPath, prompt, 90_000)
      if (!result.success || !result.data) {
        return { success: false, error: result.error || 'Falha ao gerar pauta.' }
      }
      const agendaResult = result.data as AgendaAIResult
      markdown = renderAgendaMarkdown(person.nome, today, agendaResult)
    }

    registry.savePauta(slug, today, markdown)
    const filePath = join(settings.workspacePath, 'pessoas', slug, 'pautas', `${today}-pauta.md`)
    return { success: true, path: filePath, markdown }
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
    const { prompt, truncatedArtifacts, totalArtifacts } = buildCyclePrompt({
      configYaml: configRaw, perfilMd: perfilData.raw, artifacts, periodoInicio, periodoFim,
    })

    if (truncatedArtifacts > 0) {
      console.warn(`[ai:cycle-report] contexto limitado: ${totalArtifacts - truncatedArtifacts}/${totalArtifacts} artefatos incluídos para "${personSlug}"`)
    }

    const result = await runClaudePrompt(settings.claudeBinPath, prompt, 120_000)
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
      const result = await runClaudePrompt(settings.claudeBinPath, prompt, 90_000)
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
      const result = await runClaudePrompt(settings.claudeBinPath, prompt, 120_000)
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
}

// Persiste o último status para enviar ao renderer quando ele montar após os eventos
let lastUpdateStatus: { phase: string; version?: string; progress?: number; error?: string } | null = null

function sendUpdateStatus(status: typeof lastUpdateStatus): void {
  lastUpdateStatus = status
  mainWindow?.webContents.send('update:status', status)
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
    console.error('[AutoUpdater]', err.message)
    sendUpdateStatus({ phase: 'error', error: err.message })
  })

  autoUpdater.checkForUpdates()
}

app.whenReady().then(async () => {
  const settings = SettingsManager.load()
  await setupWorkspace(settings.workspacePath)
  registerIpcHandlers()
  createWindow()

  // Start FileWatcher after window is created
  fileWatcher = new FileWatcher(settings.workspacePath)
  fileWatcher.start()
  fileWatcher.restorePending() // restore items pending from previous session

  setupAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  fileWatcher?.stop()
  if (process.platform !== 'darwin') app.quit()
})

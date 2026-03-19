import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
import { join } from 'path'
import { writeFileSync, readFileSync } from 'fs'
import { SettingsManager } from './registry/SettingsManager'
import { PersonRegistry } from './registry/PersonRegistry'
import { DetectedRegistry } from './registry/DetectedRegistry'
import { ActionRegistry } from './registry/ActionRegistry'
import { setupWorkspace } from './workspace/WorkspaceSetup'
import { runClaudePrompt } from './ingestion/ClaudeRunner'
import { FileWatcher } from './ingestion/FileWatcher'
import { buildAgendaPrompt, renderAgendaMarkdown, type AgendaAIResult } from './prompts/agenda.prompt'
import { buildGestorAgendaPrompt, renderGestorAgendaMarkdown, type AgendaGestorAIResult } from './prompts/agenda-gestor.prompt'
import { buildCyclePrompt, renderCycleMarkdown, type CycleAIResult } from './prompts/cycle.prompt'
import type { CycleReportParams } from '../renderer/src/types/ipc'

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
      fileWatcher.reprocessPending(config.slug).then((count) => {
        if (count > 0) console.log(`[people:save] synced ${count} pending item(s) for "${config.slug}"`)
      })
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
      const prompt = buildAgendaPrompt({ configYaml: configRaw, perfilMd: perfilData.raw, today, pautasAnteriores, openActions })
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
    const prompt = buildCyclePrompt({ configYaml: configRaw, perfilMd: perfilData.raw, artifacts, periodoInicio, periodoFim })

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

    return { success: true, path: filePath, markdown, result: cycleResult }
  })

  // ── Actions ───────────────────────────────────────────────
  ipcMain.handle('actions:list', (_event, slug: string) => {
    const { workspacePath } = SettingsManager.load()
    return new ActionRegistry(workspacePath).list(slug)
  })

  ipcMain.handle('actions:update-status', (_event, slug: string, id: string, status: string) => {
    const { workspacePath } = SettingsManager.load()
    new ActionRegistry(workspacePath).updateStatus(slug, id, status as 'open' | 'done' | 'cancelled')
  })

  // ── Shell ─────────────────────────────────────────────────
  ipcMain.handle('shell:open', (_event, filePath: string) => {
    return shell.openPath(filePath)
  })
}

app.whenReady().then(async () => {
  const settings = SettingsManager.load()
  await setupWorkspace(settings.workspacePath)
  registerIpcHandlers()
  createWindow()

  // Start FileWatcher after window is created
  fileWatcher = new FileWatcher(settings.workspacePath)
  fileWatcher.start()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  fileWatcher?.stop()
  if (process.platform !== 'darwin') app.quit()
})

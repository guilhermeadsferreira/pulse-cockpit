import { basename, join } from 'path'
import { BrowserWindow } from 'electron'
import { readFile } from './FileReader'
import { ArtifactWriter } from './ArtifactWriter'
import { runClaudePrompt } from './ClaudeRunner'
import { buildIngestionPrompt, type IngestionAIResult } from '../prompts/ingestion.prompt'
import { validateIngestionResult } from './SchemaValidator'
import { PersonRegistry } from '../registry/PersonRegistry'
import { ActionRegistry } from '../registry/ActionRegistry'
import { DetectedRegistry } from '../registry/DetectedRegistry'
import { SettingsManager } from '../registry/SettingsManager'
import { existsSync, readFileSync, mkdirSync, renameSync } from 'fs'
import { join as pathJoin, dirname, normalize } from 'path'

export type QueueItemStatus = 'queued' | 'processing' | 'done' | 'pending' | 'error'

export interface QueueItem {
  id:          string
  filePath:    string
  fileName:    string
  status:      QueueItemStatus
  personSlug?: string
  tipo?:       string
  summary?:    string
  error?:      string
  startedAt?:  number
  finishedAt?: number
  pessoasIdentificadas?: string[]
  naoCadastradas?:       string[]
  novasNomes?:           Record<string, string>  // slug → nome for detected people
  // Cached data for pending items — avoids re-calling Claude on sync
  cachedAiResult?:       IngestionAIResult
  cachedText?:           string
}

const MAX_CONCURRENT = 3

export class IngestionPipeline {
  private queue: QueueItem[] = []
  private processing = false
  // Per-person locks prevent concurrent writes to the same perfil.md
  private personLocks = new Map<string, Promise<void>>()

  constructor(private workspacePath: string) {}

  enqueue(filePath: string): void {
    const fileName = basename(filePath)

    // Deduplicate: don't add if already queued, processing, or pending
    const exists = this.queue.some((i) => i.filePath === filePath && (i.status === 'queued' || i.status === 'processing' || i.status === 'pending'))
    if (exists) return

    const item: QueueItem = {
      id:       `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      filePath,
      fileName,
      status:   'queued',
    }

    this.queue.unshift(item)
    this.notifyRenderer('ingestion:started', { filePath, fileName })
    console.log(`[IngestionPipeline] enqueued: ${fileName}`)

    this.drainQueue()
  }

  getQueue(): QueueItem[] {
    return this.queue.slice(0, 50) // return last 50 items
  }

  /**
   * Called when a new person is registered.
   * Syncs pending items whose pessoa_principal matches the new slug.
   * Pure file operation — no Claude call, uses cached AI result.
   */
  async syncPending(registeredSlug: string): Promise<number> {
    const matching = this.queue.filter(
      (i) =>
        i.status === 'pending' &&
        (i.personSlug === registeredSlug || i.naoCadastradas?.includes(registeredSlug))
    )
    if (matching.length === 0) return 0

    console.log(`[IngestionPipeline] syncing ${matching.length} pending item(s) for "${registeredSlug}"`)

    for (const item of matching) {
      try {
        await this.syncItemToPerson(item, registeredSlug)
        console.log(`[IngestionPipeline] synced: ${item.fileName} → ${registeredSlug}`)
      } catch (err) {
        console.error(`[IngestionPipeline] sync error: ${item.fileName}`, err)
      }
    }
    return matching.length
  }

  /**
   * Writes artifact for a collective meeting (pessoa_principal = null).
   * Stores in _coletivo/historico/. No person profile update.
   */
  private syncItemToCollective(item: QueueItem): void {
    if (!item.cachedAiResult || !item.cachedText) return

    const collectiveSlug = '_coletivo'
    const historicoDir = join(this.workspacePath, 'pessoas', collectiveSlug, 'historico')
    mkdirSync(historicoDir, { recursive: true })

    const date = item.cachedAiResult.data_artefato
    const uniqueFileName = `${date}-coletivo-${item.id}.md`

    const writer = new ArtifactWriter(this.workspacePath)
    writer.writeArtifact(collectiveSlug, item.cachedAiResult, item.cachedText, uniqueFileName)

    // T2.4: route collective actions to the responsible registered person's ActionRegistry
    const acoes = item.cachedAiResult.acoes_comprometidas ?? []
    if (acoes.length > 0) {
      const registry = new PersonRegistry(this.workspacePath)
      const actionReg = new ActionRegistry(this.workspacePath)
      const registeredSlugs = new Set(registry.list().map((p) => p.slug))
      for (const acao of acoes) {
        if (!acao.responsavel_slug && acao.responsavel) {
          // try to infer slug from name
          const candidate = acao.responsavel.toLowerCase().replace(/\s+/g, '-')
          if (registeredSlugs.has(candidate)) {
            acao.responsavel_slug = candidate
          }
        }
        if (acao.responsavel_slug && registeredSlugs.has(acao.responsavel_slug)) {
          actionReg.createFromArtifact(acao.responsavel_slug, [acao], uniqueFileName, date, registeredSlugs)
        }
      }
    }

    item.status     = 'done'
    item.personSlug = collectiveSlug
    item.finishedAt = Date.now()
    item.cachedAiResult = undefined
    item.cachedText     = undefined
    this.moveToProcessados(item.filePath)

    this.notifyRenderer('ingestion:completed', {
      filePath: item.filePath, personSlug: collectiveSlug,
      tipo: item.tipo, summary: item.summary, novas: [],
    })
  }

  /**
   * Writes artifact + updates perfil for a given item using its cached AI result.
   * No Claude call — pure file I/O.
   */
  private async syncItemToPerson(item: QueueItem, slug: string): Promise<void> {
    if (!item.cachedAiResult || !item.cachedText) return

    // Serialize per-person writes to prevent race conditions in parallel processing
    const release = await this.acquirePersonLock(slug)
    try {
      const writer = new ArtifactWriter(this.workspacePath)
      const artifactFileName = writer.writeArtifact(slug, item.cachedAiResult, item.cachedText)
      writer.updatePerfil(slug, item.cachedAiResult, artifactFileName)
    } finally {
      release()
    }

    item.status         = 'done'
    item.finishedAt     = Date.now()
    item.naoCadastradas = item.naoCadastradas?.filter((s) => s !== slug)
    // Free cached data
    item.cachedAiResult = undefined
    item.cachedText     = undefined
    this.moveToProcessados(item.filePath)

    this.notifyRenderer('ingestion:completed', {
      filePath: item.filePath, personSlug: slug,
      tipo: item.tipo, summary: item.summary, novas: [],
    })
  }

  private async drainQueue(): Promise<void> {
    if (this.processing) return
    this.processing = true

    try {
      while (true) {
        const queued = this.queue.filter((i) => i.status === 'queued')
        if (queued.length === 0) break
        const batch = queued.slice(0, MAX_CONCURRENT)
        await Promise.all(batch.map((item) => this.processItem(item)))
      }
    } finally {
      this.processing = false
    }
  }

  /**
   * Acquires a per-person lock to prevent concurrent writes to the same perfil.md.
   * Callers must call the returned release function when done.
   */
  private acquirePersonLock(slug: string): Promise<() => void> {
    const current = this.personLocks.get(slug) ?? Promise.resolve()
    let release!: () => void
    const next = current.then(() => new Promise<void>((resolve) => { release = resolve }))
    this.personLocks.set(slug, next)
    return current.then(() => release)
  }

  private async processItem(item: QueueItem): Promise<void> {
    item.status    = 'processing'
    item.startedAt = Date.now()
    console.log(`[IngestionPipeline] processing: ${item.fileName}`)

    try {
      const settings         = SettingsManager.load()
      const registry         = new PersonRegistry(this.workspacePath)
      const detectedRegistry = new DetectedRegistry(this.workspacePath)
      const teamRegistry     = registry.serializeForPrompt()

      // Read file content
      const { text } = await readFile(item.filePath)

      // Read current perfil.md if there's a likely person match
      // (we'll figure out the person after AI analysis)
      if (!settings.claudeBinPath) {
        throw new Error('Claude CLI não configurado. Configure o caminho em Settings.')
      }

      const today = new Date().toISOString().slice(0, 10)

      // Pass 1: identify pessoa_principal (no perfil context yet)
      const promptPass1 = buildIngestionPrompt({
        teamRegistry,
        perfilMdRaw: null,
        artifactContent: text,
        today,
      })
      const resultPass1 = await runClaudePrompt(settings.claudeBinPath, promptPass1, 90_000)
      if (!resultPass1.success || !resultPass1.data) {
        throw new Error(resultPass1.error || 'Claude não retornou dados válidos')
      }

      const validation1 = validateIngestionResult(resultPass1.data)
      if (!validation1.valid) {
        const details = [...validation1.missingFields.map(f => `campo ausente: ${f}`), ...validation1.typeErrors].join('; ')
        throw new Error(`Schema inválido na saída do Claude (pass 1): ${details}`)
      }

      let aiResult = resultPass1.data as IngestionAIResult

      // Pass 2: if pessoa_principal is registered and has a perfil, re-run with context
      // This ensures resumo_evolutivo and temas_atualizados integrate the real history
      const principalPass1 = aiResult.pessoa_principal
      if (principalPass1 && registry.get(principalPass1)) {
        const perfil = registry.getPerfil(principalPass1)
        if (perfil) {
          console.log(`[IngestionPipeline] pass 2 com perfil de "${principalPass1}"`)
          const promptPass2 = buildIngestionPrompt({
            teamRegistry,
            perfilMdRaw: perfil.raw,
            artifactContent: text,
            today,
          })
          const resultPass2 = await runClaudePrompt(settings.claudeBinPath, promptPass2, 90_000)
          if (resultPass2.success && resultPass2.data) {
            const validation2 = validateIngestionResult(resultPass2.data)
            if (validation2.valid) {
              aiResult = resultPass2.data as IngestionAIResult
            } else {
              const details = [...validation2.missingFields.map(f => `campo ausente: ${f}`), ...validation2.typeErrors].join('; ')
              console.warn(`[IngestionPipeline] schema inválido no pass 2, mantendo pass 1: ${details}`)
            }
          }
        }
      }

      // Identify which people are registered vs unknown
      const pessoasIdentificadas = aiResult.pessoas_identificadas ?? []
      const naoCadastradas = pessoasIdentificadas.filter((s) => !registry.get(s))
      const principal = aiResult.pessoa_principal  // re-read after pass 2 may have updated aiResult

      // Store newly detected (unregistered) people so the user can promote them
      const novas = aiResult.novas_pessoas_detectadas ?? []
      // Build a slug→nome map from novas for name lookups
      const novasNomeMap: Record<string, string> = {}
      for (const p of novas) {
        novasNomeMap[p.slug] = p.nome
        if (!registry.get(p.slug)) {
          detectedRegistry.upsert(p.slug, p.nome, item.fileName)
        }
      }
      // Also store naoCadastradas that the AI matched from pessoas_identificadas
      for (const slug of naoCadastradas) {
        // Use the real name from novas if available, otherwise keep the slug
        const nome = novasNomeMap[slug] || slug
        detectedRegistry.upsert(slug, nome, item.fileName)
      }

      // Common fields for both done and pending
      item.tipo                = aiResult.tipo
      item.summary             = aiResult.resumo
      item.pessoasIdentificadas = pessoasIdentificadas
      item.naoCadastradas      = [...new Set([...naoCadastradas, ...novas.map((p) => p.slug)])]
      item.novasNomes          = novasNomeMap
      item.finishedAt          = Date.now()

      // Always cache the AI result and the original text
      item.personSlug     = principal ?? undefined
      item.cachedAiResult = aiResult
      item.cachedText     = text

      // If pessoa_principal is registered → sync immediately
      if (principal && registry.get(principal)) {
        await this.syncItemToPerson(item, principal)
        console.log(`[IngestionPipeline] done: ${item.fileName} → ${principal}`)
      } else if (!principal) {
        // Reunião coletiva: sem pessoa_principal → salva em _coletivo, não bloqueia
        this.syncItemToCollective(item)
        console.log(`[IngestionPipeline] done (coletivo): ${item.fileName}`)
      } else {
        // pessoa_principal identificada mas não cadastrada → pending
        item.status = 'pending'
        this.notifyRenderer('ingestion:completed', {
          filePath: item.filePath, personSlug: undefined,
          tipo: item.tipo, summary: item.summary, novas,
        })
        console.log(`[IngestionPipeline] pending: ${item.fileName} → pessoa "${principal}" não cadastrada`)
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err)
      item.status     = 'error'
      item.error      = error
      item.finishedAt = Date.now()

      this.notifyRenderer('ingestion:failed', {
        filePath: item.filePath,
        error,
      })

      console.error(`[IngestionPipeline] error: ${item.fileName} —`, error)
    }
  }

  private moveToProcessados(filePath: string): void {
    const inboxDir = normalize(pathJoin(this.workspacePath, 'inbox'))
    const normalizedPath = normalize(filePath)

    // Only move files that live directly inside inbox/
    if (dirname(normalizedPath) !== inboxDir) return
    if (!existsSync(normalizedPath)) return

    const processadosDir = pathJoin(inboxDir, 'processados')
    mkdirSync(processadosDir, { recursive: true })

    const dest = pathJoin(processadosDir, basename(normalizedPath))
    try {
      renameSync(normalizedPath, dest)
      console.log(`[IngestionPipeline] moved to processados: ${basename(normalizedPath)}`)
    } catch (err) {
      console.error(`[IngestionPipeline] failed to move file:`, err)
    }
  }

  private notifyRenderer(channel: string, payload: unknown): void {
    const wins = BrowserWindow.getAllWindows()
    for (const win of wins) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    }
  }
}

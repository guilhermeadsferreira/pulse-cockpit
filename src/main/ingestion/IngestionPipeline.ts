import { basename, join } from 'path'
import { BrowserWindow } from 'electron'
import { readFile } from './FileReader'
import { ArtifactWriter } from './ArtifactWriter'
import { runClaudePrompt, runWithProvider } from './ClaudeRunner'
import { preprocessTranscript } from './GeminiPreprocessor'
import { buildIngestionPrompt, type IngestionAIResult } from '../prompts/ingestion.prompt'
import { buildCerimoniaSinalPrompt } from '../prompts/cerimonia-sinal.prompt'
import { build1on1DeepPrompt, type OneOnOneResult } from '../prompts/1on1-deep.prompt'
import { validateIngestionResult, validateCerimoniaSinalResult, validateOneOnOneResult } from './SchemaValidator'
import { PersonRegistry } from '../registry/PersonRegistry'
import { ActionRegistry } from '../registry/ActionRegistry'
import { DetectedRegistry } from '../registry/DetectedRegistry'
import { DemandaRegistry } from '../registry/DemandaRegistry'
import { CicloRegistry } from '../registry/CicloRegistry'
import { SettingsManager } from '../registry/SettingsManager'
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs'
import { ProfileCompressor } from './ProfileCompressor'
import { join as pathJoin, dirname, normalize } from 'path'
import { Logger, ModuleLogger } from '../logging'
import { ExternalDataPass } from '../external/ExternalDataPass'

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
const MAX_QUEUE_SIZE  = 100
const MAX_CONCURRENT_1ON1 = 2

export class IngestionPipeline {
  private queue: QueueItem[] = []
  private processing = false
  // Per-person locks prevent concurrent writes to the same perfil.md
  private personLocks = new Map<string, Promise<void>>()
  // Semaphore for 1on1 deep passes — limits concurrent Claude spawns under heavy load
  private active1on1 = 0
  private pending1on1: Array<() => void> = []

  constructor(private workspacePath: string) {
    this.log = Logger.getInstance().child('IngestionPipeline')
  }

  private log: ModuleLogger

  private get pendingQueuePath(): string {
    return pathJoin(this.workspacePath, 'inbox', 'pending-queue.json')
  }

  /**
   * Persists all pending items (including cachedAiResult) to disk.
   * Called whenever the pending set changes.
   */
  private savePendingQueue(): void {
    const pending = this.queue.filter((i) => i.status === 'pending')
    try {
      writeFileSync(this.pendingQueuePath, JSON.stringify(pending, null, 2), 'utf-8')
    } catch (err) {
      this.log.error('save pending queue failed', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  /**
   * Restores pending items from disk on app startup.
   * Items with no cached AI result are discarded (unrecoverable).
   */
  restorePending(): void {
    if (!existsSync(this.pendingQueuePath)) return
    try {
      const raw   = readFileSync(this.pendingQueuePath, 'utf-8')
      const items = JSON.parse(raw) as QueueItem[]
      const valid = items.filter((i) => i.status === 'pending' && i.cachedAiResult && i.cachedText)
      if (valid.length === 0) return
      for (const item of valid) {
        const alreadyInQueue = this.queue.some((q) => q.filePath === item.filePath && q.status === 'pending')
        if (!alreadyInQueue) {
          this.queue.unshift(item)
          this.notifyRenderer('ingestion:started', { filePath: item.filePath, fileName: item.fileName })
        }
      }
      this.log.info('restored pending', { count: valid.length })
    } catch (err) {
      this.log.error('restore pending queue failed', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  /**
   * Tenta sincronizar todos os items pending cujas pessoas já estão cadastradas.
   * Chamado no startup para resolver race conditions com iCloud sync.
   */
  async syncAllPending(): Promise<number> {
    const registry = new PersonRegistry(this.workspacePath)
    const pending = this.queue.filter((i) => i.status === 'pending' && i.personSlug)
    if (pending.length === 0) return 0

    let synced = 0
    for (const item of pending) {
      const slug = item.personSlug!
      if (registry.get(slug)) {
        try {
          await this.syncItemToPerson(item, slug)
          this.log.info('auto-synced pending', { fileName: item.fileName, slug })
          synced++
        } catch (err) {
          this.log.error('auto-sync error', { fileName: item.fileName, error: err instanceof Error ? err.message : String(err) })
        }
      }
    }
    if (synced > 0) {
      this.log.info('auto-sync startup complete', { synced })
    }
    return synced
  }

  enqueue(filePath: string): void {
    const fileName = basename(filePath)

    // Deduplicate: don't add if already queued, processing, or pending
    const exists = this.queue.some((i) => i.filePath === filePath && (i.status === 'queued' || i.status === 'processing' || i.status === 'pending'))
    if (exists) return

    // Backpressure: reject if active queue is at capacity
    const activeCount = this.queue.filter((i) => i.status === 'queued' || i.status === 'processing' || i.status === 'pending').length
    if (activeCount >= MAX_QUEUE_SIZE) {
      this.log.warn('queue full', { maxSize: MAX_QUEUE_SIZE, fileName })
      this.notifyRenderer('ingestion:failed', {
        filePath,
        error: `Fila cheia (máximo ${MAX_QUEUE_SIZE} itens). Aguarde o processamento atual terminar.`,
      })
      return
    }

    const item: QueueItem = {
      id:       `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      filePath,
      fileName,
      status:   'queued',
    }

    this.queue.unshift(item)
    this.notifyRenderer('ingestion:started', { filePath, fileName })
    this.log.info('enqueued', { fileName })

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

    this.log.info('syncing pending', { count: matching.length, slug: registeredSlug })

    for (const item of matching) {
      try {
        await this.syncItemToPerson(item, registeredSlug)
        this.log.info('synced', { fileName: item.fileName, slug: registeredSlug })
      } catch (err) {
        this.log.error('sync error', { fileName: item.fileName, error: err instanceof Error ? err.message : String(err) })
      }
    }
    return matching.length
  }

  /**
   * Writes artifact for a collective meeting (pessoa_principal = null).
   * Stores in _coletivo/historico/. Triggers per-person ceremony signal analysis (fire-and-forget).
   */
  private syncItemToCollective(item: QueueItem, claudeBinPath?: string): void {
    if (!item.cachedAiResult || !item.cachedText) return

    // Capture before clearing (fire-and-forget needs them after item fields are cleared)
    const aiResult = item.cachedAiResult
    const text = item.cachedText

    const collectiveSlug = '_coletivo'
    const historicoDir = join(this.workspacePath, 'pessoas', collectiveSlug, 'historico')
    mkdirSync(historicoDir, { recursive: true })

    const date = aiResult.data_artefato
    const uniqueFileName = `${date}-coletivo-${item.id}.md`

    const writer = new ArtifactWriter(this.workspacePath)
    writer.writeArtifact(collectiveSlug, aiResult, text, uniqueFileName)

    // Route collective actions to the responsible registered person's ActionRegistry
    // or to DemandaRegistry (módulo Eu) when the responsible is the manager
    const acoes = aiResult.acoes_comprometidas ?? []
    const registry = new PersonRegistry(this.workspacePath)
    const settings = SettingsManager.load()
    const managerName = settings.managerName?.trim().toLowerCase() ?? ''
    if (acoes.length > 0) {
      const actionReg = new ActionRegistry(this.workspacePath)
      const demandaReg = new DemandaRegistry(this.workspacePath)
      const registeredSlugs = new Set(registry.list().map((p) => p.slug))
      for (const acao of acoes) {
        // Check if this action belongs to the manager → route to Demandas (módulo Eu)
        if (managerName && acao.responsavel?.trim().toLowerCase() === managerName) {
          const titulo = aiResult.titulo ?? uniqueFileName
          const participantes = aiResult.participantes_nomes?.join(', ') ?? ''
          const contexto = participantes
            ? `Origem: ${titulo} (${participantes})`
            : `Origem: ${titulo}`
          demandaReg.save({
            id:          `${date}-gestor-${Math.random().toString(36).slice(2, 7)}`,
            descricao:   acao.descricao,
            descricaoLonga: contexto,
            origem:      'Eu',
            pessoaSlug:  aiResult.pessoa_principal ?? null,
            prazo:       acao.prazo_iso ?? null,
            criadoEm:    date,
            atualizadoEm: date,
            status:      'open',
          })
          this.log.info('gestor action → Demandas', { descricao: acao.descricao.slice(0, 60), titulo })
          continue
        }

        if (!acao.responsavel_slug && acao.responsavel) {
          const candidate = acao.responsavel
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().replace(/\s+/g, '-')
          if (registeredSlugs.has(candidate)) {
            acao.responsavel_slug = candidate
          }
        }
        if (acao.responsavel_slug && registeredSlugs.has(acao.responsavel_slug)) {
          actionReg.createFromArtifact(acao.responsavel_slug, [acao], uniqueFileName, date, registeredSlugs)
        } else {
          this.log.warn('ação coletiva sem dono', { responsavel: acao.responsavel, source: uniqueFileName })
        }
      }
    }

    // Auto-populate Meu Ciclo para reuniões coletivas
    try {
      new CicloRegistry(this.workspacePath).addFromIngestion(aiResult, null)
    } catch (err) {
      this.log.warn('ciclo auto-populate (coletivo) falhou', { error: err instanceof Error ? err.message : String(err) })
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

    // Per-person ceremony signal extraction (fire-and-forget — does not block collective completion)
    if (claudeBinPath) {
      // Primary: slugs Claude returned in pessoas_identificadas that are registered
      const fromIdentificadas = (aiResult.pessoas_identificadas ?? [])
        .filter((slug) => !!registry.get(slug))

      // Fallback: registered people whose name appears in participantes_nomes
      // (catches cases where Claude missed them in pessoas_identificadas)
      const allPeople = registry.list()
      const fromNomes = (aiResult.participantes_nomes ?? []).flatMap((nome) => {
        const candidate = nome.trim().toLowerCase().replace(/\s+/g, '-')
        if (registry.get(candidate)) return [candidate]
        // Try first-name unambiguous match
        const firstName = nome.trim().split(' ')[0].toLowerCase()
        const matches = allPeople.filter((p) => p.slug.split('-')[0] === firstName)
        return matches.length === 1 ? [matches[0].slug] : []
      })

      const registeredParticipants = [...new Set([...fromIdentificadas, ...fromNomes])]
      if (registeredParticipants.length > 0) {
        this.runCerimoniaSignalsForPeople(
          registeredParticipants, aiResult, text, uniqueFileName, claudeBinPath, registry
        ).catch((err) => this.log.warn('sinais cerimônia falhou', { error: err instanceof Error ? err.message : String(err) }))
      }

      // Gestor ceremony signal: capture manager's own participation → Meu Ciclo
      const settings2 = SettingsManager.load()
      if (settings2.managerName) {
        this.runCerimoniaSinalForGestor(aiResult, text, claudeBinPath, settings2)
          .catch((err) => this.log.warn('sinal cerimônia gestor falhou', { error: err instanceof Error ? err.message : String(err) }))
      }
    }
  }

  /**
   * For each registered participant in a collective ceremony, runs a focused per-person
   * Claude analysis and applies the resulting signals to their live profile.
   * Runs in parallel per person, serializes only on per-person profile write.
   */
  private async runCerimoniaSignalsForPeople(
    slugs: string[],
    aiResult: IngestionAIResult,
    ceremonyContent: string,
    ceremonyFileName: string,
    claudeBinPath: string,
    registry: PersonRegistry,
  ): Promise<void> {
    const teamRegistry = registry.serializeForPrompt()
    const today = new Date().toISOString().slice(0, 10)
    const settings = SettingsManager.load()

    // Processar em batches de MAX_CONCURRENT para evitar spawnar N processos claude simultaneamente
    for (let i = 0; i < slugs.length; i += MAX_CONCURRENT) {
      const batch = slugs.slice(i, i + MAX_CONCURRENT)
      await Promise.all(
        batch.map(async (slug) => {
          try {
            const pessoa = registry.get(slug)
            if (!pessoa) return

            const perfilData = registry.getPerfil(slug)
            const perfilMdRaw = perfilData?.raw ?? null

            const prompt = buildCerimoniaSinalPrompt({
              teamRegistry,
              pessoaNome: pessoa.nome,
              pessoaCargo: pessoa.cargo,
              pessoaRelacao: pessoa.relacao,
              perfilMdRaw,
              ceremonyContent,
              ceremonyTipo: aiResult.tipo,
              ceremonyData: aiResult.data_artefato,
              today,
            })

            const result = await runWithProvider('ceremonySinals', settings, prompt, {
              claudeBinPath,
              claudeTimeoutMs: 60_000,
              openRouterTimeoutMs: 60_000,
            })
            if (!result.success || !result.data) {
              this.log.warn('sinal cerimônia falhou', { slug, error: result.error ?? 'sem dados' })
              return
            }

            const validation = validateCerimoniaSinalResult(result.data)
            if (!validation.valid) {
              const details = [
                ...validation.missingFields.map((f) => `campo ausente: ${f}`),
                ...validation.typeErrors,
              ].join('; ')
              this.log.warn('schema inválido no sinal cerimônia', { slug, details })
              return
            }

            // Serialize write per person to prevent race conditions
            const release = await this.acquirePersonLock(slug)
            try {
              const writer = new ArtifactWriter(this.workspacePath)
              writer.updatePerfilDeCerimonia(
                slug,
                result.data as import('../prompts/cerimonia-sinal.prompt').CerimoniaSinalResult,
                ceremonyFileName,
                aiResult.tipo,
                aiResult.data_artefato,
              )
              this.log.info('sinal cerimônia aplicado', { slug, tipo: aiResult.tipo, data: aiResult.data_artefato })
            } finally {
              release()
            }

            this.notifyRenderer('ingestion:cerimonia-sinal-aplicado', {
              personSlug: slug,
              tipo: aiResult.tipo,
              data: aiResult.data_artefato,
            })
          } catch (err) {
            this.log.warn('sinal cerimônia erro', { slug, error: err instanceof Error ? err.message : String(err) })
          }
        })
      )
    }
  }

  /**
   * Writes artifact + updates perfil for a given item using its cached AI result.
   * No Claude call — pure file I/O.
   */

  /**
   * Runs ceremony signal analysis for the manager themselves and writes the result
   * as a .md artifact to gestor/ciclo/ so it surfaces in Meu Ciclo.
   * Fire-and-forget — does not block collective completion.
   */
  private async runCerimoniaSinalForGestor(
    aiResult: IngestionAIResult,
    ceremonyContent: string,
    claudeBinPath: string,
    settings: import('../registry/SettingsManager').AppSettings,
  ): Promise<void> {
    const today = new Date().toISOString().slice(0, 10)

    const prompt = buildCerimoniaSinalPrompt({
      teamRegistry: new PersonRegistry(this.workspacePath).serializeForPrompt(),
      pessoaNome: settings.managerName!,
      pessoaCargo: settings.managerRole ?? 'Gestor',
      pessoaRelacao: 'eu',
      perfilMdRaw: null,
      ceremonyContent,
      ceremonyTipo: aiResult.tipo,
      ceremonyData: aiResult.data_artefato,
      today,
    })

    const result = await runWithProvider('ceremonySinals', settings, prompt, {
      claudeBinPath,
      claudeTimeoutMs: 60_000,
      openRouterTimeoutMs: 60_000,
    })

    if (!result.success || !result.data) {
      this.log.warn('sinal cerimônia gestor: sem dados')
      return
    }
    const validation = validateCerimoniaSinalResult(result.data)
    if (!validation.valid) return

    const sinal = result.data as import('../prompts/cerimonia-sinal.prompt').CerimoniaSinalResult

    const gestorCicloDir = pathJoin(this.workspacePath, 'gestor', 'ciclo')
    mkdirSync(gestorCicloDir, { recursive: true })

    const fileName = `${aiResult.data_artefato}-${aiResult.tipo}-gestor-${Math.random().toString(36).slice(2, 6)}.md`
    const filePath = pathJoin(gestorCicloDir, fileName)

    const tipoLabel = { '1on1': '1:1', reuniao: 'Reunião', daily: 'Daily', planning: 'Planning', retro: 'Retro', feedback: 'Feedback', outro: 'Evento' }[aiResult.tipo] ?? 'Evento'
    const titulo = `${tipoLabel} — Minha Participação`

    const atencaoLines = sinal.pontos_de_desenvolvimento.map((p) => `- ${p}`).join('\n')
    const conquistaLines = [...sinal.hard_skills_observadas, ...sinal.feedbacks_positivos].map((e) => `- ${e}`).join('\n')
    const softLines = sinal.soft_skills_observadas.map((s) => `- ${s}`).join('\n')

    const narrative = sinal.resumo_evolutivo ?? ''

    const content = [
      `---`,
      `tipo: ${aiResult.tipo}`,
      `data: ${aiResult.data_artefato}`,
      `titulo: ${titulo}`,
      `saude: ${sinal.indicador_saude}`,
      `---`,
      ``,
      `# ${titulo}`,
      ``,
      `## Minhas Contribuições`,
      narrative,
      softLines ? `\n**Comportamentos observados:**\n${softLines}` : '',
      conquistaLines ? `\n**Conquistas e hard skills:**\n${conquistaLines}` : '',
      atencaoLines ? `\n**Pontos de atenção:**\n${atencaoLines}` : '',
      ``,
      `*Saúde: ${sinal.indicador_saude} — ${sinal.motivo_indicador}*`,
    ].filter((l) => l !== '').join('\n')

    writeFileSync(filePath, content, 'utf-8')
    this.log.info('sinal cerimônia gestor gravado', { fileName })
  }

  /**
   * Pass de 1:1 profundo: extrai follow-ups, compromissos, insights, correlações.
   * Roda após Pass 1/2 quando tipo === '1on1'. Fire-and-forget.
   * Aplica side effects: atualiza perfil (insights, sinais, tendência, resumo QR),
   * atualiza status de ações via follow-up, cria novas ações, roteia ações do gestor para Demandas.
   */
  private async run1on1DeepPass(
    slug: string,
    aiResult: IngestionAIResult,
    artifactText: string,
    claudeBinPath: string,
    fallbackAcoes?: import('../prompts/ingestion.prompt').AcaoComprometida[],
  ): Promise<OneOnOneResult | null> {
    const registry = new PersonRegistry(this.workspacePath)
    const actionReg = new ActionRegistry(this.workspacePath)
    const pessoa = registry.get(slug)
    if (!pessoa) return null

    const configYaml = registry.getConfigRaw(slug)
    const perfilData = registry.getPerfil(slug)
    const perfilMdRaw = perfilData?.raw ?? null
    const settings = SettingsManager.load()

    // Serialize open actions by owner
    const openLiderado = actionReg.getOpenByOwner(slug, 'liderado')
    const openGestor = actionReg.getOpenByOwner(slug, 'gestor')

    const serializeActions = (actions: import('../../renderer/src/types/ipc').Action[]): string => {
      if (actions.length === 0) return ''
      return actions.map((a) =>
        `- [${a.id}] "${a.descricao || a.texto}" (criada em ${a.criadoEm}${a.prazo ? `, prazo: ${a.prazo}` : ''})`
      ).join('\n')
    }

    // Extract sinais de terceiros from profile (Pontos de Atenção with source attribution)
    const sinaisTerceiros = this.extractProfileSection(perfilMdRaw, 'Sinais de Terceiros')
      || this.extractProfileSection(perfilMdRaw, 'Pontos de Atenção Ativos')
      || ''

    // Extract recent health history (last 5 entries)
    const historicoSaudeRaw = this.extractProfileSection(perfilMdRaw, 'Histórico de Saúde') || ''
    const historicoSaude = historicoSaudeRaw
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .slice(-5)
      .join('\n')

    const openActionsLideradoStr = serializeActions(openLiderado)
    const openActionsGestorStr = serializeActions(openGestor)

    const artifactForDeep = artifactText

    this.log.debug('1on1 deep pass context', {
      slug,
      artifactChars: artifactText.length,
      perfilChars: (perfilMdRaw ?? '').length,
      configChars: configYaml.length,
      acoesChars: openActionsLideradoStr.length + openActionsGestorStr.length,
      sinaisChars: sinaisTerceiros.length,
      historicoChars: historicoSaude.length,
    })

    const prompt = build1on1DeepPrompt({
      artifactContent: artifactForDeep,
      perfilMdRaw,
      configYaml,
      openActionsLiderado: openActionsLideradoStr,
      openActionsGestor: openActionsGestorStr,
      sinaisTerceiros,
      historicoSaude,
      today: new Date().toISOString().slice(0, 10),
      managerName: settings.managerName ?? undefined,
    })

    const release1on1 = await this.acquire1on1Slot()
    this.log.debug('pass 1on1', { slug, slot: this.active1on1, maxSlots: MAX_CONCURRENT_1ON1 })
    let result: Awaited<ReturnType<typeof runClaudePrompt>>
    try {
      result = await runWithProvider('ingestionDeep1on1', settings, prompt, {
        claudeBinPath,
        claudeTimeoutMs: 300_000,
        openRouterTimeoutMs: 120_000,
      })
    } finally {
      release1on1()
    }

    this.log.debug('pass 1on1 resultado', { slug, success: result.success, hasData: !!result.data, error: result.error ?? 'none', rawLen: result.rawOutput?.length ?? 0 })

    if (!result.success || !result.data) {
      this.log.warn('pass 1on1 falhou', { slug, error: result.error ?? 'sem dados' })
      if (result.rawOutput) {
        this.log.warn('pass 1on1 rawOutput', { rawOutput: result.rawOutput.slice(0, 500) })
      }
      // Fallback: write Pass 1 actions so the person's profile isn't left without any actions
      if (fallbackAcoes && fallbackAcoes.length > 0) {
        const registeredSlugs = new Set(new PersonRegistry(this.workspacePath).list().map((p) => p.slug))
        actionReg.createFromArtifact(slug, fallbackAcoes, `${aiResult.data_artefato}-${slug}.md`, aiResult.data_artefato, registeredSlugs)
        this.log.warn('pass 1on1 fallback', { slug, acoesCount: fallbackAcoes.length })
      }
      return null
    }

    const validation = validateOneOnOneResult(result.data)
    if (!validation.valid) {
      const details = [
        ...validation.missingFields.map((f) => `campo ausente: ${f}`),
        ...validation.typeErrors,
      ].join('; ')
      this.log.warn('schema inválido no pass 1on1', { slug, details })
      this.log.warn('pass 1on1 keys recebidas', { keys: Object.keys(result.data as Record<string, unknown>) })
      return null
    }

    const oneOnOneResult = result.data as OneOnOneResult
    const date = aiResult.data_artefato
    const artifactFileName = `${date}-${slug}.md`

    this.log.info('pass 1on1 concluído', {
      slug,
      followups: oneOnOneResult.followup_acoes.length,
      acoesLiderado: oneOnOneResult.acoes_liderado.length,
      insights: oneOnOneResult.insights_1on1.length,
    })

    // Apply side effects: update perfil, actions, demandas
    const release = await this.acquirePersonLock(slug)
    try {
      // 1. Update perfil with 1on1 results (insights, sinais, tendencia, resumo QR)
      const writer = new ArtifactWriter(this.workspacePath)
      writer.update1on1Results(slug, oneOnOneResult, artifactFileName)

      // 2. Update action statuses from follow-up analysis
      if (oneOnOneResult.followup_acoes.length > 0) {
        actionReg.updateFromFollowup(slug, oneOnOneResult.followup_acoes)
      }

      // 3. Create new actions from 1on1 results
      if (oneOnOneResult.acoes_liderado.length > 0 || oneOnOneResult.sugestoes_gestor.some((s) => s.gerar_acao)) {
        actionReg.createFrom1on1Result(slug, oneOnOneResult, date, artifactFileName)
      }

      // 4. Route acoes_gestor to DemandaRegistry (módulo Eu)
      if (oneOnOneResult.acoes_gestor.length > 0) {
        const demandaReg = new DemandaRegistry(this.workspacePath)
        const personConfig = new PersonRegistry(this.workspacePath).get(slug)
        const personName = personConfig?.nome ?? slug
        const relacao = personConfig?.relacao ?? 'liderado'
        const origemMap: Record<string, import('../../renderer/src/types/ipc').DemandaOrigem> = {
          liderado: 'Liderado', par: 'Par', gestor: 'Líder', stakeholder: 'Par',
        }
        const origem = origemMap[relacao] ?? 'Liderado'
        for (const acao of oneOnOneResult.acoes_gestor) {
          demandaReg.save({
            id:           `${date}-1on1-gestor-${Math.random().toString(36).slice(2, 7)}`,
            descricao:    acao.descricao,
            descricaoLonga: `Origem: 1:1 com ${personName} (${date})`,
            origem,
            pessoaSlug:   slug,
            prazo:        acao.prazo_iso ?? null,
            criadoEm:     date,
            atualizadoEm: date,
            status:       'open',
          })
        }
        this.log.info('gestor actions → Demandas', { acoesCount: oneOnOneResult.acoes_gestor.length, personName, origem })
      }
    } finally {
      release()
    }

    // Notify renderer about 1on1 deep pass completion
    this.notifyRenderer('ingestion:1on1-deep-completed', {
      personSlug: slug,
      followups: oneOnOneResult.followup_acoes.length,
      newActions: oneOnOneResult.acoes_liderado.length + oneOnOneResult.acoes_gestor.length,
      insights: oneOnOneResult.insights_1on1.length,
      tendencia: oneOnOneResult.tendencia_emocional,
    })

    return oneOnOneResult
  }

  /**
   * Extracts a named section from perfil.md raw content.
   * Returns the content between ## SectionName and the next ## or end of file.
   */
  private extractProfileSection(perfilMdRaw: string | null, sectionName: string): string {
    if (!perfilMdRaw) return ''
    const regex = new RegExp(`## ${sectionName}\\n([\\s\\S]*?)(?=\\n## |$)`)
    const match = perfilMdRaw.match(regex)
    return match ? match[1].trim() : ''
  }

  private async syncItemToPerson(item: QueueItem, slug: string, skipActions = false): Promise<void> {
    if (!item.cachedAiResult || !item.cachedText) return

    // Serialize per-person writes to prevent race conditions in parallel processing
    const release = await this.acquirePersonLock(slug)
    let totalArtefatos = 0
    try {
      const writer = new ArtifactWriter(this.workspacePath)
      const artifactFileName = writer.writeArtifact(slug, item.cachedAiResult, item.cachedText, undefined, skipActions)
      ;({ totalArtefatos } = writer.updatePerfil(slug, item.cachedAiResult, artifactFileName))
    } finally {
      release()
    }

    // Trigger profile compression every 10 artifacts (fire-and-forget, non-blocking)
    if (totalArtefatos > 0 && totalArtefatos % 10 === 0) {
      const settings = SettingsManager.load()
      if (settings.claudeBinPath) {
        new ProfileCompressor(this.workspacePath, settings)
          .compress(slug, totalArtefatos)
          .catch((err) => this.log.warn('compressão falhou', { slug, error: err instanceof Error ? err.message : String(err) }))
      }
    }

    // Auto-populate Meu Ciclo: registra contribuição do gestor sem chamada extra ao Claude
    try {
      const registry = new PersonRegistry(this.workspacePath)
      const pessoa = registry.get(slug)
      new CicloRegistry(this.workspacePath).addFromIngestion(item.cachedAiResult, pessoa?.nome ?? null)
    } catch (err) {
      this.log.warn('ciclo auto-populate falhou', { error: err instanceof Error ? err.message : String(err) })
    }

    item.status         = 'done'
    item.finishedAt     = Date.now()
    item.naoCadastradas = item.naoCadastradas?.filter((s) => s !== slug)
    // Free cached data
    item.cachedAiResult = undefined
    item.cachedText     = undefined
    this.savePendingQueue() // remove from persisted pending list
    this.moveToProcessados(item.filePath)

    this.notifyRenderer('ingestion:completed', {
      filePath: item.filePath, personSlug: slug,
      tipo: item.tipo, summary: item.summary, novas: [],
    })
  }

  /**
   * Batch re-ingestion: processes a list of files in chronological order.
   * Used for full workspace re-processing after prompt improvements.
   *
   * Flow:
   * 1. Caller provides sorted file paths (chronological order matters for resumo_evolutivo)
   * 2. Each file is enqueued and processed sequentially (respects per-person lock)
   * 3. Progress is reported via renderer events
   *
   * Does NOT clean data — caller must handle backup/reset before calling this.
   */
  async batchReingest(
    filePaths: string[],
    onProgress?: (current: number, total: number, fileName: string) => void,
  ): Promise<{ processed: number; errors: string[] }> {
    const errors: string[] = []
    let processed = 0

    this.log.info('batch reingest', { fileCount: filePaths.length })

    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i]
      const fileName = basename(filePath)
      onProgress?.(i + 1, filePaths.length, fileName)

      this.notifyRenderer('ingestion:batch-progress', {
        current: i + 1,
        total: filePaths.length,
        fileName,
      })

      // Create a queue item and process it directly (bypass drainQueue)
      const item: QueueItem = {
        id:       `batch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        filePath,
        fileName,
        status:   'queued',
      }

      try {
        await this.processItem(item)
        if (item.status === 'done' || item.status === 'pending') {
          processed++
        } else if (item.status === 'error') {
          errors.push(`${fileName}: ${item.error}`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`${fileName}: ${msg}`)
      }

      // Small delay between items to avoid overwhelming the Claude CLI
      if (i < filePaths.length - 1) {
        await new Promise((r) => setTimeout(r, 500))
      }
    }

    this.log.info('batch reingest concluído', { processed, total: filePaths.length, errors: errors.length })

    this.notifyRenderer('ingestion:batch-completed', {
      processed,
      total: filePaths.length,
      errors,
    })

    return { processed, errors }
  }

  /**
   * Resets generated data for all people (perfil.md, actions.yaml, historico/).
   * Preserves config.yaml. Used before batch re-ingestion.
   * Returns list of people whose data was reset.
   */
  static resetGeneratedData(workspacePath: string): string[] {
    const pessoasDir = join(workspacePath, 'pessoas')
    if (!existsSync(pessoasDir)) return []

    const { readdirSync, rmSync } = require('fs') as typeof import('fs')
    const people = readdirSync(pessoasDir, { withFileTypes: true })
      .filter((d: { isDirectory: () => boolean }) => d.isDirectory())
      .map((d: { name: string }) => d.name)

    const resetList: string[] = []

    for (const slug of people) {
      const personDir = join(pessoasDir, slug)

      // Remove perfil.md (will be regenerated)
      const perfilPath = join(personDir, 'perfil.md')
      if (existsSync(perfilPath)) {
        rmSync(perfilPath)
      }
      // Remove perfil.md.bak
      const bakPath = perfilPath + '.bak'
      if (existsSync(bakPath)) rmSync(bakPath)

      // Remove actions.yaml (will be regenerated)
      const actionsPath = join(personDir, 'actions.yaml')
      if (existsSync(actionsPath)) {
        rmSync(actionsPath)
      }

      // Remove historico/ directory (will be regenerated)
      const historicoDir = join(personDir, 'historico')
      if (existsSync(historicoDir)) {
        rmSync(historicoDir, { recursive: true })
        mkdirSync(historicoDir, { recursive: true })
      }

      // Remove pautas/ directory (will be regenerated)
      const pautasDir = join(personDir, 'pautas')
      if (existsSync(pautasDir)) {
        rmSync(pautasDir, { recursive: true })
        mkdirSync(pautasDir, { recursive: true })
      }

      resetList.push(slug)
    }

    // Clear pending queue
    const pendingPath = join(workspacePath, 'inbox', 'pending-queue.json')
    if (existsSync(pendingPath)) rmSync(pendingPath)

    Logger.getInstance().child('IngestionPipeline').info('reset data', { count: resetList.length, slugs: resetList.join(', ') })
    return resetList
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
   * Semaphore for 1on1 deep passes. Allows up to MAX_CONCURRENT_1ON1 simultaneous
   * passes; excess callers wait until a slot is released.
   */
  private acquire1on1Slot(): Promise<() => void> {
    if (this.active1on1 < MAX_CONCURRENT_1ON1) {
      this.active1on1++
      return Promise.resolve(() => {
        this.active1on1--
        const next = this.pending1on1.shift()
        if (next) next()
      })
    }
    return new Promise((resolve) => {
      this.pending1on1.push(() => {
        this.active1on1++
        resolve(() => {
          this.active1on1--
          const next = this.pending1on1.shift()
          if (next) next()
        })
      })
    })
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

  /**
   * Remaps AI-generated slugs to registered people when the exact slug doesn't match
   * but the first name is unambiguous (only one registered person shares that first name).
   * Mutates aiResult in place: pessoas_identificadas, pessoa_principal, novas_pessoas_detectadas.
   */
  private fuzzyRemapSlugs(
    aiResult: IngestionAIResult,
    registeredPeople: Array<{ slug: string; nome: string }>,
    managerSlug?: string,
  ): void {
    const registeredSlugs = new Set(registeredPeople.map((p) => p.slug))
    const managerFirstName = managerSlug ? managerSlug.split('-')[0] : null

    // Build first-name → slug index (only keep unambiguous entries)
    const firstNameIndex = new Map<string, string | null>()
    for (const p of registeredPeople) {
      const firstName = p.slug.split('-')[0]
      if (firstNameIndex.has(firstName)) {
        firstNameIndex.set(firstName, null) // ambiguous — more than one person
      } else {
        firstNameIndex.set(firstName, p.slug)
      }
    }

    function resolve(slug: string): string | null {
      if (registeredSlugs.has(slug)) return null // already registered, no remap needed
      const firstName = slug.split('-')[0]
      // Never remap a slug whose first name matches the manager — they are the user,
      // not a registered team member, so any match would route to the wrong person.
      if (managerFirstName && firstName === managerFirstName) return null
      const match = firstNameIndex.get(firstName)
      return match ?? null // null if ambiguous or no match
    }

    // Remap pessoas_identificadas
    const remapped = new Map<string, string>()
    aiResult.pessoas_identificadas = (aiResult.pessoas_identificadas ?? []).map((slug) => {
      const match = resolve(slug)
      if (match) {
        remapped.set(slug, match)
        this.log.info('fuzzy match', { from: slug, to: match })
        return match
      }
      return slug
    })

    // Remap pessoa_principal
    if (aiResult.pessoa_principal && remapped.has(aiResult.pessoa_principal)) {
      aiResult.pessoa_principal = remapped.get(aiResult.pessoa_principal)!
    } else if (aiResult.pessoa_principal) {
      const match = resolve(aiResult.pessoa_principal)
      if (match) {
        this.log.info('fuzzy match (principal)', { from: aiResult.pessoa_principal, to: match })
        aiResult.pessoa_principal = match
      }
    }

    // Remove remapped slugs from novas_pessoas_detectadas (they're not new)
    if (remapped.size > 0) {
      aiResult.novas_pessoas_detectadas = (aiResult.novas_pessoas_detectadas ?? [])
        .filter((p) => !remapped.has(p.slug))
    }
  }

  private async processItem(item: QueueItem): Promise<void> {
    item.status    = 'processing'
    item.startedAt = Date.now()
    this.log.info('processing', { fileName: item.fileName })

    try {
      const settings         = SettingsManager.load()
      const registry         = new PersonRegistry(this.workspacePath)
      const detectedRegistry = new DetectedRegistry(this.workspacePath)
      const teamRegistry     = registry.serializeForPrompt()

      // Read file content
      let { text } = await readFile(item.filePath)

      // Pass 0: Gemini preprocessing (optional)
      // Reduz tokens enviados ao Claude limpando transcrições brutas
      const geminiActive = !!(settings.useGeminiPreprocessing && settings.googleAiApiKey)
      if (geminiActive) {
        this.log.debug('Pass 0: Pré-processamento Gemini ativo')
        const preprocessResult = await preprocessTranscript(settings.googleAiApiKey!, text, 90_000, item.fileName)
        if (preprocessResult.success) {
          text = preprocessResult.cleanedText
          this.log.debug('Pass 0: transcript reduction', {
            originalLength: preprocessResult.originalLength,
            cleanedLength: preprocessResult.cleanedLength,
            economy: preprocessResult.reductionPercent.toFixed(1) + '%',
          })
        } else {
          const isTimeout = preprocessResult.error?.includes('Timeout')
          const hint = isTimeout
            ? 'Tente novamente ou desative o pré-processamento nas Settings.'
            : 'Verifique sua API key e créditos em aistudio.google.com, ou desative o pré-processamento nas Settings.'
          throw new Error(`Pré-processamento Gemini falhou: ${preprocessResult.error}. ${hint}`)
        }
      }

      // Read current perfil.md if there's a likely person match
      // (we'll figure out the person after AI analysis)
      if (!settings.claudeBinPath) {
        throw new Error('Claude CLI não configurado. Configure o caminho em Settings.')
      }

      const today = new Date().toISOString().slice(0, 10)

      const managerName = settings.managerName ?? undefined

      const PASS1_SYSTEM_PROMPT = 'You must respond with valid JSON only. Do not include markdown code blocks, explanations, or any text outside the JSON object.'

      // Pass 1: identify pessoa_principal (no perfil context yet)
      const promptPass1 = buildIngestionPrompt({
        teamRegistry,
        perfilMdRaw: null,
        artifactContent: text,
        today,
        managerName,
      })

      const resultPass1 = await runWithProvider('ingestionPass1', settings, promptPass1, {
        claudeBinPath: settings.claudeBinPath,
        claudeTimeoutMs: 90_000,
        openRouterTimeoutMs: 60_000,
        systemPrompt: PASS1_SYSTEM_PROMPT,
        validate: validateIngestionResult,
      })

      if (!resultPass1.success || !resultPass1.data) {
        throw new Error(resultPass1.error || 'Claude não retornou dados válidos')
      }

      const validation1 = validateIngestionResult(resultPass1.data)
      if (!validation1.valid) {
        const details = [...validation1.missingFields.map((f) => `campo ausente: ${f}`), ...validation1.typeErrors].join('; ')
        throw new Error(`Schema inválido na saída do Claude (pass 1): ${details}`)
      }

      let aiResult = resultPass1.data as IngestionAIResult

      // Pass 2: if pessoa_principal is registered and has a perfil, re-run with context
      // This ensures resumo_evolutivo and temas_atualizados integrate the real history
      const principalPass1 = aiResult.pessoa_principal
      if (principalPass1 && registry.get(principalPass1)) {
        const perfil = registry.getPerfil(principalPass1)
        if (perfil && shouldRunPass2(perfil.frontmatter, text.length, principalPass1)) {
          this.log.debug('pass 2 with profile', { slug: principalPass1 })
          const promptPass2 = buildIngestionPrompt({
            teamRegistry,
            perfilMdRaw: perfil.raw,
            artifactContent: text,
            today,
            managerName,
          })
          // Pass 2 carries the full perfil.md in context — allow up to 3× the base timeout
          const resultPass2 = await runWithProvider('ingestionPass2', settings, promptPass2, {
            claudeBinPath: settings.claudeBinPath,
            claudeTimeoutMs: 180_000,
            openRouterTimeoutMs: 90_000,
          })
          if (resultPass2.success && resultPass2.data) {
            const validation2 = validateIngestionResult(resultPass2.data)
            if (validation2.valid) {
              aiResult = resultPass2.data as IngestionAIResult
            } else {
              const details = [...validation2.missingFields.map(f => `campo ausente: ${f}`), ...validation2.typeErrors].join('; ')
              this.log.warn('schema inválido no pass 2, mantendo pass 1', { details })
            }
          } else {
            this.log.warn('pass 2 falhou, usando pass 1', { slug: principalPass1, error: resultPass2.error ?? 'sem dados' })
          }
        }
      }

      // Fuzzy-match: remap AI-generated slugs to registered people by first name
      // when the slug doesn't match exactly but the first name is unambiguous
      const registeredPeople = registry.list()
      const managerSlugForRemap = (settings.managerName ?? '').trim().toLowerCase().replace(/\s+/g, '-') || undefined
      this.fuzzyRemapSlugs(aiResult, registeredPeople, managerSlugForRemap)

      // Identify which people are registered vs unknown
      const pessoasIdentificadas = aiResult.pessoas_identificadas ?? []
      const naoCadastradas = pessoasIdentificadas.filter((s) => !registry.get(s))
      const principal = aiResult.pessoa_principal  // re-read after fuzzy remap

      // Store newly detected (unregistered) people so the user can promote them
      const novas = aiResult.novas_pessoas_detectadas ?? []
      // Manager slug: never stored as a detected person (they live in "Eu" module)
      const managerSlug = (settings.managerName ?? '').trim().toLowerCase().replace(/\s+/g, '-')
      // Build a slug→nome map from novas for name lookups
      const novasNomeMap: Record<string, string> = {}
      for (const p of novas) {
        novasNomeMap[p.slug] = p.nome
        if (!registry.get(p.slug) && p.slug !== managerSlug) {
          detectedRegistry.upsert(p.slug, p.nome, item.fileName)
        }
      }
      // Also store naoCadastradas that the AI matched from pessoas_identificadas
      for (const slug of naoCadastradas) {
        if (slug === managerSlug) continue  // manager belongs to "Eu", not to the team registry
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
        // Capture before sync (sync clears cached data)
        const capturedAiResult = aiResult
        const capturedText = text

        // Force 1:1 BEFORE sync so skipActions is correct
        const titulo = capturedAiResult.titulo ?? ''
        const fileName = item.fileName ?? ''
        const is1on1Pattern = /\b(1[:\s]?1|1on1|one-on-one|1-o-1)\b/i.test(titulo) ||
          /^[\w\s]+\s*[\/\-\_]\s*[\w\s]+$/.test(titulo.trim()) ||
          /\b(1[:\s]?1|1on1|one-on-one|1-o-1)\b/i.test(fileName) ||
          /^[\w\s]+\s*[\/\-\_]\s*[\w\s]+$/.test(fileName.replace(/\d{4}[_\-]\d{2}[_\-]\d{2}.*/, '').trim())
        if (is1on1Pattern && capturedAiResult.tipo !== '1on1') {
          capturedAiResult.tipo = '1on1'
          this.log.warn('tipo forçado para 1on1', { fileName: item.fileName, titulo })
        }

        // For 1:1s, skip Pass 1 actions — the 1:1 deep pass creates them with better quality
        const is1on1 = capturedAiResult.tipo === '1on1'
        await this.syncItemToPerson(item, principal, is1on1)
        this.log.info('done', { fileName: item.fileName, slug: principal, elapsed: item.startedAt ? Date.now() - item.startedAt : undefined })

        // ExternalDataPass: fetch Jira/GitHub metrics (fire-and-forget, graceful degradation)
        new ExternalDataPass(this.workspacePath)
          .run(principal)
          .catch((err) => this.log.warn('external data pass falhou', { slug: principal, error: err instanceof Error ? err.message : String(err) }))

        // Pass 1on1: deep analysis for 1:1 artifacts (fire-and-forget)
        // Pass fallbackAcoes so if deep pass fails, Pass 1 actions are written as safety net
        if (is1on1 && settings.claudeBinPath) {
          const fallbackAcoes = capturedAiResult.acoes_comprometidas
          this.run1on1DeepPass(principal, capturedAiResult, capturedText, settings.claudeBinPath, fallbackAcoes)
            .catch((err) => this.log.warn('pass 1on1 falhou', { error: err instanceof Error ? err.message : String(err) }))
        }
      } else if (!principal) {
        // Reunião coletiva: sem pessoa_principal → salva em _coletivo + sinais por pessoa (async)
        this.syncItemToCollective(item, settings.claudeBinPath)
        this.log.info('done (coletivo)', { fileName: item.fileName })
      } else {
        // pessoa_principal identificada mas não cadastrada → pending
        item.status = 'pending'
        this.savePendingQueue() // persist to disk so restart doesn't lose this item
        this.notifyRenderer('ingestion:completed', {
          filePath: item.filePath, personSlug: undefined,
          tipo: item.tipo, summary: item.summary, novas,
        })
        this.log.info('pending', { fileName: item.fileName, principal })
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

      this.log.error('error', { fileName: item.fileName, error })
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
      this.log.info('moved to processados', { fileName: basename(normalizedPath) })
    } catch (err) {
      this.log.error('failed to move file', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  private notifyRenderer(channel: string, payload: unknown): void {
    const wins = BrowserWindow.getAllWindows()
    for (const win of wins) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    }
  }
}

/**
 * Determines whether a second Claude pass is worth running.
 * Avoids spending 60-90s on Pass 2 when the artifact is too short
 * or the profile doesn't have enough history to benefit from context integration.
 *
 * Rules:
 *  - Skip for _coletivo (no evolving profile)
 *  - Skip if this is one of the first 2 artifacts (not enough history to integrate)
 *  - Skip if the artifact content is under 300 chars (e.g. a short daily note)
 */
export function shouldRunPass2(
  frontmatter: Record<string, unknown>,
  artefatoSize: number,
  slug: string,
): boolean {
  if (slug === '_coletivo') return false
  const totalArtefatos = typeof frontmatter.total_artefatos === 'number' ? frontmatter.total_artefatos : 0
  return totalArtefatos >= 2 && artefatoSize > 300
}

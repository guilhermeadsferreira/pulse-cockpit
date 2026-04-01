import type { AppSettings, PersonConfig, ArtifactMeta, ArtifactFeedItem, PerfilData, QueueItem, CycleReportParams, DetectedPerson, PautaMeta, Action, ActionStatus, DocItem, LogLevel, LogEntry, ExternalHistoricoEntry } from './ipc'

declare global {
  interface Window {
    api: {
      ping: () => Promise<{ ok: boolean; ts: number }>

      settings: {
        load:           () => Promise<AppSettings>
        save:           (data: AppSettings) => Promise<void>
        detectClaude:   () => Promise<string>
        setupWorkspace: (path: string) => Promise<void>
        selectFolder:   () => Promise<string | null>
      }

      people: {
        list:       () => Promise<PersonConfig[]>
        get:        (slug: string) => Promise<PersonConfig | null>
        save:       (data: PersonConfig) => Promise<void>
        delete:     (slug: string) => Promise<void>
        getPerfil:  (slug: string) => Promise<PerfilData | null>
        listPautas:       (slug: string) => Promise<PautaMeta[]>
        ratePauta:        (slug: string, date: string, rating: 'util' | 'precisa_melhorar', nota?: string) => Promise<void>
        listPautaRatings: (slug: string) => Promise<Array<{ date: string; rating: string; nota?: string }>>
      }

      artifacts: {
        list: (slug: string) => Promise<ArtifactMeta[]>
        read: (path: string) => Promise<string>
        feed: () => Promise<ArtifactFeedItem[]>
        open: (slug: string, fileName: string) => Promise<void>
      }

      ingestion: {
        onStarted:       (cb: (e: unknown) => void) => void
        onCompleted:     (cb: (e: unknown) => void) => void
        onFailed:        (cb: (e: unknown) => void) => void
        removeListeners: () => void
        getQueue:        () => Promise<QueueItem[]>
        enqueue:         (filePath: string) => Promise<void>
        listProcessados: () => Promise<string[]>
        resetData:       () => Promise<void>
        resetPersonData: (slug: string) => Promise<boolean>
        batchReingest:   (files: string[]) => Promise<{ processed: number; errors: string[] }>
      }

      ai: {
        test:           () => Promise<ClaudeTestResult>
        generateAgenda: (slug: string) => Promise<unknown>
        cycleReport:    (params: CycleReportParams) => Promise<unknown>
      }

      detected: {
        list:    () => Promise<DetectedPerson[]>
        dismiss: (slug: string) => Promise<void>
      }

      actions: {
        list:         (slug: string) => Promise<Action[]>
        save:         (action: unknown) => Promise<void>
        updateStatus: (slug: string, id: string, status: ActionStatus) => Promise<void>
        delete:       (slug: string, id: string) => Promise<void>
        escalations:  () => Promise<Array<{ slug: string; nome: string; gestorAction: { id: string; texto: string; descricao?: string; criadoEm: string }; diasPendente: number; relatedCount: number }>>
      }

      insights: {
        crossTeam: () => Promise<Array<{ tipo: string; descricao: string; pessoas: string[]; severidade: 'alta' | 'media' | 'baixa' }>>
      }

      eu: {
        listDemandas:        () => Promise<unknown[]>
        saveDemanda:         (data: unknown) => Promise<void>
        deleteDemanda:       (id: string) => Promise<void>
        updateDemandaStatus: (id: string, status: string, addToCiclo: boolean) => Promise<void>
        listCiclo:           () => Promise<unknown[]>
        addManualEntry:      (texto: string) => Promise<void>
        deleteCicloEntry:    (id: string) => Promise<void>
        ingestArtifact:      (filePath: string) => Promise<void>
        gerarAutoavaliacao:  (params: unknown) => Promise<unknown>
      }

      shell: {
        open: (filePath: string) => Promise<void>
      }

      update: {
        onStatus:        (cb: (data: UpdateStatus) => void) => void
        getStatus:       () => Promise<UpdateStatus | null>
        install:         () => Promise<void>
        removeListeners: () => void
      }

      refinamentos: {
        list:   () => Promise<DocItem[]>
        save:   (srcPath: string) => Promise<string>
        read:   (filePath: string) => Promise<string>
        delete: (filePath: string) => Promise<void>
      }

      logs: {
        write:     (level: LogLevel, module: string, msg: string, data?: unknown) => Promise<void>
        recent:    (opts?: { limit?: number; level?: LogLevel; module?: string }) => Promise<LogEntry[]>
        files:     () => Promise<Array<{ name: string; size: number; date: string }>>
        readFile:  (name: string) => Promise<string>
        onEntry:   (cb: (entry: LogEntry) => void) => void
        removeListeners: () => void
      }

      external: {
        refreshDaily:   () => Promise<string>
        refreshSprint:  () => Promise<string | null>
        refreshWeekly:  () => Promise<string>
        refreshMonthly: (yearMonth?: string) => Promise<string>
        refreshPerson:  (slug: string) => Promise<void>
        getData:        (slug: string) => Promise<string | null>
        getHistorico:   (slug: string) => Promise<Record<string, ExternalHistoricoEntry> | null>
        listReports:       () => Promise<Array<{ name: string; date: string; size: number }>>
        getReport:         (path: string) => Promise<string>
        regenerateReport:  (name: string) => Promise<string>
      }

      github: {
        syncTeamRepos: () => Promise<{ success: boolean; repos?: string[]; error?: string }>
      }
    }
  }

  interface UpdateStatus {
    phase:    'available' | 'downloading' | 'ready' | 'error'
    version?: string
    progress?: number
    error?: string
  }

  interface ClaudeTestResult {
    success: boolean
    data?: unknown
    rawOutput?: string
    error?: string
  }
}

export {}

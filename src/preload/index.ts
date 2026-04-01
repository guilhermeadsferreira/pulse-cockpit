import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('api', {
  ping: () => ipcRenderer.invoke('ipc:ping'),
  getFilePath: (file: File) => webUtils.getPathForFile(file),

  settings: {
    load:           ()              => ipcRenderer.invoke('settings:load'),
    save:           (data: unknown) => ipcRenderer.invoke('settings:save', data),
    detectClaude:   ()              => ipcRenderer.invoke('settings:detect-claude'),
    setupWorkspace: (path: string)  => ipcRenderer.invoke('settings:setup-workspace', path),
    selectFolder:   ()              => ipcRenderer.invoke('settings:select-folder'),
  },

  people: {
    list:       ()              => ipcRenderer.invoke('people:list'),
    get:        (slug: string)  => ipcRenderer.invoke('people:get', slug),
    save:       (data: unknown) => ipcRenderer.invoke('people:save', data),
    delete:     (slug: string)  => ipcRenderer.invoke('people:delete', slug),
    getPerfil:  (slug: string)  => ipcRenderer.invoke('people:get-perfil', slug),
    listPautas:       (slug: string)  => ipcRenderer.invoke('people:list-pautas', slug),
    ratePauta:        (slug: string, date: string, rating: 'util' | 'precisa_melhorar', nota?: string) => ipcRenderer.invoke('people:rate-pauta', slug, date, rating, nota),
    listPautaRatings: (slug: string) => ipcRenderer.invoke('people:list-pauta-ratings', slug),
    lastResumoRH: (slug: string) => ipcRenderer.invoke('people:last-resumo-rh', slug),
  },

  artifacts: {
    list:    (slug: string)  => ipcRenderer.invoke('artifacts:list', slug),
    read:    (path: string)  => ipcRenderer.invoke('artifacts:read', path),
    feed:    ()              => ipcRenderer.invoke('artifacts:feed'),
    open:    (slug: string, fileName: string) => ipcRenderer.invoke('artifacts:open', slug, fileName),
  },

  ai: {
    test:           ()               => ipcRenderer.invoke('ai:test'),
    generateAgenda: (slug: string)   => ipcRenderer.invoke('ai:generate-agenda', slug),
    cycleReport:    (params: unknown) => ipcRenderer.invoke('ai:cycle-report', params),
  },

  detected: {
    list:    ()              => ipcRenderer.invoke('detected:list'),
    dismiss: (slug: string) => ipcRenderer.invoke('detected:dismiss', slug),
  },

  actions: {
    list:         (slug: string)                              => ipcRenderer.invoke('actions:list', slug),
    save:         (action: unknown)                           => ipcRenderer.invoke('actions:save', action),
    updateStatus: (slug: string, id: string, status: string) => ipcRenderer.invoke('actions:update-status', slug, id, status),
    delete:       (slug: string, id: string)                  => ipcRenderer.invoke('actions:delete', slug, id),
    escalations:  ()                                          => ipcRenderer.invoke('actions:escalations'),
  },

  insights: {
    crossTeam: () => ipcRenderer.invoke('insights:cross-team'),
  },

  eu: {
    listDemandas:        ()                                                          => ipcRenderer.invoke('demandas:list'),
    listDemandasByPerson: (slug: string)                                             => ipcRenderer.invoke('demandas:list-by-person', slug),
    saveDemanda:         (data: unknown)                                             => ipcRenderer.invoke('demandas:save', data),
    deleteDemanda:       (id: string)                                                => ipcRenderer.invoke('demandas:delete', id),
    updateDemandaStatus: (id: string, status: string, addToCiclo: boolean)          => ipcRenderer.invoke('demandas:update-status', id, status, addToCiclo),
    listCiclo:           ()                                                          => ipcRenderer.invoke('ciclo:list'),
    addManualEntry:      (texto: string)                                             => ipcRenderer.invoke('ciclo:add-manual', texto),
    deleteCicloEntry:    (id: string)                                                => ipcRenderer.invoke('ciclo:delete', id),
    ingestArtifact:      (filePath: string)                                          => ipcRenderer.invoke('ciclo:ingest-artifact', filePath),
    gerarAutoavaliacao:  (params: unknown)                                           => ipcRenderer.invoke('ciclo:autoavaliacao', params),
  },

  shell: {
    open: (filePath: string) => ipcRenderer.invoke('shell:open', filePath),
  },

  refinamentos: {
    list:   ()                             => ipcRenderer.invoke('refinamentos:list'),
    save:   (srcPath: string)              => ipcRenderer.invoke('refinamentos:save', srcPath),
    read:   (filePath: string)             => ipcRenderer.invoke('refinamentos:read', filePath),
    delete: (filePath: string)             => ipcRenderer.invoke('refinamentos:delete', filePath),
  },

  update: {
    onStatus:        (cb: (data: unknown) => void) => ipcRenderer.on('update:status', (_, d) => cb(d)),
    getStatus:       ()                            => ipcRenderer.invoke('update:get-status'),
    install:         ()                            => ipcRenderer.invoke('update:install'),
    removeListeners: ()                            => ipcRenderer.removeAllListeners('update:status'),
  },

  ingestion: {
    onStarted:       (cb: (e: unknown) => void) => ipcRenderer.on('ingestion:started',   (_, d) => cb(d)),
    onCompleted:     (cb: (e: unknown) => void) => ipcRenderer.on('ingestion:completed', (_, d) => cb(d)),
    onFailed:        (cb: (e: unknown) => void) => ipcRenderer.on('ingestion:failed',    (_, d) => cb(d)),
    removeListeners: () => {
      ipcRenderer.removeAllListeners('ingestion:started')
      ipcRenderer.removeAllListeners('ingestion:completed')
      ipcRenderer.removeAllListeners('ingestion:failed')
    },
    getQueue:         ()                    => ipcRenderer.invoke('ingestion:queue'),
    enqueue:          (filePath: string)    => ipcRenderer.invoke('ingestion:enqueue', filePath),
    listProcessados:  ()                    => ipcRenderer.invoke('ingestion:list-processados'),
    resetData:        ()                    => ipcRenderer.invoke('ingestion:reset-data'),
    resetPersonData: (slug: string)         => ipcRenderer.invoke('ingestion:reset-person-data', slug),
    batchReingest:    (files: string[])     => ipcRenderer.invoke('ingestion:batch-reingest', files),
  },

  logs: {
    write:     (level: string, module: string, msg: string, data?: unknown) => ipcRenderer.invoke('log:write', level, module, msg, data),
    recent:    (opts?: unknown) => ipcRenderer.invoke('log:recent', opts),
    files:     () => ipcRenderer.invoke('log:files'),
    readFile:  (name: string) => ipcRenderer.invoke('log:read-file', name),
    onEntry:   (cb: (e: unknown) => void) => ipcRenderer.on('log:entry', (_, entry) => cb(entry)),
    removeListeners: () => ipcRenderer.removeAllListeners('log:entry'),
  },

  external: {
    refreshDaily:   ()              => ipcRenderer.invoke('external:refresh-daily'),
    refreshSprint:  ()              => ipcRenderer.invoke('external:refresh-sprint'),
    refreshWeekly:  ()              => ipcRenderer.invoke('external:refresh-weekly'),
    refreshMonthly: (yearMonth?: string) => ipcRenderer.invoke('external:refresh-monthly', yearMonth),
    refreshPerson:  (slug: string)  => ipcRenderer.invoke('external:refresh-person', slug),
    getData:        (slug: string)  => ipcRenderer.invoke('external:get-data', slug),
    getHistorico:   (slug: string)  => ipcRenderer.invoke('external:get-historico', slug),
    listReports:       ()              => ipcRenderer.invoke('external:list-reports'),
    getReport:         (path: string)  => ipcRenderer.invoke('external:get-report', path),
    regenerateReport:  (name: string)  => ipcRenderer.invoke('external:regenerate-report', name),
  },

  github: {
    syncTeamRepos: () => ipcRenderer.invoke('github:sync-team-repos'),
  },

  audit: {
    run: () => ipcRenderer.invoke('audit:run'),
  },
})

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
    listPautas: (slug: string)  => ipcRenderer.invoke('people:list-pautas', slug),
  },

  artifacts: {
    list:    (slug: string)  => ipcRenderer.invoke('artifacts:list', slug),
    read:    (path: string)  => ipcRenderer.invoke('artifacts:read', path),
    feed:    ()              => ipcRenderer.invoke('artifacts:feed'),
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
  },

  eu: {
    listDemandas:        ()                                                          => ipcRenderer.invoke('demandas:list'),
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
    getQueue: ()                  => ipcRenderer.invoke('ingestion:queue'),
    enqueue:  (filePath: string)  => ipcRenderer.invoke('ingestion:enqueue', filePath),
  },
})

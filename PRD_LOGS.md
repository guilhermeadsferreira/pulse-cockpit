Design a logging system for pulse-cockpit, an Electron + React app at /Users/guilhermeaugusto/Documents/workspace-projects/pulse-cockpit.

       Current State

       - 91 console.log/warn/error calls across 8 files, NO logging library
       - Custom ts() timestamp helper in some files (inconsistent)
       - Bracket-prefix convention [ModuleName] already in use
       - Heavy logging in: IngestionPipeline.ts (53), ClaudeRunner.ts (12), GeminiPreprocessor.ts (11)
       - Settings stored in ~/.pulsecockpit/settings.json via SettingsManager.ts
       - Electron app: main process + renderer via contextBridge IPC

       Requirements

       1. Logger module (src/main/logging/Logger.ts) - centralized, replaces all console.* calls
       2. File persistence - logs written to disk for post-mortem debugging
       3. Log viewer in renderer - users can see logs that currently only show in dev terminal
       4. Semantic review - improve log messages: add missing context, normalize format, add logs where gaps exist

       Design Constraints

       - No external logging library (keep it simple, Electron-native)
       - Logs dir: ~/.pulsecockpit/logs/
       - Must work across main process (most logs) and renderer (few logs, via IPC)
       - Log levels: debug, info, warn, error
       - Must maintain existing [ModuleName] convention
       - Keep file rotation simple (daily files, configurable retention)
       - The renderer log viewer should be a new view/tab, not a modal

       Architecture Context

       - Main process: src/main/index.ts (IPC handlers), src/main/ingestion/* (pipeline), src/main/registry/* (data)
       - Preload: src/preload/index.ts (contextBridge with window.api)
       - Renderer types: src/renderer/src/types/global.d.ts
       - Settings: src/main/registry/SettingsManager.ts manages AppSettings
       - Build: electron-vite with aliases @main, @renderer

       What I need from you:

       1. Design the Logger class API (levels, format, file rotation)
       2. Design the IPC bridge for renderer → main logging and for log viewing
       3. Plan the log viewer UI (what it shows, filtering, auto-scroll)
       4. Create a migration plan for replacing all 91 console.* calls
       5. Review semantic gaps - suggest specific log improvements per module:
         - Missing logs (e.g., IPC handler entry/exit, settings changes, person CRUD)
         - Better context (e.g., adding person slug, artifact type, elapsed time where missing)
         - Severity corrections (some console.log should be warn/error and vice versa)
       6. Plan file structure and all files to create/modify

       Keep the design lean - this is a desktop app for a single user, not a distributed system.

       ----

       I now have a thorough understanding of the codebase. Let me compile the full design plan.

       ---
       Logging System Design for pulse-cockpit

       1. Logger Class API

       File: src/main/logging/Logger.ts

       export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

       export interface LogEntry {
         timestamp: string       // ISO 8601 with ms: "2026-03-30T14:23:45.123Z"
         level: LogLevel
         module: string          // e.g. "IngestionPipeline", "ClaudeRunner"
         message: string
         data?: Record<string, unknown>  // structured context (slug, elapsed, etc.)
       }

       class Logger {
         private static instance: Logger
         private level: LogLevel = 'info'
         private logDir: string           // ~/.pulsecockpit/logs/
         private currentStream: fs.WriteStream | null
         private currentDate: string
         private buffer: LogEntry[] = []  // in-memory ring buffer for renderer viewer
         private maxBufferSize = 2000

         static getInstance(): Logger

         // Per-module child logger (preserves [ModuleName] convention)
         child(module: string): ModuleLogger

         // Configuration
         setLevel(level: LogLevel): void
         setRetentionDays(days: number): void  // default: 7

         // Core write (internal)
         private write(entry: LogEntry): void

         // File management
         private ensureStream(): void       // create/rotate daily file
         private rotateIfNeeded(): void     // check date, close old stream
         cleanOldLogs(): void               // delete files older than retention

         // Renderer support
         getRecentLogs(limit?: number, levelFilter?: LogLevel, moduleFilter?: string): LogEntry[]
         getLogFiles(): Array<{ name: string; size: number; date: string }>
         readLogFile(fileName: string): string
       }

       class ModuleLogger {
         constructor(private logger: Logger, private module: string)

         debug(msg: string, data?: Record<string, unknown>): void
         info(msg: string, data?: Record<string, unknown>): void
         warn(msg: string, data?: Record<string, unknown>): void
         error(msg: string, data?: Record<string, unknown>): void
       }

       Format on disk (one JSON object per line, for easy parsing and tail -f):
       {"ts":"2026-03-30T14:23:45.123Z","level":"info","mod":"IngestionPipeline","msg":"processing: meeting-notes.md","data":{"fileName":"meeting-notes.md"}}

       File naming: ~/.pulsecockpit/logs/pulse-2026-03-30.log

       Rotation strategy: On each write(), check if the date has changed. If so, close the old stream, open a new file. On app startup, call cleanOldLogs() to delete files older than retentionDays (default 7). No
       size-based rotation needed for a single-user desktop app.

       Why JSON-lines instead of plain text: The existing logUpdaterError in index.ts already writes timestamped text. JSON-lines gives us structured data for the log viewer's filtering without adding complexity --
        each line is independently parseable. The file remains human-readable via cat.

       Performance note: Writes go through a fs.WriteStream (buffered by Node). The in-memory ring buffer (buffer) is append-only with a 2000-entry cap, sufficient for a session's worth of logs in the viewer
       without memory pressure.

       2. IPC Bridge Design

       New IPC channels (added to src/main/index.ts in registerIpcHandlers()):

       // Renderer → main: log a message from renderer code
       ipcMain.handle('log:write', (_event, level: LogLevel, module: string, message: string, data?: Record<string, unknown>) => {
         logger.child(module).log(level, message, data)
       })

       // Renderer → main: query logs for viewer
       ipcMain.handle('log:recent', (_event, opts?: { limit?: number; level?: LogLevel; module?: string }) => {
         return logger.getRecentLogs(opts?.limit, opts?.level, opts?.module)
       })

       // Renderer → main: list log files on disk
       ipcMain.handle('log:files', () => {
         return logger.getLogFiles()
       })

       // Renderer → main: read a full log file (for export/download)
       ipcMain.handle('log:read-file', (_event, fileName: string) => {
         return logger.readLogFile(fileName)
       })

       // Main → renderer: push new log entries in real-time
       // (sent via mainWindow.webContents.send('log:entry', entry))

       Preload additions (src/preload/index.ts):

       logs: {
         write:     (level, module, msg, data?) => ipcRenderer.invoke('log:write', level, module, msg, data),
         recent:    (opts?) => ipcRenderer.invoke('log:recent', opts),
         files:     () => ipcRenderer.invoke('log:files'),
         readFile:  (name) => ipcRenderer.invoke('log:read-file', name),
         onEntry:   (cb) => ipcRenderer.on('log:entry', (_, entry) => cb(entry)),
         removeListeners: () => ipcRenderer.removeAllListeners('log:entry'),
       }

       Real-time push: Every time Logger.write() is called, after writing to file and buffer, it also sends the entry to the renderer via BrowserWindow.webContents.send('log:entry', entry). This reuses the same
       pattern already established by notifyRenderer() in IngestionPipeline and sendUpdateStatus() in index.ts.

       Renderer-side logging: The renderer currently has only 3 console.* calls (ErrorBoundary, PersonView). For these, the preload API window.api.logs.write(...) sends the log to main process which writes to the
       same file. No separate renderer log file.

       3. Log Viewer UI

       New view: src/renderer/src/views/LogsView.tsx

       Router addition -- add 'logs' to the ViewName union in router.tsx, and the corresponding route in App.tsx. Sidebar nav item with a Terminal or FileText icon from lucide-react, placed after "Refinamentos" and
        before the Settings gear.

       UI structure (follows existing view patterns like InboxView):

       +---------------------------------------------------+
       | Logs                              [Level ▾] [Module ▾] |
       +---------------------------------------------------+
       | Filter bar:                                        |
       |   [debug] [info] [warn] [error]   (toggle buttons) |
       |   [Module: All ▾]   [Search: ________]             |
       +---------------------------------------------------+
       | Log entries (virtual-scrolled list):               |
       |                                                     |
       | 14:23:45.123  INFO  IngestionPipeline              |
       |   processing: meeting-notes.md                      |
       |   {fileName: "meeting-notes.md"}                    |
       |                                                     |
       | 14:23:46.001  WARN  ClaudeRunner                   |
       |   retry 1/1 em 1234ms                              |
       |                                                     |
       | [Auto-scroll ↓]        [Export today's log]        |
       +---------------------------------------------------+
       | Log files on disk:                                  |
       |   pulse-2026-03-30.log (42 KB) - today             |
       |   pulse-2026-03-29.log (128 KB)                    |
       |   [Open in Finder]                                  |
       +---------------------------------------------------+

       Key behaviors:
       - Real-time streaming: Subscribe to window.api.logs.onEntry() on mount. New entries appear at the bottom.
       - Auto-scroll: On by default. Disables when user scrolls up. Re-enables when user clicks "Auto-scroll" or scrolls to bottom.
       - Level filter: Toggle buttons (debug/info/warn/error). Default: info and above (debug hidden).
       - Module filter: Dropdown populated from unique modules in current buffer.
       - Text search: Simple substring match on message field.
       - Color coding: debug = muted gray, info = default text, warn = yellow/amber (reuse var(--yellow) or similar), error = red (reuse var(--red)).
       - Export: Button to open today's log file via shell.openPath(), reusing the existing window.api.shell.open() API.
       - Log files list: Collapsible section at the bottom showing files on disk with sizes, with an "Open in Finder" button.
       - No pagination needed: The 2000-entry in-memory buffer is sufficient. For historical logs, users open the file directly.

       4. Migration Plan for Replacing 91 console.* Calls

       Phase approach -- migrate file by file, heaviest first:

       Step 1: Create Logger infrastructure (no migration yet)
       - Create src/main/logging/Logger.ts with the Logger and ModuleLogger classes
       - Create src/main/logging/index.ts barrel export
       - Initialize Logger singleton in src/main/index.ts at app startup (before registerIpcHandlers)
       - Register IPC handlers for log channels
       - Add preload API

       Step 2: Migrate IngestionPipeline.ts (53 calls)

       The file uses new Date().toTimeString().slice(0, 8) inline for timestamps. All 53 calls follow the [IngestionPipeline] prefix. Migration pattern:

       // Before:
       console.log(`[IngestionPipeline] ${new Date().toTimeString().slice(0, 8)} GMT processing: ${item.fileName}`)

       // After:
       const log = Logger.getInstance().child('IngestionPipeline')
       log.info('processing', { fileName: item.fileName })

       Severity mapping for this file:
       - console.log with "processing", "done", "enqueued", "synced", "moved" -> info
       - console.log with "pass 2", "pass 1on1" -> debug (verbose operational detail)
       - console.warn with "schema invalido", "pass falhou", "fallback" -> warn
       - console.error with "failed to save", "failed to move", "error:" -> error

       Step 3: Migrate ClaudeRunner.ts (12 calls)

       This file has its own ts() helper. Remove it; Logger handles timestamps.

       // Before:
       console.log(`[ClaudeRunner] ${ts()} spawn: ${claudeBin} ...`)

       // After:
       log.info('spawn', { claudeBin, promptBytes: Buffer.byteLength(prompt, 'utf8'), model })

       - console.log with "spawn", "close", "retry" -> debug (low-level process detail)
       - console.log with OpenRouter status/response -> info
       - console.error with "spawn error" -> error
       - console.warn with "OpenRouter selecionado mas sem API key" -> warn

       Step 4: Migrate GeminiPreprocessor.ts (11 calls)

       Same pattern -- remove local ts() helper.

       - console.log "Iniciando", "Resposta recebida", "Sucesso" -> info
       - console.log "Texto truncado" -> debug
       - console.warn "finishReason=MAX_TOKENS", "Recovery parcial" -> warn
       - console.error "Falha ao parsear", "Erro Google AI", "Timeout" -> error

       Step 5: Migrate remaining files (15 calls)

       - src/main/index.ts (5 calls): [people:save], [ingestion:reset-person-data], [ai:test], [ai:cycle-report], [AutoUpdater]
       - src/main/ingestion/FileWatcher.ts (3 calls): [FileWatcher] prefix
       - src/main/ingestion/ProfileCompressor.ts (3 calls): [ProfileCompressor] prefix
       - src/renderer/src/views/PersonView.tsx (2 calls): Route through window.api.logs.write()
       - src/renderer/src/App.tsx (1 call): ErrorBoundary -- route through window.api.logs.write()

       Step 6: Remove ts() helper functions

       Delete the ts() function from ClaudeRunner.ts and GeminiPreprocessor.ts.

       Step 7: Replace existing logUpdaterError function

       The logUpdaterError function in index.ts (lines 627-636) writes to app.getPath('userData')/logs/updater.log. Replace with Logger.getInstance().child('AutoUpdater').error(err.message). The Logger writes to
       ~/.pulsecockpit/logs/ which consolidates everything.

       5. Semantic Review -- Specific Log Improvements Per Module

       IngestionPipeline.ts

       Missing logs (add these):
       - log.info('queue status', { queued, processing, pending, done }) -- at start of drainQueue(), gives visibility into queue health
       - log.info('pass 1 completed', { fileName, slug: principal, tipo, elapsed }) -- after Pass 1 result validation, before Pass 2 decision. Currently there is no log between "processing" and "pass 2 com perfil"
       so you cannot tell how long Pass 1 took
       - log.info('pass 2 skipped', { slug, reason }) -- when shouldRunPass2 returns false, log why (currently silent)
       - log.debug('fuzzy match attempted', { slug, result: 'no match' }) -- log failed fuzzy matches, not just successful ones
       - log.info('person lock acquired', { slug, waitMs }) -- when lock contention actually causes waiting, helps diagnose slow processing
       - log.warn('queue full, item rejected', { fileName, queueSize: MAX_QUEUE_SIZE }) -- currently logs but add structured data

       Better context (improve existing):
       - Line 153 enqueued: ${fileName} -- add { queueSize: this.queue.filter(active).length } so you can see queue depth
       - Line 974 processing: ${item.fileName} -- add { id: item.id, queuePosition } for traceability
       - Line 1148 done: ${item.fileName} → ${principal} -- add { elapsed: Date.now() - item.startedAt, tipo: item.tipo } for performance tracking
       - Line 538-545 1on1 prompt breakdown -- this is good structured data but logged as inline string concatenation. Convert to log.debug('1on1 deep pass context', { slug, artifactChars, perfilChars, configChars,
        ... })

       Severity corrections:
       - Line 92 restored ${valid.length} pending item(s) from disk -- currently console.log, should be info (correct but ensure it is not debug)
       - Line 1142 tipo forcado para 1on1 -- currently console.warn, correct severity
       - Line 264 ciclo auto-populate falhou -- currently console.warn with "(nao critico)", correct but should include the error message in structured data
       - Line 700 compressao falhou -- currently console.warn, correct
       - Line 385 sinal cerimonia aplicado -- currently console.log, should be info (it is a meaningful side-effect)

       ClaudeRunner.ts

       Missing logs:
       - log.info('provider resolved', { operation, provider, model }) -- in runWithProvider(), log which provider was selected before the call
       - log.warn('fallback to claude-cli', { operation, originalError }) -- when OpenRouter fails and fallback fires, add the operation name
       - log.debug('parseOutput strategy', { method: 'direct' | 'fence' | 'brace' | 'failed' }) -- which JSON extraction path succeeded

       Better context:
       - Line 72 spawn log -- mask the prompt content but log the byte size. Currently correct but add { attempt: 0 } for retry correlation
       - Line 98 close log -- add { attempt } for retry traceability
       - Line 186 OpenRouter log -- consider masking the API key presence (hasApiKey: true instead of nothing)

       Severity corrections:
       - Line 45 retry ... -- currently console.log, should be warn (retries indicate a problem)
       - Line 237 OpenRouter error catch -- currently console.log, should be warn or error depending on whether it is a timeout vs network error

       GeminiPreprocessor.ts

       Missing logs:
       - log.debug('preprocessing mode detected', { mode, fileName }) -- log which mode was selected
       - log.info('preprocessing complete', { originalLength, cleanedLength, reductionPercent, elapsed }) -- consolidate the success log with timing

       Severity corrections:
       - Line 156 "Resposta bruta:" -- currently console.error, correct
       - Line 129 "finishReason=MAX_TOKENS" -- currently console.warn, correct
       - Line 145 "Recovery parcial" -- currently console.warn, correct

       index.ts (IPC handlers)

       Missing logs -- this is the biggest gap. IPC handlers have almost no logging:
       - log.info('settings saved', { workspacePath, hasClaudeBin: !!s.claudeBinPath }) -- in settings:save handler. Settings changes should always be logged because they affect app behavior
       - log.info('person saved', { slug, relacao }) -- in people:save. Currently only logs when pending items are synced
       - log.info('person deleted', { slug }) -- in people:delete. Currently completely silent
       - log.info('agenda generation started', { slug, relacao }) and log.info('agenda generation completed', { slug, elapsed }) -- in ai:generate-agenda. Currently no entry/exit logging for this expensive
       operation
       - log.info('cycle report started', { slug, periodoInicio, periodoFim }) and log.info('cycle report completed', { slug, elapsed, truncatedArtifacts }) -- in ai:cycle-report
       - log.info('workspace setup', { workspacePath }) -- in settings:setup-workspace
       - log.info('action status updated', { slug, actionId, status }) -- in actions:update-status
       - log.info('ingestion reset', { slug }) -- ingestion:reset-person-data currently has a log but it should also log at warn level since it is destructive
       - log.info('app ready', { version: app.getVersion(), workspacePath }) -- in app.whenReady() callback
       - log.info('file watcher started', { workspacePath }) -- after FileWatcher initialization

       Severity corrections:
       - Line 209 resetado: ${slug} -- currently console.log, should be warn (destructive operation)
       - Line 657 [AutoUpdater] error -- currently console.error, correct

       FileWatcher.ts

       Missing logs:
       - log.info('watcher stopped') -- in stop(), currently silent
       - log.debug('file debounced', { filePath }) -- when debounce timer fires

       Better context:
       - Line 88 detected: ${filePath} -- add { extension } to see what file types are being picked up

       ProfileCompressor.ts

       Missing logs:
       - log.info('compression started', { slug, totalArtefatos, perfilSize }) -- at the start of compress()
       - log.debug('compression sections', { resumoLen, atencaoLen, conquistasLen, temasLen }) -- before sending to Claude

       Renderer files

       PersonView.tsx (lines 323, 331):
       - These are catch-block error logs. Convert to window.api.logs.write('error', 'PersonView', ...) and add the action description for context.

       App.tsx (line 22):
       - ErrorBoundary componentDidCatch. Convert to window.api.logs.write('error', 'ErrorBoundary', error.message, { stack: error.stack, componentStack: info.componentStack }).

       6. File Structure and Complete File List

       Files to CREATE:

       ┌─────────────────────────────────────┬────────────────────────────────────────────────────────────────────────────────┐
       │                File                 │                                    Purpose                                     │
       ├─────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
       │ src/main/logging/Logger.ts          │ Logger + ModuleLogger classes, file rotation, ring buffer                      │
       ├─────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
       │ src/main/logging/index.ts           │ Barrel export: export { Logger, type LogLevel, type LogEntry } from './Logger' │
       ├─────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
       │ src/renderer/src/views/LogsView.tsx │ Log viewer UI component                                                        │
       └─────────────────────────────────────┴────────────────────────────────────────────────────────────────────────────────┘

       Files to MODIFY:

       ┌──────────────────────────────────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
       ──┐
       │                   File                   │                                                                               Changes
         │
       ├──────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
       ──┤
       │ src/main/index.ts                        │ Initialize Logger, register 4 IPC handlers (log:write/recent/files/read-file), push log entries to renderer, add missing logs to IPC handlers, remove
         │
       │                                          │ logUpdaterError function
         │
       ├──────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
       ──┤
       │ src/preload/index.ts                     │ Add logs namespace to contextBridge API
         │
       ├──────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
       ──┤
       │ src/renderer/src/types/global.d.ts       │ Add logs types to Window.api, add LogEntry/LogLevel interfaces
         │
       ├──────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
       ──┤
       │ src/renderer/src/router.tsx              │ Add 'logs' to ViewName union
         │
       ├──────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
       ──┤
       │ src/renderer/src/App.tsx                 │ Add LogsView import and route case, convert ErrorBoundary console.error
         │
       ├──────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
       ──┤
       │ src/renderer/src/components/Sidebar.tsx  │ Add "Logs" nav item with icon
         │
       ├──────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
       ──┤
       │ src/main/ingestion/IngestionPipeline.ts  │ Replace 53 console.* calls with Logger, add ~6 new strategic logs
         │
       ├──────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
       ──┤
       │ src/main/ingestion/ClaudeRunner.ts       │ Replace 12 console.* calls with Logger, delete ts() helper, add ~3 new logs
         │
       ├──────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
       ──┤
       │ src/main/ingestion/GeminiPreprocessor.ts │ Replace 11 console.* calls with Logger, delete ts() helper
         │
       ├──────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
       ──┤
       │ src/main/ingestion/FileWatcher.ts        │ Replace 3 console.* calls with Logger, add 2 new logs
         │
       ├──────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
       ──┤
       │ src/main/ingestion/ProfileCompressor.ts  │ Replace 3 console.* calls with Logger, add 2 new logs
         │
       ├──────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
       ──┤
       │ src/renderer/src/views/PersonView.tsx    │ Replace 2 console.error calls with window.api.logs.write()
         │
       ├──────────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
       ──┤
       │ src/renderer/src/types/ipc.ts            │ Add LogEntry and LogLevel type exports (shared types)
         │
       └──────────────────────────────────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
       ──┘

       Implementation order:

       1. src/main/logging/Logger.ts + index.ts -- the foundation
       2. src/main/index.ts -- initialize Logger, IPC handlers
       3. src/preload/index.ts + src/renderer/src/types/global.d.ts + src/renderer/src/types/ipc.ts -- IPC bridge
       4. Migrate IngestionPipeline.ts (biggest file, highest impact)
       5. Migrate ClaudeRunner.ts + GeminiPreprocessor.ts (related, similar patterns)
       6. Migrate remaining 4 files (FileWatcher.ts, ProfileCompressor.ts, index.ts IPC handlers, renderer files)
       7. src/renderer/src/views/LogsView.tsx + router/sidebar changes -- the viewer
       8. Delete ts() helpers, remove logUpdaterError function

       Total estimated changes: ~3 new files, ~13 modified files. The Logger module itself should be under 200 lines. The LogsView component should be 200-300 lines (comparable to other views in the project). Each
       migration is a mechanical find-and-replace within a single file.

       Critical Files for Implementation

       - /Users/guilhermeaugusto/Documents/workspace-projects/pulse-cockpit/src/main/logging/Logger.ts (new -- core Logger class)
       - /Users/guilhermeaugusto/Documents/workspace-projects/pulse-cockpit/src/main/index.ts (Logger init, IPC handlers, biggest integration point)
       - /Users/guilhermeaugusto/Documents/workspace-projects/pulse-cockpit/src/main/ingestion/IngestionPipeline.ts (53 calls to migrate, heaviest file)
       - /Users/guilhermeaugusto/Documents/workspace-projects/pulse-cockpit/src/preload/index.ts (IPC bridge for renderer)
       - /Users/guilhermeaugusto/Documents/workspace-projects/pulse-cockpit/src/renderer/src/views/LogsView.tsx (new -- log viewer UI)
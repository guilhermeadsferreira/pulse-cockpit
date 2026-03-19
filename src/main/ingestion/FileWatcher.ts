import chokidar, { type FSWatcher } from 'chokidar'
import { join } from 'path'
import { IngestionPipeline } from './IngestionPipeline'

const SUPPORTED_EXTENSIONS = ['.md', '.txt', '.pdf']
const DEBOUNCE_MS = 1_000 // 1 second debounce per path

export class FileWatcher {
  private watcher:  FSWatcher | null = null
  private pipeline: IngestionPipeline
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

  constructor(private workspacePath: string) {
    this.pipeline = new IngestionPipeline(workspacePath)
  }

  getQueue() {
    return this.pipeline.getQueue()
  }

  start(): void {
    if (this.watcher) return

    const inboxPath = join(this.workspacePath, 'inbox')
    console.log(`[FileWatcher] watching: ${inboxPath}`)

    this.watcher = chokidar.watch(inboxPath, {
      ignored:       [/^\.|\.(tmp|bak)$/, '**/processados/**'],
      persistent:    true,
      ignoreInitial: false,          // pick up files already in inbox on startup
      awaitWriteFinish: {
        stabilityThreshold: 2_000,   // wait 2s of no writes before triggering
        pollInterval:        100,
      },
    })

    this.watcher
      .on('add',    (filePath) => this.handleFile(filePath))
      .on('change', (filePath) => this.handleFile(filePath))
      .on('error',  (error)    => console.error('[FileWatcher] error:', error))
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer)
    }
    this.debounceTimers.clear()
  }

  // Manually enqueue a file (e.g. when user drags to inbox via the UI)
  enqueue(filePath: string): void {
    this.pipeline.enqueue(filePath)
  }

  // Re-process pending items when a person is registered
  reprocessPending(slug: string): Promise<number> {
    return this.pipeline.syncPending(slug)
  }

  private handleFile(filePath: string): void {
    const lower = filePath.toLowerCase()
    if (!SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext))) return

    console.log(`[FileWatcher] detected: ${filePath}`)

    // Debounce per path to avoid double-processing on macOS events
    const existing = this.debounceTimers.get(filePath)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath)
      this.pipeline.enqueue(filePath)
    }, DEBOUNCE_MS)

    this.debounceTimers.set(filePath, timer)
  }
}

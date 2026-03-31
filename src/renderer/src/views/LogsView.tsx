import { useState, useEffect, useRef, useCallback } from 'react'
import type { LogEntry, LogLevel } from '../types/ipc'

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: 'text-gray-400',
  info:  'text-white',
  warn:  'text-yellow-400',
  error: 'text-red-400',
}

const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info:  'INFO',
  warn:  'WARN',
  error: 'ERROR',
}

function formatTime(timestamp: string): string {
  try {
    const d = new Date(timestamp)
    return d.toTimeString().slice(0, 12)
  } catch {
    return timestamp
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

export default function LogsView() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [files, setFiles] = useState<Array<{ name: string; size: number; date: string }>>([])
  const [levelFilter, setLevelFilter] = useState<Set<LogLevel>>(new Set(['info', 'warn', 'error']))
  const [moduleFilter, setModuleFilter] = useState<string>('')
  const [searchText, setSearchText] = useState<string>('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [modules, setModules] = useState<string[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const userScrolled = useRef(false)

  useEffect(() => {
    async function loadInitial() {
      const [recentLogs, logFiles] = await Promise.all([
        window.api.logs.recent({ limit: 500 }),
        window.api.logs.files(),
      ])
      setLogs(recentLogs)
      setFiles(logFiles)
      const uniqueModules = [...new Set(recentLogs.map(l => l.module))].sort()
      setModules(uniqueModules)
    }
    loadInitial()
  }, [])

  useEffect(() => {
    window.api.logs.onEntry((entry: unknown) => {
      const e = entry as LogEntry
      setLogs(prev => {
        const next = [...prev, e]
        if (next.length > 2000) next.shift()
        return next
      })
      setModules(prev => prev.includes(e.module) ? prev : [...prev, e.module].sort())
    })
    return () => window.api.logs.removeListeners()
  }, [])

  useEffect(() => {
    if (autoScroll && !userScrolled.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll])

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const atBottom = scrollHeight - scrollTop - clientHeight < 50
    if (!atBottom) {
      userScrolled.current = true
      setAutoScroll(false)
    } else {
      userScrolled.current = false
      setAutoScroll(true)
    }
  }, [])

  const toggleLevel = (level: LogLevel) => {
    setLevelFilter(prev => {
      const next = new Set(prev)
      if (next.has(level)) {
        if (next.size > 1) next.delete(level)
      } else {
        next.add(level)
      }
      return next
    })
  }

  const openTodayLog = async () => {
    const today = new Date().toISOString().slice(0, 10)
    const todayFile = `pulse-${today}.log`
    const found = files.find(f => f.name === todayFile)
    if (found) {
      const logDir = await window.api.settings.load()
    }
  }

  const filteredLogs = logs.filter(log => {
    if (!levelFilter.has(log.level)) return false
    if (moduleFilter && log.module !== moduleFilter) return false
    if (searchText && !log.message.toLowerCase().includes(searchText.toLowerCase())) return false
    return true
  })

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 px-4 py-3 border-b border-white/10">
        <h1 className="text-lg font-semibold text-white">Logs</h1>
        <div className="flex items-center gap-2 ml-auto">
          {(['debug', 'info', 'warn', 'error'] as LogLevel[]).map(level => (
            <button
              key={level}
              onClick={() => toggleLevel(level)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                levelFilter.has(level)
                  ? `${LEVEL_COLORS[level]} bg-white/10`
                  : 'text-gray-500 bg-transparent'
              }`}
            >
              {LEVEL_LABELS[level]}
            </button>
          ))}
        </div>
        <select
          value={moduleFilter}
          onChange={e => setModuleFilter(e.target.value)}
          className="bg-white/10 text-white text-sm px-2 py-1 rounded border border-white/10"
        >
          <option value="">All modules</option>
          {modules.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <input
          type="text"
          placeholder="Search..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          className="bg-white/10 text-white text-sm px-3 py-1 rounded border border-white/10 w-48"
        />
        <button
          onClick={() => setAutoScroll(a => !a)}
          className={`px-3 py-1 text-xs rounded transition-colors ${
            autoScroll ? 'bg-green-600 text-white' : 'bg-white/10 text-gray-400'
          }`}
        >
          Auto-scroll
        </button>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-2 font-mono text-sm"
      >
        {filteredLogs.map((entry, i) => (
          <div key={i} className="flex gap-3 py-1 border-b border-white/5 hover:bg-white/5">
            <span className="text-gray-500 text-xs shrink-0">{formatTime(entry.timestamp)}</span>
            <span className={`text-xs font-bold shrink-0 w-12 ${LEVEL_COLORS[entry.level]}`}>
              {LEVEL_LABELS[entry.level]}
            </span>
            <span className="text-blue-400 text-xs shrink-0 w-36 truncate">{entry.module}</span>
            <span className="text-gray-200">{entry.message}</span>
            {entry.data && (
              <span className="text-gray-500 text-xs">{JSON.stringify(entry.data)}</span>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-white/10 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="font-semibold text-white">Arquivos:</span>
          {files.slice(0, 5).map(f => (
            <span key={f.name} className="flex items-center gap-1">
              <span>{f.name}</span>
              <span className="text-gray-500">({formatSize(f.size)})</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

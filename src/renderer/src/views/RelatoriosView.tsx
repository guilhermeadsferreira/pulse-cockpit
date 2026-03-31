import { useState, useEffect } from 'react'
import { RefreshCw, FileText, Loader2, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react'
import { MarkdownPreview } from '../components/MarkdownPreview'

interface ReportMeta {
  name: string
  date: string
  size: number
}

export function RelatoriosView() {
  const [reports, setReports] = useState<ReportMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  async function loadReports() {
    setLoading(true)
    try {
      const list = await window.api.external.listReports()
      setReports(list)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadReports() }, [])

  async function handleRefreshDaily() {
    setRefreshing(true)
    try {
      await window.api.external.refreshDaily()
      await loadReports()
    } finally {
      setRefreshing(false)
    }
  }

  async function togglePreview(name: string) {
    if (expanded === name) {
      setExpanded(null)
      setPreview(null)
      return
    }
    setExpanded(name)
    setPreviewLoading(true)
    try {
      const content = await window.api.external.getReport(name)
      setPreview(content)
    } finally {
      setPreviewLoading(false)
    }
  }

  const dailyReports = reports.filter(r => r.name.startsWith('daily_'))
  const sprintReports = reports.filter(r => r.name.startsWith('sprint_'))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '28px 40px 22px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--font)',
            fontSize: 24, fontWeight: 700,
            color: 'var(--text-primary)', letterSpacing: '-0.025em', lineHeight: 1.1,
          }}>
            Relatórios
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            {reports.length} relatório{reports.length !== 1 ? 's' : ''} gerado{reports.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={handleRefreshDaily}
          disabled={refreshing}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 6, border: 'none',
            background: 'var(--accent)', color: '#09090c',
            fontSize: 13, fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer',
          }}
        >
          {refreshing
            ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Atualizando…</>
            : <><RefreshCw size={12} /> Atualizar Agora</>}
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 40px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
            <div>Carregando relatórios…</div>
          </div>
        ) : reports.length === 0 ? (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
            padding: '48px 32px', textAlign: 'center',
          }}>
            <div style={{ color: 'var(--text-muted)', marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
              <FileText size={28} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Nenhum relatório gerado
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Clique em "Atualizar Agora" para gerar o primeiro daily report.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Daily Reports */}
            {dailyReports.length > 0 && (
              <ReportSection
                title="Daily Reports"
                reports={dailyReports}
                expanded={expanded}
                preview={preview}
                previewLoading={previewLoading}
                onToggle={togglePreview}
              />
            )}

            {/* Sprint Reports */}
            {sprintReports.length > 0 && (
              <ReportSection
                title="Sprint Reports"
                reports={sprintReports}
                expanded={expanded}
                preview={preview}
                previewLoading={previewLoading}
                onToggle={togglePreview}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ReportSection({
  title,
  reports,
  expanded,
  preview,
  previewLoading,
  onToggle,
}: {
  title: string
  reports: ReportMeta[]
  expanded: string | null
  preview: string | null
  previewLoading: boolean
  onToggle: (name: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div>
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 11, fontWeight: 600, letterSpacing: '0.1em',
          textTransform: 'uppercase' as const, color: 'var(--text-muted)',
          fontFamily: 'var(--font)',
        }}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        {title} ({reports.length})
      </button>
      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
          {reports.map((r) => (
            <ReportCard
              key={r.name}
              report={r}
              isExpanded={expanded === r.name}
              preview={expanded === r.name ? preview : null}
              previewLoading={expanded === r.name && previewLoading}
              onToggle={() => onToggle(r.name)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ReportCard({
  report: r,
  isExpanded,
  preview,
  previewLoading,
  onToggle,
}: {
  report: ReportMeta
  isExpanded: boolean
  preview: string | null
  previewLoading: boolean
  onToggle: () => void
}) {
  const isSprint = r.name.startsWith('sprint_')
  const label = isSprint
    ? r.name.replace('sprint_', '').replace('.md', '').replace(/-/g, ' ')
    : r.name.replace('daily_', '').replace('.md', '')

  const isToday = r.date === new Date().toISOString().slice(0, 10)

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 6, overflow: 'hidden',
    }}>
      <div
        onClick={onToggle}
        style={{
          padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 12,
          cursor: 'pointer',
          background: isExpanded ? 'var(--surface-2)' : 'transparent',
          transition: 'background 0.12s',
        }}
      >
        <FileText size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)', flex: 1 }}>
          {label}
        </span>
        {isToday && (
          <span style={{
            fontSize: 9, fontWeight: 600, letterSpacing: '0.06em',
            padding: '2px 6px', borderRadius: 20,
            background: 'var(--accent-dim)', border: '1px solid rgba(192,135,58,0.3)',
            color: 'var(--accent)', whiteSpace: 'nowrap',
          }}>
            HOJE
          </span>
        )}
        {isSprint && (
          <span style={{
            fontSize: 9, fontWeight: 600, letterSpacing: '0.06em',
            padding: '2px 6px', borderRadius: 20,
            background: 'var(--surface-3)', border: '1px solid var(--border)',
            color: 'var(--text-muted)', whiteSpace: 'nowrap',
          }}>
            SPRINT
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {r.date}
        </span>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
          {previewLoading && <Loader2 size={12} style={{ color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />}
          <span style={{
            fontSize: 10, color: 'var(--text-muted)',
            transform: isExpanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s', display: 'flex',
          }}>▾</span>
        </div>
      </div>
      {isExpanded && preview !== null && (
        <div style={{ padding: '16px 18px', borderTop: '1px solid var(--border-subtle)' }}>
          <MarkdownPreview content={preview} maxHeight={560} />
        </div>
      )}
    </div>
  )
}

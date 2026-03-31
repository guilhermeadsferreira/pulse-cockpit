import { useState } from 'react'
import { RefreshCw, Loader2, AlertCircle, AlertTriangle, Info, CheckCircle } from 'lucide-react'

interface AuditFinding {
  category: string
  check: string
  severity: 'critical' | 'warning' | 'info' | 'ok'
  message: string
  personSlug?: string
  suggestion?: string
}

interface AuditReport {
  timestamp: string
  totalPeople: number
  findings: AuditFinding[]
  score: number
  summary: { critical: number; warning: number; info: number; ok: number }
}

const SEVERITY_CONFIG = {
  critical: { icon: AlertCircle, color: 'var(--red)', bg: 'rgba(184,64,64,0.08)', border: 'rgba(184,64,64,0.25)', label: 'Crítico' },
  warning:  { icon: AlertTriangle, color: '#e8873a', bg: 'rgba(232,135,58,0.08)', border: 'rgba(232,135,58,0.25)', label: 'Atenção' },
  info:     { icon: Info, color: 'var(--text-secondary)', bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.08)', label: 'Info' },
  ok:       { icon: CheckCircle, color: 'var(--green)', bg: 'rgba(40,140,80,0.08)', border: 'rgba(40,140,80,0.25)', label: 'OK' },
} as const

const CATEGORY_LABELS: Record<string, string> = {
  'feedback-loop': 'Loops de Retroalimentação',
  'freshness': 'Dados Frescos',
  'consistency': 'Consistência',
  'data-silos': 'Silos de Dados',
  'external': 'Integração Externa',
  'actions': 'Saúde das Ações',
  'pdi': 'PDI',
}

export function AuditView() {
  const [report, setReport] = useState<AuditReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all')

  async function runAudit() {
    setLoading(true)
    try {
      const result = await window.api.audit.run()
      if (result && !('error' in result)) {
        setReport(result as AuditReport)
      }
    } finally {
      setLoading(false)
    }
  }

  const filtered = report?.findings.filter((f) =>
    filter === 'all' ? f.severity !== 'ok' : f.severity === filter
  ) ?? []

  const grouped = filtered.reduce<Record<string, AuditFinding[]>>((acc, f) => {
    acc[f.category] = acc[f.category] || []
    acc[f.category].push(f)
    return acc
  }, {})

  return (
    <div style={{ padding: '28px 40px', maxWidth: 900, overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
            Curadoria do Sistema
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>
            Auditoria de Saúde
          </h1>
        </div>
        <button
          onClick={runAudit}
          disabled={loading}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 6, border: 'none',
            background: 'var(--accent)', color: '#09090c',
            fontSize: 13, fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
            fontFamily: 'var(--font)',
          }}
        >
          {loading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />}
          {loading ? 'Auditando…' : report ? 'Re-auditar' : 'Executar Auditoria'}
        </button>
      </div>

      {!report && !loading && (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          color: 'var(--text-muted)', fontSize: 13,
        }}>
          Clique em "Executar Auditoria" para verificar a saúde dos loops de retroalimentação,
          freshness dos dados, consistência e silos.
        </div>
      )}

      {report && (
        <>
          {/* Score card */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 12, marginBottom: 24,
          }}>
            <ScoreCard label="Score" value={`${report.score}/100`} color={report.score >= 70 ? 'var(--green)' : report.score >= 40 ? '#e8873a' : 'var(--red)'} large />
            <ScoreCard label="Críticos" value={String(report.summary.critical)} color="var(--red)" onClick={() => setFilter(filter === 'critical' ? 'all' : 'critical')} active={filter === 'critical'} />
            <ScoreCard label="Atenção" value={String(report.summary.warning)} color="#e8873a" onClick={() => setFilter(filter === 'warning' ? 'all' : 'warning')} active={filter === 'warning'} />
            <ScoreCard label="Info" value={String(report.summary.info)} color="var(--text-secondary)" onClick={() => setFilter(filter === 'info' ? 'all' : 'info')} active={filter === 'info'} />
            <ScoreCard label="Pessoas" value={String(report.totalPeople)} color="var(--text-primary)" />
          </div>

          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>
            Auditado em {new Date(report.timestamp).toLocaleString('pt-BR')} · {report.findings.length} verificações
          </p>

          {/* Findings by category */}
          {Object.entries(grouped).map(([category, findings]) => (
            <div key={category} style={{ marginBottom: 20 }}>
              <h3 style={{
                fontSize: 13, fontWeight: 700, color: 'var(--text-primary)',
                marginBottom: 8, letterSpacing: '-0.01em',
              }}>
                {CATEGORY_LABELS[category] || category}
              </h3>
              {findings.map((f, i) => {
                const cfg = SEVERITY_CONFIG[f.severity]
                const Icon = cfg.icon
                return (
                  <div key={i} style={{
                    padding: '10px 14px', marginBottom: 6,
                    background: cfg.bg, border: `1px solid ${cfg.border}`,
                    borderRadius: 6, display: 'flex', gap: 10, alignItems: 'flex-start',
                  }}>
                    <Icon size={14} color={cfg.color} style={{ marginTop: 2, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5, margin: 0 }}>
                        {f.message}
                      </p>
                      {f.suggestion && (
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, margin: 0 }}>
                          {f.suggestion}
                        </p>
                      )}
                    </div>
                    <span style={{
                      fontSize: 9.5, fontWeight: 600, padding: '2px 6px', borderRadius: 3,
                      background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color,
                      whiteSpace: 'nowrap', flexShrink: 0,
                    }}>
                      {cfg.label}
                    </span>
                  </div>
                )
              })}
            </div>
          ))}

          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--green)', fontSize: 13 }}>
              {filter === 'all' ? 'Nenhum problema encontrado!' : `Nenhum finding "${filter}" encontrado.`}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ScoreCard({ label, value, color, large, onClick, active }: {
  label: string; value: string; color: string; large?: boolean; onClick?: () => void; active?: boolean
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: large ? '16px 14px' : '12px 14px',
        background: active ? 'rgba(255,255,255,0.06)' : 'var(--surface-2)',
        border: `1px solid ${active ? color : 'var(--border)'}`,
        borderRadius: 6, textAlign: 'center',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.12s',
      }}
    >
      <p style={{ fontSize: large ? 28 : 22, fontWeight: 700, color, margin: 0, fontFamily: 'var(--font-mono)' }}>
        {value}
      </p>
      <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </p>
    </div>
  )
}

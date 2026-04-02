import { useState, useEffect } from 'react'
import { RefreshCw, Loader2, Wrench } from 'lucide-react'
import { useRouter } from '../router'
import type { SupportBoardSnapshot } from '../types/ipc'

export function SustentacaoView() {
  const { navigate } = useRouter()
  const [snapshot, setSnapshot] = useState<SupportBoardSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const data = await window.api.sustentacao.getData()
        setSnapshot(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar dados')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  async function handleRefresh() {
    setRefreshing(true)
    setError(null)
    try {
      const data = await window.api.sustentacao.refresh()
      setSnapshot(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar')
    } finally {
      setRefreshing(false)
    }
  }

  async function handleAnalyze() {
    if (loading || refreshing || analyzing) return
    setAnalyzing(true)
    setAnalysisResult(null)
    setError(null)
    try {
      const result = await window.api.sustentacao.runAnalysis()
      setAnalysisResult(result?.analysis ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao analisar')
    } finally {
      setAnalyzing(false)
    }
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', flexDirection: 'column', gap: 12,
        color: 'var(--text-muted)', fontFamily: 'var(--font)',
      }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        <div style={{ fontSize: 14 }}>Carregando dados de sustentação...</div>
      </div>
    )
  }

  if (snapshot === null) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', padding: 40,
      }}>
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '48px 40px', textAlign: 'center', maxWidth: 440,
        }}>
          <div style={{
            display: 'flex', justifyContent: 'center', marginBottom: 16,
            color: 'var(--text-muted)',
          }}>
            <Wrench size={32} />
          </div>
          <div style={{
            fontSize: 16, fontWeight: 600, color: 'var(--text-primary)',
            marginBottom: 8, fontFamily: 'var(--font)',
          }}>
            Board de Sustentação não configurado
          </div>
          <div style={{
            fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: 24,
          }}>
            Configure o Project Key e Board ID nas Settings para visualizar dados do board de suporte.
          </div>
          <button
            onClick={() => navigate('settings')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 18px', borderRadius: 6, border: 'none',
              background: 'var(--accent)', color: '#09090c',
              fontSize: 13, fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer',
            }}
          >
            Abrir Settings
          </button>
        </div>
      </div>
    )
  }

  const breachCount = snapshot.ticketsEmBreach.length

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
            Sustentação
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            Atualizado: {new Date(snapshot.atualizadoEm).toLocaleString('pt-BR')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleAnalyze}
            disabled={loading || refreshing || analyzing}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text-secondary)',
              fontSize: 13, fontFamily: 'var(--font)', fontWeight: 600,
              cursor: loading || refreshing || analyzing ? 'not-allowed' : 'pointer',
              opacity: loading || refreshing || analyzing ? 0.5 : 1,
            }}
          >
            {analyzing
              ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Analisando…</>
              : 'Analisar'}
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 6, border: 'none',
              background: 'var(--accent)', color: '#09090c',
              fontSize: 13, fontFamily: 'var(--font)', fontWeight: 600,
              cursor: refreshing ? 'not-allowed' : 'pointer',
            }}
          >
            {refreshing
              ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Atualizando…</>
              : <><RefreshCw size={12} /> Atualizar</>}
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          margin: '0 40px 0',
          padding: '10px 14px', borderRadius: 6, fontSize: 12.5,
          color: 'var(--red)', background: 'var(--red-dim)',
          border: '1px solid rgba(184,64,64,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--red)', fontSize: 16, lineHeight: 1, padding: 0,
            }}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 40px' }}>
        {/* Métricas sumárias */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
          <MetricCard label="Tickets Abertos" value={snapshot.ticketsAbertos} />
          <MetricCard label="Fechados (30d)" value={snapshot.ticketsFechadosUltimos30d} />
          <MetricCard
            label="Em Breach de SLA"
            value={breachCount}
            highlight={breachCount > 0}
          />
        </div>

        {/* Análise de IA */}
        {analysisResult && (
          <Section title="Análise de IA">
            <div style={{
              fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65,
              whiteSpace: 'pre-wrap', fontFamily: 'var(--font)',
            }}>
              {analysisResult}
            </div>
          </Section>
        )}

        {/* Distribuição por Tipo */}
        {snapshot.topTipos.length > 0 && (
          <Section title="Distribuição por Tipo">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {snapshot.topTipos.map((item) => (
                <span key={item.tipo} style={{
                  padding: '4px 10px', borderRadius: 20,
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  fontSize: 12.5, color: 'var(--text-secondary)',
                  fontFamily: 'var(--font)',
                }}>
                  {item.tipo}: <strong style={{ color: 'var(--text-primary)' }}>{item.count}</strong>
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Tickets em Breach */}
        <Section title="Tickets em Breach de SLA">
          {snapshot.ticketsEmBreach.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>
              Nenhum ticket em breach de SLA.
            </div>
          ) : (
            <div style={{
              border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden',
            }}>
              {/* Table header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '100px 1fr 120px 140px 90px',
                gap: 0,
                padding: '8px 16px',
                background: 'var(--surface-2)',
                borderBottom: '1px solid var(--border-subtle)',
                fontSize: 11, fontWeight: 600, letterSpacing: '0.07em',
                textTransform: 'uppercase' as const,
                color: 'var(--text-muted)',
              }}>
                <span>Key</span>
                <span>Summary</span>
                <span>Tipo</span>
                <span>Assignee</span>
                <span style={{ textAlign: 'right' }}>Idade (d)</span>
              </div>
              {/* Rows */}
              {snapshot.ticketsEmBreach.map((ticket, idx) => (
                <div
                  key={ticket.key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '100px 1fr 120px 140px 90px',
                    gap: 0,
                    padding: '10px 16px',
                    background: idx % 2 === 0
                      ? 'rgba(184, 64, 64, 0.04)'
                      : 'rgba(184, 64, 64, 0.02)',
                    borderBottom: idx < snapshot.ticketsEmBreach.length - 1
                      ? '1px solid var(--border-subtle)'
                      : 'none',
                    fontSize: 12.5,
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                    {ticket.key}
                  </span>
                  <span style={{
                    color: 'var(--text-secondary)', overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    paddingRight: 12,
                  }}>
                    {ticket.summary.length > 60
                      ? ticket.summary.slice(0, 60) + '…'
                      : ticket.summary}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>{ticket.type}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{ticket.assignee ?? '—'}</span>
                  <span style={{
                    textAlign: 'right', fontWeight: 600,
                    color: 'var(--red)', fontFamily: 'var(--font-mono)',
                  }}>
                    {ticket.ageDias}d
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Por Assignee */}
        {Object.keys(snapshot.porAssignee).length > 0 && (
          <Section title="Por Assignee">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {Object.entries(snapshot.porAssignee)
                .sort((a, b) => b[1] - a[1])
                .map(([assignee, count]) => (
                  <div key={assignee} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '6px 0',
                  }}>
                    <span style={{
                      fontSize: 13, color: 'var(--text-secondary)',
                      minWidth: 120,
                    }}>
                      {assignee}
                    </span>
                    <div style={{
                      flex: 1, height: 6, borderRadius: 3,
                      background: 'var(--surface-2)', overflow: 'hidden',
                      maxWidth: 200,
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.min(100, (count / snapshot.ticketsAbertos) * 100)}%`,
                        background: 'var(--accent)',
                        borderRadius: 3,
                      }} />
                    </div>
                    <span style={{
                      fontSize: 12.5, color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {count} ticket{count !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  highlight,
}: {
  label: string
  value: number
  highlight?: boolean
}) {
  return (
    <div style={{
      flex: 1, padding: '16px 20px',
      background: 'var(--surface)', border: `1px solid ${highlight ? 'rgba(184,64,64,0.3)' : 'var(--border)'}`,
      borderRadius: 8,
      background: highlight ? 'rgba(184,64,64,0.04)' : 'var(--surface)',
    } as React.CSSProperties}>
      <div style={{
        fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
        textTransform: 'uppercase' as const, color: 'var(--text-muted)',
        marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 28, fontWeight: 700, lineHeight: 1,
        color: highlight ? 'var(--red)' : 'var(--text-primary)',
        fontFamily: 'var(--font)',
      }}>
        {value}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, letterSpacing: '0.1em',
        textTransform: 'uppercase' as const, color: 'var(--text-muted)',
        marginBottom: 12, paddingBottom: 8,
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

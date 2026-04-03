import { useState, useEffect } from 'react'
import { RefreshCw, Loader2, Wrench, AlertTriangle, AlertCircle } from 'lucide-react'
import { useRouter } from '../router'
import type { SupportBoardSnapshot, SustentacaoHistoryEntry, InOutSemanalEntry, RecorrenteDetectado, SustentacaoAlerta, BlockerCategory } from '../types/ipc'

/** Retorna delta absoluto vs snapshot de ~7 dias atrás. null se não há referência. */
function getDelta(
  current: number,
  history: SustentacaoHistoryEntry[],
  field: keyof Pick<SustentacaoHistoryEntry, 'ticketsAbertos' | 'ticketsFechadosUltimos30d' | 'breachCount'>
): number | null {
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
  const ref = history
    .filter((e) => e.fetchedAt <= Date.now() - sevenDaysMs)
    .sort((a, b) => b.fetchedAt - a.fetchedAt)[0]
  if (!ref) return null
  return current - (ref[field] as number)
}

/** Formata delta para exibição: "↑ 3", "↓ 2", "=" */
function formatDelta(delta: number | null): string {
  if (delta === null) return '—'
  if (delta === 0) return '='
  return delta > 0 ? `↑ ${delta}` : `↓ ${Math.abs(delta)}`
}

/** Cor do delta baseada no campo e direção. Para breach: subir é ruim. Para fechados: subir é bom. */
function deltaColor(delta: number | null, higherIsBad = false): string {
  if (delta === null || delta === 0) return 'var(--text-muted)'
  const isPositive = delta > 0
  const isGood = higherIsBad ? !isPositive : isPositive
  return isGood ? 'var(--accent)' : 'var(--red)'
}

/** Constrói array de pontos para um campo do histórico (últimos N dias). */
function buildChartPoints(
  history: SustentacaoHistoryEntry[],
  field: keyof Pick<SustentacaoHistoryEntry, 'breachCount' | 'complianceRate7d' | 'complianceRate30d'>
): number[] {
  return history
    .slice(-30)
    .map((e) => (e[field] as number | null) ?? 0)
}

function MiniLineChart({
  points,
  width = 180,
  height = 36,
  color = 'var(--accent)',
}: {
  points: number[]
  width?: number
  height?: number
  color?: string
}) {
  if (points.length < 2) return null
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1

  const coords = points.map((v, i) => {
    const x = (i / (points.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2 // 2px padding top/bottom
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  return (
    <svg width={width} height={height} style={{ overflow: 'visible', display: 'block' }}>
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Gráfico de barras in/out semanal com SVG inline.
 * Barras azuis (accent) = in, barras mais claras (text-muted) = out.
 */
const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function formatWeekLabel(semana: string): string {
  const d = new Date(semana + 'T00:00:00')
  return `${d.getDate()}/${MESES_PT[d.getMonth()]}`
}

function InOutBarChart({
  entries,
  width = 420,
  height = 60,
}: {
  entries: InOutSemanalEntry[]
  width?: number
  height?: number
}) {
  if (entries.length === 0) return null
  const maxVal = Math.max(...entries.flatMap((e) => [e.in, e.out]), 1)
  const labelHeight = 14
  const chartHeight = height
  const totalHeight = chartHeight + labelHeight
  const barGroupWidth = width / entries.length
  const barWidth = Math.max(4, barGroupWidth * 0.35)
  const gap = 2
  const showAllLabels = entries.length <= 5

  return (
    <svg width={width} height={totalHeight} style={{ overflow: 'visible', display: 'block' }}>
      {entries.map((entry, i) => {
        const cx = (i / entries.length) * width + barGroupWidth / 2
        const inH = Math.max(2, (entry.in / maxVal) * (chartHeight - 4))
        const outH = Math.max(2, (entry.out / maxVal) * (chartHeight - 4))
        const showLabel = showAllLabels || i % 2 === 0 || i === entries.length - 1
        return (
          <g key={entry.semana}>
            <rect
              x={cx - barWidth - gap / 2}
              y={chartHeight - inH}
              width={barWidth}
              height={inH}
              fill="var(--accent)"
              opacity={0.85}
              rx={1}
            />
            <rect
              x={cx + gap / 2}
              y={chartHeight - outH}
              width={barWidth}
              height={outH}
              fill="var(--text-muted)"
              opacity={0.6}
              rx={1}
            />
            {showLabel && (
              <text
                x={cx}
                y={chartHeight + labelHeight}
                textAnchor="middle"
                fontSize={9}
                fill="var(--text-muted)"
                fontFamily="var(--font)"
              >
                {formatWeekLabel(entry.semana)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/** Formata data relativa curta: "3d atrás", "2h atrás" */
function formatRelativeDate(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime()
  const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDias > 0) return `${diffDias}d atrás`
  const diffHoras = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffHoras > 0) return `${diffHoras}h atrás`
  return 'agora'
}

const BLOCKER_COLORS: Record<BlockerCategory, { bg: string; text: string; label: string }> = {
  fornecedor_externo: { bg: 'rgba(220,38,38,0.15)', text: '#ef4444', label: 'Fornecedor' },
  dev:               { bg: 'rgba(59,130,246,0.15)', text: '#3b82f6', label: 'Dev' },
  cliente:           { bg: 'rgba(234,179,8,0.15)',   text: '#eab308', label: 'Cliente' },
  produto:           { bg: 'rgba(168,85,247,0.15)',  text: '#a855f7', label: 'Produto' },
  deploy:            { bg: 'rgba(249,115,22,0.15)',   text: '#f97316', label: 'Deploy' },
  desconhecido:      { bg: 'rgba(107,114,128,0.15)', text: '#6b7280', label: '?' },
}

const RISK_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
}

function BlockerBadge({ category }: { category: BlockerCategory }) {
  const style = BLOCKER_COLORS[category]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '1px 7px', borderRadius: 4,
      fontSize: 10.5, fontWeight: 600,
      background: style.bg, color: style.text,
      letterSpacing: '0.02em',
    }}>
      {style.label}
    </span>
  )
}

function RiskDot({ level }: { level: string }) {
  return (
    <span style={{
      display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
      background: RISK_COLORS[level] ?? RISK_COLORS.medium,
      flexShrink: 0,
    }} title={`Risco: ${level}`} />
  )
}

function AlertasBanner({ alertas }: { alertas: SustentacaoAlerta[] }) {
  if (alertas.length === 0) return null

  const sorted = [...alertas].sort((a, b) => {
    // critico primeiro
    if (a.severidade === 'critico' && b.severidade !== 'critico') return -1
    if (b.severidade === 'critico' && a.severidade !== 'critico') return 1
    return 0
  })

  return (
    <div style={{
      margin: '0 40px 16px',
      background: 'var(--red-dim)',
      border: '1px solid rgba(184,64,64,0.25)',
      borderRadius: 8,
      padding: '12px 16px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 12.5, fontWeight: 600,
        color: 'var(--red)',
        marginBottom: sorted.length > 0 ? 8 : 0,
        fontFamily: 'var(--font)',
      }}>
        <AlertTriangle size={13} />
        {sorted.length === 1 ? '1 alerta ativo' : `${sorted.length} alertas ativos`}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sorted.map((alerta, i) => (
          <div key={i} style={{
            display: 'flex', flexDirection: 'column', gap: 2,
            fontSize: 12.5, color: 'var(--text-secondary)',
            lineHeight: 1.45,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              {alerta.severidade === 'critico'
                ? <AlertCircle size={12} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 2 }} />
                : <AlertTriangle size={12} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
              }
              <div style={{ flex: 1 }}>
                {alerta.summary ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600 }}>
                        {alerta.jiraUrl ? (
                          <a
                            href="#"
                            onClick={(e) => { e.preventDefault(); window.open(alerta.jiraUrl, '_blank') }}
                            style={{ color: 'var(--text-secondary)', textDecoration: 'underline' }}
                          >
                            {alerta.ticketKey}
                          </a>
                        ) : (
                          alerta.ticketKey
                        )}
                      </span>
                      {' — '}
                      {alerta.summary}
                      <span style={{ color: 'var(--text-muted)' }}>
                        ({alerta.mensagem.match(/(\d+)d aberto/)?.[1] ?? '?'}d
                        {alerta.status ? `, ${alerta.status}` : ''}
                        {alerta.assignee ? `, ${alerta.assignee}` : ''})
                      </span>
                      {alerta.intelligence && (
                        <>
                          <BlockerBadge category={alerta.intelligence.blocker.category} />
                          <RiskDot level={alerta.intelligence.riskLevel} />
                        </>
                      )}
                    </div>
                    {alerta.intelligence ? (
                      <div style={{ marginTop: 4, paddingLeft: 2 }}>
                        <div style={{
                          fontSize: 12, color: 'var(--text-secondary)',
                          lineHeight: 1.5, marginBottom: 4,
                          borderLeft: '2px solid var(--border)',
                          paddingLeft: 8,
                        }}>
                          {alerta.intelligence.narrative}
                        </div>
                        <div style={{
                          fontSize: 11.5, fontWeight: 600,
                          color: 'var(--accent)',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                          → {alerta.intelligence.recommendedAction}
                        </div>
                        {alerta.intelligence.evolution && (
                          <div style={{
                            fontSize: 10.5, color: 'var(--text-muted)',
                            marginTop: 2, fontStyle: 'italic',
                          }}>
                            {alerta.intelligence.evolution}
                          </div>
                        )}
                      </div>
                    ) : alerta.lastComment ? (
                      <div style={{
                        fontSize: 11.5, color: 'var(--text-muted)',
                        marginTop: 2, paddingLeft: 2,
                        fontStyle: 'italic',
                      }}>
                        &ldquo;{alerta.lastComment.body.slice(0, 120)}{alerta.lastComment.body.length > 120 ? '…' : ''}&rdquo;
                        {' — '}{alerta.lastComment.author}, {formatRelativeDate(alerta.lastComment.created)}
                      </div>
                    ) : null}
                  </>
                ) : (
                  alerta.mensagem
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function IntelOperacionalSection({
  snapshot,
}: {
  snapshot: SupportBoardSnapshot
}) {
  const { inOutSemanal, recorrentesDetectados, topTipos, history } = snapshot

  // Curva de backlog: ticketsAbertos por dia (do history)
  const backlogPoints = history.slice(-30).map((e) => e.ticketsAbertos)

  const hasData = inOutSemanal.length > 0 || backlogPoints.length >= 2
  if (!hasData) return null

  return (
    <Section title="Inteligência Operacional">
      {/* Sub-bloco 1: Vazão in/out semanal */}
      {inOutSemanal.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
            fontFamily: 'var(--font)', marginBottom: 10,
          }}>
            Vazão semanal (últimas 8 semanas)
          </div>
          <InOutBarChart entries={inOutSemanal} />
          <div style={{
            display: 'flex', gap: 16, marginTop: 8,
            fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'var(--font)',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent)', display: 'inline-block' }} />
              Abertos (in)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--text-muted)', opacity: 0.6, display: 'inline-block' }} />
              Resolvidos (out)
            </span>
          </div>
        </div>
      )}

      {/* Sub-bloco 2: Curva histórica de backlog */}
      {backlogPoints.length >= 2 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
            fontFamily: 'var(--font)', marginBottom: 10,
          }}>
            Backlog histórico (tickets abertos)
          </div>
          <MiniLineChart points={backlogPoints} width={420} height={50} color="var(--accent)" />
        </div>
      )}

      {/* Sub-bloco 3: Temas (preferência) ou tipos (fallback) */}
      {(snapshot.topTemas && snapshot.topTemas.length > 0) ? (
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
            fontFamily: 'var(--font)', marginBottom: 10,
          }}>
            Temas mais frequentes (abertos + fechados 30d)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {snapshot.topTemas.map((item) => (
              <span
                key={item.tema}
                title={item.exemplos.length > 0 ? `Ex: ${item.exemplos.join(', ')}` : undefined}
                style={{
                  padding: '4px 12px', borderRadius: 20,
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  fontSize: 12.5, color: 'var(--text-secondary)', fontFamily: 'var(--font)',
                  cursor: item.exemplos.length > 0 ? 'help' : undefined,
                }}
              >
                {item.tema}: <strong style={{ color: 'var(--text-primary)' }}>{item.count}</strong>
              </span>
            ))}
          </div>
        </div>
      ) : topTipos.length > 0 ? (
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
            fontFamily: 'var(--font)', marginBottom: 10,
          }}>
            Tipos mais frequentes (abertos + fechados 30d)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {topTipos.map((item) => (
              <span key={item.tipo} style={{
                padding: '4px 12px', borderRadius: 20,
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                fontSize: 12.5, color: 'var(--text-secondary)', fontFamily: 'var(--font)',
              }}>
                {item.tipo}: <strong style={{ color: 'var(--text-primary)' }}>{item.count}</strong>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Sub-bloco 4: Recorrentes detectados */}
      {recorrentesDetectados.length > 0 && (
        <div>
          <div style={{
            fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
            fontFamily: 'var(--font)', marginBottom: 10,
          }}>
            Candidatos a resolver na raiz (últimos 30d)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recorrentesDetectados.map((r: RecorrenteDetectado, i: number) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderRadius: 6,
                background: 'rgba(184, 64, 64, 0.06)',
                border: '1px solid rgba(184, 64, 64, 0.2)',
              }}>
                <span style={{ fontSize: 13 }}>⚠️</span>
                <span style={{
                  fontSize: 12.5, color: 'var(--text-primary)', fontFamily: 'var(--font)',
                  flex: 1,
                }}>
                  <strong>{r.tipo}</strong>
                  {r.label && <span style={{ color: 'var(--text-muted)' }}> · {r.label}</span>}
                </span>
                <span style={{
                  fontSize: 12, color: 'var(--red)', fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                }}>
                  {r.ocorrencias}x em 30d
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  )
}

export function SustentacaoView() {
  const { navigate } = useRouter()
  const [snapshot, setSnapshot] = useState<SupportBoardSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [perAssignee, setPerAssignee] = useState<Array<{
    email: string; nome: string; nivel: string
    totalTickets: number; emBreach: number; riskAlto: number
    blockers: number; workloadExterno: string; alertas: string[]
  }>>([])


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

  useEffect(() => {
    loadData()
  }, [])

  async function handleRefresh() {
    setRefreshing(true)
    setError(null)
    try {
      const data = await window.api.sustentacao.refresh()
      setSnapshot(data)
      window.dispatchEvent(new CustomEvent('sustentacao:refreshed'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar')
    } finally {
      setRefreshing(false)
    }
  }

  async function handleFullAnalysis() {
    if (loading || refreshing || analyzing) return
    setAnalyzing(true)
    setError(null)
    try {
      // Passo 1: análise do board (padrões, causa raiz)
      try {
        await window.api.sustentacao.runAnalysis()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro na análise do board')
      }

      // Passo 2: análise por ticket (narrativa, blocker, risco)
      const ticketResult = await window.api.sustentacao.runTicketAnalysis()
      if (ticketResult.perAssigneeSummary) {
        setPerAssignee(ticketResult.perAssigneeSummary)
      }

      // Recarrega dados com intelligence atualizada
      const data = await window.api.sustentacao.getData()
      setSnapshot(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao analisar tickets')
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
  const deltaAbertos = getDelta(snapshot.ticketsAbertos, snapshot.history, 'ticketsAbertos')
  const deltaFechados = getDelta(snapshot.ticketsFechadosUltimos30d, snapshot.history, 'ticketsFechadosUltimos30d')
  const deltaBreach = getDelta(breachCount, snapshot.history, 'breachCount')

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {snapshot?.previousAnalysisDate && (
            <span style={{
              fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'var(--font)',
              marginRight: 4,
            }}>
              Última análise: {new Date(snapshot.previousAnalysisDate + 'T12:00:00').toLocaleDateString('pt-BR', {
                day: '2-digit', month: '2-digit',
              })}
            </span>
          )}
          <button
            onClick={handleFullAnalysis}
            disabled={loading || refreshing || analyzing}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 6, border: '1px solid var(--accent)',
              background: 'rgba(131,187,120,0.1)', color: 'var(--accent)',
              fontSize: 13, fontFamily: 'var(--font)', fontWeight: 600,
              cursor: loading || refreshing || analyzing ? 'not-allowed' : 'pointer',
              opacity: loading || refreshing || analyzing ? 0.5 : 1,
            }}
          >
            {analyzing
              ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Analisando…</>
              : 'Analisar sustentação'}
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

      {/* Alertas proativos — visivel quando snapshot tem alertas ativos */}
      {snapshot.alertas && snapshot.alertas.length > 0 && (
        <AlertasBanner alertas={snapshot.alertas} />
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 40px' }}>
        {/* Row 1: Compliance cards (novos) */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
          <div style={{
            flex: 1, background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '16px 20px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              SLA Compliance 7d
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font)', lineHeight: 1 }}>
              {snapshot.complianceRate7d !== null ? `${snapshot.complianceRate7d}%` : '—'}
            </div>
          </div>
          <div style={{
            flex: 1, background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '16px 20px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              SLA Compliance 30d
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font)', lineHeight: 1 }}>
              {snapshot.complianceRate30d !== null ? `${snapshot.complianceRate30d}%` : '—'}
            </div>
          </div>
        </div>

        {/* Row 2: Cards existentes com deltas */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
          <MetricCard
            label="Tickets Abertos"
            value={snapshot.ticketsAbertos}
            delta={formatDelta(deltaAbertos)}
            deltaColor={deltaColor(deltaAbertos, true)}
          />
          <MetricCard
            label="Fechados (30d)"
            value={snapshot.ticketsFechadosUltimos30d}
            delta={formatDelta(deltaFechados)}
            deltaColor={deltaColor(deltaFechados, false)}
          />
          <MetricCard
            label="Em Breach de SLA"
            value={breachCount}
            highlight={breachCount > 0}
            delta={formatDelta(deltaBreach)}
            deltaColor={deltaColor(deltaBreach, true)}
          />
        </div>

        {/* Mini Charts de evolução */}
        {snapshot.history.length >= 2 && (
          <Section title="Evolução (últimos 30 dias)">
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Breach Count
                </div>
                <MiniLineChart
                  points={buildChartPoints(snapshot.history, 'breachCount')}
                  color="var(--red)"
                />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Compliance 7d (%)
                </div>
                <MiniLineChart
                  points={buildChartPoints(snapshot.history, 'complianceRate7d')}
                  color="var(--accent)"
                />
              </div>
            </div>
          </Section>
        )}

        {/* Inteligência Operacional */}
        <IntelOperacionalSection snapshot={snapshot} />

        {/* Resumo Executivo (quando análise por ticket disponível) */}
        {snapshot.executiveSummary && (
          <Section title="Resumo Executivo">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Risco geral */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Risco geral:</span>
                <span style={{
                  fontSize: 12, fontWeight: 700,
                  color: RISK_COLORS[snapshot.executiveSummary.overallRisk] ?? 'var(--text-muted)',
                  textTransform: 'uppercase',
                }}>
                  {snapshot.executiveSummary.overallRisk}
                </span>
              </div>

              {/* Ações prioritárias */}
              {snapshot.executiveSummary.priorityActions.length > 0 && (
                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Ações Prioritárias
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {snapshot.executiveSummary.priorityActions.map((action, i) => (
                      <div key={i} style={{
                        fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5,
                        display: 'flex', gap: 8,
                      }}>
                        <span style={{ fontWeight: 700, color: 'var(--accent)', minWidth: 16 }}>{i + 1}.</span>
                        {action}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Por bloqueador */}
              {Object.entries(snapshot.executiveSummary.byBlocker).filter(([, keys]) => keys && keys.length > 0).length > 0 && (
                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Por Bloqueador
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {Object.entries(snapshot.executiveSummary.byBlocker)
                      .filter(([, keys]) => keys && keys.length > 0)
                      .map(([category, keys]) => (
                        <div key={category} style={{
                          background: 'var(--surface)', border: '1px solid var(--border)',
                          borderRadius: 6, padding: '8px 12px',
                          display: 'flex', flexDirection: 'column', gap: 4,
                        }}>
                          <BlockerBadge category={category as BlockerCategory} />
                          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            {keys!.join(', ')}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {snapshot.previousAnalysisDate && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Comparado com análise de {new Date(snapshot.previousAnalysisDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Per-Assignee Summary */}
        {perAssignee.length > 0 && (
          <Section title="Por Pessoa">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {perAssignee.map((p) => (
                <div key={p.email} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', borderRadius: 6,
                  background: p.alertas.length > 0 ? 'rgba(255,80,80,0.06)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${p.alertas.length > 0 ? 'rgba(255,80,80,0.15)' : 'var(--border)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{p.nome}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>({p.nivel})</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{p.totalTickets} tickets</span>
                    {p.emBreach > 0 && <span style={{ color: '#f87171', fontWeight: 600 }}>{p.emBreach} breach</span>}
                    {p.riskAlto > 0 && <span style={{ color: '#fb923c', fontWeight: 600 }}>{p.riskAlto} risco alto</span>}
                    {p.alertas.length > 0 && (
                      <span style={{ fontSize: 11, color: '#f87171' }}>{p.alertas[0]}</span>
                    )}
                  </div>
                </div>
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
                gridTemplateColumns: '90px 1fr 100px 130px 70px 80px',
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
                <span>Assignee</span>
                <span>Bloqueador</span>
                <span style={{ textAlign: 'right' }}>Idade</span>
                <span>Contexto</span>
              </div>
              {/* Rows */}
              {snapshot.ticketsEmBreach.map((ticket, idx) => {
                const enriched = snapshot.enrichedTickets?.find((e) => e.key === ticket.key)
                const intel = enriched?.intelligence
                const blocker = intel?.blocker?.category ?? enriched?.deterministicContext?.inferredBlocker
                return (
                  <div
                    key={ticket.key}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '90px 1fr 100px 130px 70px 80px',
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
                    }} title={intel?.narrative ?? ticket.summary}>
                      {ticket.summary.length > 50
                        ? ticket.summary.slice(0, 50) + '…'
                        : ticket.summary}
                    </span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 11.5 }}>{ticket.assignee ?? '—'}</span>
                    <span>{blocker ? <BlockerBadge category={blocker} /> : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>}</span>
                    <span style={{
                      textAlign: 'right', fontWeight: 600,
                      color: 'var(--red)', fontFamily: 'var(--font-mono)',
                    }}>
                      {ticket.ageDias}d
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }} title={intel?.narrative ?? ''}>
                      {intel ? <RiskDot level={intel.riskLevel} /> : '—'}
                    </span>
                  </div>
                )
              })}
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
  highlight = false,
  delta,
  deltaColor: deltaColorProp,
}: {
  label: string
  value: number
  highlight?: boolean
  delta?: string
  deltaColor?: string
}) {
  return (
    <div style={{
      flex: 1,
      background: 'var(--surface)',
      border: `1px solid ${highlight ? 'rgba(184,64,64,0.4)' : 'var(--border)'}`,
      borderRadius: 8,
      padding: '16px 20px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: highlight ? 'var(--red)' : 'var(--text-primary)', fontFamily: 'var(--font)', lineHeight: 1 }}>
          {value}
        </div>
        {delta && delta !== '—' && (
          <div style={{ fontSize: 12, color: deltaColorProp ?? 'var(--text-muted)', fontFamily: 'var(--font)' }}>
            {delta}
          </div>
        )}
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

import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'

interface ExternalDataCardProps {
  slug: string
}

/** Shape returned by validated external:get-data IPC handler */
interface ExternalDataSnapshot {
  atualizadoEm: string
  jira: {
    sprintAtual?: { nome: string; id: number } | null
    issuesAbertas: number
    issuesFechadasSprint: number
    storyPointsSprint: number
    workloadScore: 'alto' | 'medio' | 'baixo'
    bugsAtivos: number
    blockersAtivos: Array<{ key: string; summary: string }>
    tempoMedioCicloDias: number
  } | null
  github: {
    commits30d: number
    commitsPorSemana: number
    prsMerged30d: number
    prsAbertos: number
    prsRevisados: number
    tempoMedioAbertoDias: number
    tempoMedioReviewDias: number
    tamanhoMedioPR: { additions: number; deletions: number }
  } | null
  insights: Array<{
    tipo: string
    severidade: 'alta' | 'media' | 'baixa'
    descricao: string
    evidencia?: string
    acaoSugerida?: string
  }>
}

export function ExternalDataCard({ slug }: ExternalDataCardProps) {
  const [data, setData] = useState<ExternalDataSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const d = await window.api.external.getData(slug)
    setData(d as ExternalDataSnapshot | null)
    setLoading(false)
  }, [slug])

  const handleRefresh = async () => {
    setRefreshing(true)
    await window.api.external.refreshPerson(slug)
    await load()
    setRefreshing(false)
  }

  useEffect(() => {
    let cancelled = false
    load().then(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [load])

  useEffect(() => {
    const onGlobalRefresh = () => {
      void load()
    }
    window.addEventListener('pulse:external-daily-refresh', onGlobalRefresh)
    return () => window.removeEventListener('pulse:external-daily-refresh', onGlobalRefresh)
  }, [load])

  if (loading) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>
        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  if (!data) return null

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 6, overflow: 'hidden', marginBottom: 14,
    }}>
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)',
        fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
        textTransform: 'uppercase' as const, color: 'var(--text-muted)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>Dados Externos</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {data.atualizadoEm && (
            <span style={{ fontSize: 9, letterSpacing: '0.04em', color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>
              {data.atualizadoEm}
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Atualizar dados externos"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 2, display: 'flex', alignItems: 'center',
              opacity: refreshing ? 0.5 : 1,
            }}
          >
            <RefreshCw size={11} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
          </button>
        </div>
      </div>

      {/* Jira */}
      {data.jira && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--accent)', marginBottom: 6 }}>
            JIRA
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {data.jira.sprintAtual?.nome && <DataRow label="Sprint" value={data.jira.sprintAtual.nome} />}
            {data.jira.issuesAbertas != null && <DataRow label="Issues abertas" value={String(data.jira.issuesAbertas)} />}
            {data.jira.workloadScore && <DataRow label="Workload" value={data.jira.workloadScore} />}
            {data.jira.blockersAtivos.length > 0 && <DataRow label="Blockers" value={`${data.jira.blockersAtivos.length} ativo(s)`} highlight />}
          </div>
        </div>
      )}

      {/* GitHub */}
      {data.github && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--accent)', marginBottom: 6 }}>
            GITHUB
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {data.github.commits30d != null && <DataRow label="Commits (30d)" value={String(data.github.commits30d)} />}
            {data.github.prsMerged30d != null && <DataRow label="PRs merged" value={String(data.github.prsMerged30d)} />}
            {data.github.prsAbertos != null && <DataRow label="PRs abertos" value={String(data.github.prsAbertos)} />}
            {data.github.prsRevisados != null && <DataRow label="Reviews" value={String(data.github.prsRevisados)} />}
          </div>
        </div>
      )}

      {/* Insights */}
      {data.insights.length > 0 && (
        <div style={{ padding: '10px 16px' }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--accent)', marginBottom: 6 }}>
            INSIGHTS CRUZADOS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.insights.map((insight, i) => (
              <div key={i} style={{
                fontSize: 11, color: insight.severidade === 'alta' ? 'var(--red)' : 'var(--text-secondary)',
                padding: '3px 0',
              }}>
                {insight.severidade === 'alta' ? '\u26A0\uFE0F' : insight.severidade === 'media' ? '\uD83D\uDD36' : '\u2139\uFE0F'} {insight.descricao}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DataRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{
        fontWeight: 500,
        color: highlight ? 'var(--red)' : 'var(--text-primary)',
        fontFamily: 'var(--font-mono)', fontSize: 11,
      }}>
        {value}
      </span>
    </div>
  )
}

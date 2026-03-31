import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import type { ExternalDataSnapshot } from '../types/ipc'

interface ExternalDataCardProps {
  slug: string
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

  const jira = data.jira
  const github = data.github
  const insights = data.insights ?? []
  const blockers = jira?.blockersAtivos?.length ?? 0

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
      {jira && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--accent)', marginBottom: 6 }}>
            JIRA
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {jira.sprintAtual?.nome && <DataRow label="Sprint" value={jira.sprintAtual.nome} />}
            {jira.issuesAbertas != null && <DataRow label="Issues abertas" value={String(jira.issuesAbertas)} />}
            {jira.issuesFechadasSprint != null && <DataRow label="Issues fechadas" value={String(jira.issuesFechadasSprint)} />}
            {jira.storyPointsSprint != null && <DataRow label="SP no sprint" value={String(jira.storyPointsSprint)} />}
            {jira.workloadScore && <DataRow label="Workload" value={jira.workloadScore} />}
            {jira.bugsAtivos != null && jira.bugsAtivos > 0 && <DataRow label="Bugs ativos" value={String(jira.bugsAtivos)} highlight={false} />}
            {blockers > 0 && <DataRow label="Blockers" value={`${blockers} ativo(s)`} highlight />}
          </div>
          <div style={{ marginTop: 6, fontSize: 9, color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: '1.4' }}>
            Contagens não refletem impacto ou qualidade
          </div>
        </div>
      )}

      {/* GitHub */}
      {github && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--accent)', marginBottom: 6 }}>
            GITHUB
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {github.commits30d != null && <DataRow label="Commits (30d)" value={String(github.commits30d)} />}
            {github.commitsPorSemana != null && <DataRow label="Commits/semana" value={String(github.commitsPorSemana)} />}
            {github.prsMerged30d != null && <DataRow label="PRs merged" value={String(github.prsMerged30d)} />}
            {github.prsAbertos != null && <DataRow label="PRs abertos" value={String(github.prsAbertos)} />}
            {github.prsRevisados != null && <DataRow label="Reviews" value={String(github.prsRevisados)} />}
            {github.tempoMedioAbertoDias != null && <DataRow label="PR aberto (dias)" value={github.tempoMedioAbertoDias.toFixed(1)} />}
            {github.tempoMedioReviewDias != null && <DataRow label="Tempo review" value={github.tempoMedioReviewDias.toFixed(1)} />}
          </div>
          <div style={{ marginTop: 6, fontSize: 9, color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: '1.4' }}>
            Contagens não refletem impacto ou qualidade
          </div>
        </div>
      )}

      {/* Insights */}
      {insights.length > 0 && (
        <div style={{ padding: '10px 16px' }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--accent)', marginBottom: 6 }}>
            INSIGHTS CRUZADOS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {insights.map((insight, i) => (
              <div key={i} style={{
                fontSize: 11,
                color: insight.tipo === 'destaque'
                  ? 'var(--green)'
                  : insight.severidade === 'alta' ? 'var(--red)' : 'var(--text-secondary)',
                padding: '3px 0',
              }}>
                {insight.tipo === 'destaque' ? '✨' : insight.severidade === 'alta' ? '⚠️' : insight.severidade === 'media' ? '🔶' : 'ℹ️'} {insight.descricao}
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


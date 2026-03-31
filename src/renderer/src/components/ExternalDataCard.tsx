import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'

interface ExternalDataCardProps {
  slug: string
}

export function ExternalDataCard({ slug }: ExternalDataCardProps) {
  const [data, setData] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const d = await window.api.external.getData(slug)
    setData(d)
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

  const parsed = parseExternalData(data)

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
          {parsed.atualizadoEm && (
            <span style={{ fontSize: 9, letterSpacing: '0.04em', color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>
              {parsed.atualizadoEm}
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
      {parsed.jira && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--accent)', marginBottom: 6 }}>
            JIRA
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {parsed.jira.sprint && <DataRow label="Sprint" value={parsed.jira.sprint} />}
            {parsed.jira.issuesAbertas != null && <DataRow label="Issues abertas" value={String(parsed.jira.issuesAbertas)} />}
            {parsed.jira.issuesFechadas != null && <DataRow label="Issues fechadas" value={String(parsed.jira.issuesFechadas)} />}
            {parsed.jira.storyPoints != null && <DataRow label="SP no sprint" value={String(parsed.jira.storyPoints)} />}
            {parsed.jira.workload && <DataRow label="Workload" value={parsed.jira.workload} />}
            {parsed.jira.bugsAtivos != null && parsed.jira.bugsAtivos > 0 && <DataRow label="Bugs ativos" value={String(parsed.jira.bugsAtivos)} highlight={false} />}
            {parsed.jira.blockers > 0 && <DataRow label="Blockers" value={`${parsed.jira.blockers} ativo(s)`} highlight />}
          </div>
        </div>
      )}

      {/* GitHub */}
      {parsed.github && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--accent)', marginBottom: 6 }}>
            GITHUB
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {parsed.github.commits30d != null && <DataRow label="Commits (30d)" value={String(parsed.github.commits30d)} />}
            {parsed.github.commitsPorSemana != null && <DataRow label="Commits/semana" value={String(parsed.github.commitsPorSemana)} />}
            {parsed.github.prsMerged30d != null && <DataRow label="PRs merged" value={String(parsed.github.prsMerged30d)} />}
            {parsed.github.prsAbertos != null && <DataRow label="PRs abertos" value={String(parsed.github.prsAbertos)} />}
            {parsed.github.prsRevisados != null && <DataRow label="Reviews" value={String(parsed.github.prsRevisados)} />}
            {parsed.github.tempoMedioAbertoDias != null && <DataRow label="PR aberto (dias)" value={parsed.github.tempoMedioAbertoDias.toFixed(1)} />}
            {parsed.github.tempoMedioReviewDias != null && <DataRow label="Tempo review" value={parsed.github.tempoMedioReviewDias.toFixed(1)} />}
          </div>
        </div>
      )}

      {/* Insights */}
      {parsed.insights.length > 0 && (
        <div style={{ padding: '10px 16px' }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--accent)', marginBottom: 6 }}>
            INSIGHTS CRUZADOS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {parsed.insights.map((insight, i) => (
              <div key={i} style={{
                fontSize: 11, color: insight.severidade === 'alta' ? 'var(--red)' : 'var(--text-secondary)',
                padding: '3px 0',
              }}>
                {insight.severidade === 'alta' ? '⚠️' : insight.severidade === 'media' ? '🔶' : 'ℹ️'} {insight.descricao}
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

interface ParsedExternalData {
  atualizadoEm: string | null
  jira: {
    sprint: string | null
    issuesAbertas: number | null
    issuesFechadas: number | null
    storyPoints: number | null
    workload: string | null
    bugsAtivos: number | null
    blockers: number
  } | null
  github: {
    commits30d: number | null
    commitsPorSemana: number | null
    prsMerged30d: number | null
    prsAbertos: number | null
    prsRevisados: number | null
    tempoMedioAbertoDias: number | null
    tempoMedioReviewDias: number | null
  } | null
  insights: Array<{ tipo: string; severidade: string; descricao: string }>
}

function parseExternalData(yamlContent: string): ParsedExternalData {
  const result: ParsedExternalData = {
    atualizadoEm: null,
    jira: null,
    github: null,
    insights: [],
  }

  try {
    const lines = yamlContent.split('\n')
    let section: 'jira' | 'github' | 'insights' | null = null

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]
      const trimmed = raw.trim()

      if (!trimmed) continue

      if (trimmed.startsWith('atualizadoEm:')) {
        result.atualizadoEm = trimmed.split(':').slice(1).join(':').trim().replace(/"/g, '')
        continue
      }

      if (trimmed === 'jira:') { section = 'jira'; continue }
      if (trimmed === 'github:') { section = 'github'; continue }
      if (trimmed === 'insights:') { section = 'insights'; continue }

      if (trimmed.match(/^[a-zA-Z]/) && !trimmed.startsWith('-') && !trimmed.startsWith('"') && !trimmed.startsWith("'")) {
        if (trimmed !== 'jira:' && trimmed !== 'github:' && trimmed !== 'insights:' && !trimmed.startsWith('atualizadoEm')) {
          section = null
        }
      }

      if (section === 'jira') {
        if (trimmed.startsWith('sprintAtual:')) {
          result.jira = result.jira ?? { sprint: null, issuesAbertas: null, issuesFechadas: null, storyPoints: null, workload: null, bugsAtivos: null, blockers: 0 }
          if (i + 1 < lines.length && lines[i + 1].trim().startsWith('nome:')) {
            result.jira.sprint = lines[i + 1].trim().split(':').slice(1).join(':').trim().replace(/"/g, '')
          }
          continue
        }
        if (trimmed.startsWith('issuesAbertas:')) {
          result.jira = result.jira ?? { sprint: null, issuesAbertas: null, issuesFechadas: null, storyPoints: null, workload: null, bugsAtivos: null, blockers: 0 }
          result.jira.issuesAbertas = parseInt(trimmed.split(':')[1].trim()) || 0
          continue
        }
        if (trimmed.startsWith('issuesFechadasSprint:')) {
          result.jira = result.jira ?? { sprint: null, issuesAbertas: null, issuesFechadas: null, storyPoints: null, workload: null, bugsAtivos: null, blockers: 0 }
          result.jira.issuesFechadas = parseInt(trimmed.split(':')[1].trim()) || 0
          continue
        }
        if (trimmed.startsWith('storyPointsSprint:')) {
          result.jira = result.jira ?? { sprint: null, issuesAbertas: null, issuesFechadas: null, storyPoints: null, workload: null, bugsAtivos: null, blockers: 0 }
          result.jira.storyPoints = parseInt(trimmed.split(':')[1].trim()) || 0
          continue
        }
        if (trimmed.startsWith('workloadScore:')) {
          result.jira = result.jira ?? { sprint: null, issuesAbertas: null, issuesFechadas: null, storyPoints: null, workload: null, bugsAtivos: null, blockers: 0 }
          result.jira.workload = trimmed.split(':').slice(1).join(':').trim().replace(/"/g, '')
          continue
        }
        if (trimmed.startsWith('bugsAtivos:')) {
          result.jira = result.jira ?? { sprint: null, issuesAbertas: null, issuesFechadas: null, storyPoints: null, workload: null, bugsAtivos: null, blockers: 0 }
          result.jira.bugsAtivos = parseInt(trimmed.split(':')[1].trim()) || 0
          continue
        }
        if (trimmed === '- key:') {
          result.jira = result.jira ?? { sprint: null, issuesAbertas: null, issuesFechadas: null, storyPoints: null, workload: null, bugsAtivos: null, blockers: 0 }
          result.jira.blockers++
          continue
        }
      }

      if (section === 'github') {
        if (trimmed.startsWith('commits30d:')) {
          result.github = result.github ?? { commits30d: null, commitsPorSemana: null, prsMerged30d: null, prsAbertos: null, prsRevisados: null, tempoMedioAbertoDias: null, tempoMedioReviewDias: null }
          result.github.commits30d = parseInt(trimmed.split(':')[1].trim()) || 0
          continue
        }
        if (trimmed.startsWith('commitsPorSemana:')) {
          result.github = result.github ?? { commits30d: null, commitsPorSemana: null, prsMerged30d: null, prsAbertos: null, prsRevisados: null, tempoMedioAbertoDias: null, tempoMedioReviewDias: null }
          result.github.commitsPorSemana = parseFloat(trimmed.split(':')[1].trim()) || 0
          continue
        }
        if (trimmed.startsWith('prsMerged30d:')) {
          result.github = result.github ?? { commits30d: null, commitsPorSemana: null, prsMerged30d: null, prsAbertos: null, prsRevisados: null, tempoMedioAbertoDias: null, tempoMedioReviewDias: null }
          result.github.prsMerged30d = parseInt(trimmed.split(':')[1].trim()) || 0
          continue
        }
        if (trimmed.startsWith('prsAbertos:')) {
          result.github = result.github ?? { commits30d: null, commitsPorSemana: null, prsMerged30d: null, prsAbertos: null, prsRevisados: null, tempoMedioAbertoDias: null, tempoMedioReviewDias: null }
          result.github.prsAbertos = parseInt(trimmed.split(':')[1].trim()) || 0
          continue
        }
        if (trimmed.startsWith('prsRevisados:')) {
          result.github = result.github ?? { commits30d: null, commitsPorSemana: null, prsMerged30d: null, prsAbertos: null, prsRevisados: null, tempoMedioAbertoDias: null, tempoMedioReviewDias: null }
          result.github.prsRevisados = parseInt(trimmed.split(':')[1].trim()) || 0
          continue
        }
        if (trimmed.startsWith('tempoMedioAbertoDias:')) {
          result.github = result.github ?? { commits30d: null, commitsPorSemana: null, prsMerged30d: null, prsAbertos: null, prsRevisados: null, tempoMedioAbertoDias: null, tempoMedioReviewDias: null }
          result.github.tempoMedioAbertoDias = parseFloat(trimmed.split(':')[1].trim()) || 0
          continue
        }
        if (trimmed.startsWith('tempoMedioReviewDias:')) {
          result.github = result.github ?? { commits30d: null, commitsPorSemana: null, prsMerged30d: null, prsAbertos: null, prsRevisados: null, tempoMedioAbertoDias: null, tempoMedioReviewDias: null }
          result.github.tempoMedioReviewDias = parseFloat(trimmed.split(':')[1].trim()) || 0
          continue
        }
      }

      if (section === 'insights' && trimmed.startsWith('- tipo:')) {
        const tipo = trimmed.split(':')[1].trim().replace(/"/g, '')
        let severidade = 'baixa'
        let descricao = ''
        for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
          const l = lines[j].trim()
          if (l.startsWith('severidade:')) severidade = l.split(':')[1].trim().replace(/"/g, '')
          if (l.startsWith('descricao:')) descricao = l.split(':').slice(1).join(':').trim().replace(/"/g, '')
        }
        if (descricao) result.insights.push({ tipo, severidade, descricao })
      }
    }
  } catch {
    // parse error — return what we have
  }

  return result
}

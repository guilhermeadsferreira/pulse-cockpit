import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'

interface ExternalDataCardProps {
  slug: string
}

export function ExternalDataCard({ slug }: ExternalDataCardProps) {
  const [data, setData] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.api.external.getData(slug).then((d) => {
      if (!cancelled) {
        setData(d)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [slug])

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
        {parsed.atualizadoEm && (
          <span style={{ fontSize: 9, letterSpacing: '0.04em', color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>
            atualizado: {parsed.atualizadoEm}
          </span>
        )}
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
            {parsed.jira.workload && <DataRow label="Workload" value={parsed.jira.workload} />}
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
            {parsed.github.commits != null && <DataRow label="Commits (30d)" value={String(parsed.github.commits)} />}
            {parsed.github.prsMerged != null && <DataRow label="PRs merged" value={String(parsed.github.prsMerged)} />}
            {parsed.github.prsAbertos != null && <DataRow label="PRs abertos" value={String(parsed.github.prsAbertos)} />}
            {parsed.github.reviews != null && <DataRow label="Reviews" value={String(parsed.github.reviews)} />}
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
    workload: string | null
    blockers: number
  } | null
  github: {
    commits: number | null
    prsMerged: number | null
    prsAbertos: number | null
    reviews: number | null
  } | null
  insights: Array<{ tipo: string; severidade: string; descricao: string }>
}

function parseExternalData(yamlContent: string): ParsedExternalData {
  const result: ParsedExternalData = {
    atualizadoEm: null, jira: null, github: null, insights: [],
  }

  try {
    // Simple line-based parsing for external_data.yaml
    // Avoids importing js-yaml in the renderer
    const lines = yamlContent.split('\n')
    let inAtual = false
    let inJira = false
    let inGithub = false
    let inInsights = false

    for (const line of lines) {
      const trimmed = line.trim()

      if (trimmed.startsWith('atualizadoEm:')) {
        result.atualizadoEm = trimmed.split(':').slice(1).join(':').trim().replace(/"/g, '')
      }

      if (trimmed === 'atual:') { inAtual = true; continue }
      if (trimmed === 'jira:') { inJira = true; inGithub = false; continue }
      if (trimmed === 'github:') { inGithub = true; inJira = false; continue }
      if (trimmed === 'insights:') { inInsights = true; inJira = false; inGithub = false; continue }

      if (inAtual && trimmed.match(/^[a-z]/) && !trimmed.startsWith('-') && !trimmed.startsWith('"')) {
        if (trimmed !== 'atual:' && !trimmed.startsWith('jira:') && !trimmed.startsWith('github:') && !trimmed.startsWith('insights:')) {
          inAtual = false
          inJira = false
          inGithub = false
          inInsights = false
        }
      }

      if (inJira) {
        if (trimmed.startsWith('issuesAbertas:')) result.jira = { ...result.jira ?? { sprint: null, issuesAbertas: null, workload: null, blockers: 0 }, issuesAbertas: parseInt(trimmed.split(':')[1].trim()) || 0 }
        if (trimmed.startsWith('workloadScore:')) result.jira = { ...result.jira ?? { sprint: null, issuesAbertas: null, workload: null, blockers: 0 }, workload: trimmed.split(':')[1].trim().replace(/"/g, '') }
        if (trimmed.startsWith('sprintAtual:')) {
          // try to get sprint name from next line
        }
        if (trimmed.startsWith('nome:') && result.jira) result.jira.sprint = trimmed.split(':')[1].trim().replace(/"/g, '')
        if (trimmed.startsWith('- key:')) result.jira = { ...result.jira ?? { sprint: null, issuesAbertas: null, workload: null, blockers: 0 }, blockers: (result.jira?.blockers ?? 0) + 1 }
      }

      if (inGithub) {
        if (trimmed.startsWith('commits30d:')) result.github = { ...result.github ?? { commits: null, prsMerged: null, prsAbertos: null, reviews: null }, commits: parseInt(trimmed.split(':')[1].trim()) || 0 }
        if (trimmed.startsWith('prsMerged30d:')) result.github = { ...result.github ?? { commits: null, prsMerged: null, prsAbertos: null, reviews: null }, prsMerged: parseInt(trimmed.split(':')[1].trim()) || 0 }
        if (trimmed.startsWith('prsAbertos:')) result.github = { ...result.github ?? { commits: null, prsMerged: null, prsAbertos: null, reviews: null }, prsAbertos: parseInt(trimmed.split(':')[1].trim()) || 0 }
        if (trimmed.startsWith('prsRevisados:')) result.github = { ...result.github ?? { commits: null, prsMerged: null, prsAbertos: null, reviews: null }, reviews: parseInt(trimmed.split(':')[1].trim()) || 0 }
      }

      if (inInsights && trimmed.startsWith('- tipo:')) {
        const tipo = trimmed.split(':')[1].trim().replace(/"/g, '')
        // lookahead for severidade and descricao
        const idx = lines.indexOf(line)
        let severidade = 'baixa'
        let descricao = ''
        for (let i = idx + 1; i < Math.min(idx + 5, lines.length); i++) {
          const l = lines[i].trim()
          if (l.startsWith('severidade:')) severidade = l.split(':')[1].trim().replace(/"/g, '')
          if (l.startsWith('descricao:')) descricao = l.split(':').slice(1).join(':').trim().replace(/"/g, '')
        }
        result.insights.push({ tipo, severidade, descricao })
      }
    }
  } catch {
    // parse error — return empty
  }

  return result
}

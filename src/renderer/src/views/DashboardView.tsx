import { useState, useEffect, useCallback } from 'react'
import { UserPlus, Pencil, ChevronRight, X, UserCheck, AlertCircle, TrendingDown, TrendingUp } from 'lucide-react'
import { useRouter } from '../router'
import type { PersonConfig, PerfilFrontmatter, DetectedPerson, Action } from '../types/ipc'
import { labelNivel, labelRelacao, daysSince } from '../lib/utils'

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const RELACAO_META: Record<string, { eyebrow: string; title: string; detectedLabel: string }> = {
  liderado: {
    eyebrow: 'Visão geral',
    title: 'Seu time',
    detectedLabel: 'pessoas mencionadas nos artefatos, mas ainda não no time',
  },
  par: {
    eyebrow: 'Pares',
    title: 'Seus pares',
    detectedLabel: 'pessoas mencionadas nos artefatos, mas ainda não nos pares',
  },
  gestor: {
    eyebrow: 'Gestores',
    title: 'Seus gestores',
    detectedLabel: 'pessoas mencionadas nos artefatos, mas ainda não nos gestores',
  },
}

export function DashboardView({ relacao = 'liderado' }: { relacao?: string }) {
  const { navigate } = useRouter()
  const [people,   setPeople]   = useState<PersonConfig[]>([])
  const [perfis,   setPerfis]   = useState<Record<string, Partial<PerfilFrontmatter>>>({})
  const [actionsMap, setActionsMap] = useState<Record<string, Action[]>>({})
  const [detected, setDetected] = useState<DetectedPerson[]>([])
  const [loading,  setLoading]  = useState(true)
  const [escalations, setEscalations] = useState<Array<{
    slug: string; nome: string;
    gestorAction: { id: string; texto: string; descricao?: string; criadoEm: string };
    diasPendente: number; relatedCount: number;
  }>>([])
  const [crossTeamInsights, setCrossTeamInsights] = useState<Array<{
    tipo: string; descricao: string; pessoas: string[]; severidade: 'alta' | 'media' | 'baixa'
  }>>([])

  const meta = RELACAO_META[relacao] ?? RELACAO_META['liderado']

  const load = useCallback(async () => {
    setLoading(true)

    // Retry with exponential backoff on initial load failures
    const delays = [0, 300, 800, 1500]
    let list: PersonConfig[] = []
    let det: DetectedPerson[] = []
    for (let i = 0; i < delays.length; i++) {
      if (delays[i] > 0) await new Promise((r) => setTimeout(r, delays[i]))
      try {
        ;[list, det] = await Promise.all([
          window.api.people.list(),
          window.api.detected.list(),
        ])
        break
      } catch {
        if (i === delays.length - 1) {
          setLoading(false)
          return
        }
      }
    }

    const filtered = list.filter((p) => p.relacao === relacao)
    setPeople(filtered)
    // Filter out any detected people who are now registered
    const registeredSlugs = new Set(list.map((p) => p.slug))
    setDetected(det.filter((d) => !registeredSlugs.has(d.slug)))
    setLoading(false)

    // Load perfil frontmatter and actions for each person in parallel
    const [perfilResults, actionResults] = await Promise.all([
      Promise.all(filtered.map(async (p) => {
        const perfil = await window.api.people.getPerfil(p.slug)
        return [p.slug, perfil?.frontmatter ?? {}] as const
      })),
      Promise.all(filtered.map(async (p) => {
        const actions = await window.api.actions.list(p.slug)
        return [p.slug, actions] as const
      })),
    ])
    setPerfis(Object.fromEntries(perfilResults))
    setActionsMap(Object.fromEntries(actionResults))

    // Load escalations (acoes do gestor vencidas)
    try {
      const esc = await window.api.actions.escalations()
      setEscalations(esc)
    } catch { setEscalations([]) }

    // Load cross-team insights (only for liderados view)
    if (relacao === 'liderado') {
      try {
        const insights = await window.api.insights.crossTeam()
        setCrossTeamInsights(insights)
      } catch {
        setCrossTeamInsights([])
      }
    }
  }, [relacao])

  async function handleDismissDetected(slug: string) {
    await window.api.detected.dismiss(slug)
    setDetected((d) => d.filter((p) => p.slug !== slug))
  }

  useEffect(() => {
    load()
    // Refresh after ingestion (new detected people may have been added)
    window.api.ingestion.onCompleted(() => load())
    // Refresh when workspace path changes
    window.addEventListener('settings:saved', load)
    return () => {
      window.api.ingestion.removeListeners()
      window.removeEventListener('settings:saved', load)
    }
  }, [load])

  const staleCount = people.filter((p) => perfis[p.slug]?.dados_stale).length

  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  type Urgencia = { slug: string; nome: string; tipo: '1on1' | 'acao' | 'alerta'; label: string }
  const urgencias: Urgencia[] = []
  if (relacao === 'liderado') {
    for (const p of people) {
      const fm = perfis[p.slug] ?? {}
      const actions = actionsMap[p.slug] ?? []
      if (fm.necessita_1on1 && !fm.dados_stale) {
        urgencias.push({ slug: p.slug, nome: p.nome, tipo: '1on1', label: fm.motivo_1on1 ?? '1:1 urgente' })
      }
      const acoesPrazo = actions.filter((a) => a.status === 'open' && a.prazo && a.prazo <= tomorrow)
      for (const a of acoesPrazo) {
        urgencias.push({ slug: p.slug, nome: p.nome, tipo: 'acao', label: `prazo: ${(a.descricao ?? a.texto).slice(0, 60)}` })
      }
      if (fm.saude === 'vermelho' && !fm.dados_stale) {
        urgencias.push({ slug: p.slug, nome: p.nome, tipo: 'alerta', label: 'saúde crítica' })
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '28px 40px 22px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      }}>
        <div>
          <div style={styles.eyebrow}>{meta.eyebrow}</div>
          <h1 style={styles.pageTitle}>{meta.title}</h1>
          <div style={styles.pageSub}>
            {loading ? '…' : `${people.length} ${people.length === 1 ? 'pessoa' : 'pessoas'}`}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
          <button onClick={() => navigate('person-form', { defaultRelacao: relacao })} style={styles.btnPrimary}>
            <UserPlus size={13} />
            Adicionar pessoa
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {([
              { color: 'var(--green)',            label: 'Saudável' },
              { color: 'var(--yellow, #d4a843)',  label: 'Atenção' },
              { color: 'var(--red)',              label: 'Risco' },
              { color: 'var(--surface-3)',        label: 'Sem dados' },
            ] as const).map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '28px 40px', flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando…</div>
        ) : (
          <>
            {/* Registered team */}
            {people.length === 0 && detected.length === 0 ? (
              <EmptyState onAdd={() => navigate('person-form', { defaultRelacao: relacao })} />
            ) : people.length > 0 ? (
              <>
                {/* Stale data banner — T-R10.3 */}
                {staleCount > 0 && relacao === 'liderado' && (
                  <div style={{
                    background: 'rgba(100,120,160,0.08)', border: '1px solid rgba(100,120,160,0.2)',
                    borderRadius: 6, padding: '8px 14px', marginBottom: 16,
                    fontSize: 12, color: 'var(--text-secondary)',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <AlertCircle size={13} />
                    {staleCount} {staleCount === 1 ? 'pessoa sem' : 'pessoas sem'} dados há 30+ dias
                  </div>
                )}

                {/* Urgências do dia — T-R10.1 */}
                {urgencias.length > 0 && (
                  <UrgenciasHoje
                    urgencias={urgencias}
                    onNavigate={(slug) => navigate('person', { slug })}
                  />
                )}

                {/* Risk panel — visible for all relations */}
                <TeamRiskPanel
                  people={people}
                  perfis={perfis}
                  actionsMap={actionsMap}
                  onNavigate={(slug) => navigate('person', { slug })}
                />

                {/* Escalation alerts — acoes do gestor pendentes */}
                {escalations.length > 0 && (
                  <div style={{
                    marginBottom: 16,
                    background: 'rgba(200,100,80,0.05)',
                    border: '1px solid rgba(200,100,80,0.2)',
                    borderRadius: 'var(--r)',
                    padding: '10px 16px',
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(200,100,80,0.9)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Acoes do gestor pendentes
                    </div>
                    {escalations.map((esc, i) => (
                      <div key={i} style={{ padding: '4px 0', fontSize: 12, color: 'var(--text-primary)', borderBottom: i < escalations.length - 1 ? '1px solid rgba(200,100,80,0.1)' : 'none' }}>
                        <span style={{ color: 'var(--red)', fontWeight: 500 }}>{esc.diasPendente}d</span>
                        {' — '}
                        <span style={{ cursor: 'pointer' }} onClick={() => navigate('person', { slug: esc.slug })}>
                          {esc.nome}
                        </span>
                        {': '}{(esc.gestorAction.descricao ?? esc.gestorAction.texto).slice(0, 80)}
                        {esc.relatedCount > 0 && (
                          <span style={{ color: 'var(--text-muted)', fontSize: 10.5 }}> ({esc.relatedCount} acoes relacionadas)</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Cross-team insights panel */}
                {relacao === 'liderado' && crossTeamInsights.length > 0 && (
                  <CrossTeamInsightsPanel insights={crossTeamInsights} />
                )}

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 10,
                }}>
                  {people.map((p) => (
                    <PersonCard
                      key={p.slug}
                      person={p}
                      perfil={perfis[p.slug] ?? {}}
                      actions={actionsMap[p.slug] ?? []}
                      onViewCockpit={() => navigate('person', { slug: p.slug })}
                      onEdit={() => navigate('person-form', { slug: p.slug })}
                    />
                  ))}
                </div>
              </>
            ) : null}

            {/* Detected (unregistered) people */}
            {detected.length > 0 && (
              <div style={{ marginTop: people.length > 0 ? 32 : 0 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
                }}>
                  <div style={{
                    fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
                    textTransform: 'uppercase' as const, color: 'var(--text-muted)',
                  }}>
                    Detectadas nos artefatos
                  </div>
                  <span style={{
                    fontSize: 10, padding: '1px 6px', borderRadius: 20,
                    background: 'rgba(192,135,58,0.1)', border: '1px solid rgba(192,135,58,0.25)',
                    color: 'var(--accent)', fontFamily: 'var(--font-mono)',
                  }}>
                    {detected.length}
                  </span>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>
                    — {meta.detectedLabel}
                  </div>
                </div>
                <div style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 'var(--r)', overflow: 'hidden',
                }}>
                  {detected.map((p, i) => (
                    <DetectedRow
                      key={p.slug}
                      person={p}
                      isLast={i === detected.length - 1}
                      onRegister={() => navigate('person-form', { prefillSlug: p.slug, prefillNome: p.nome, defaultRelacao: relacao })}
                      onDismiss={() => handleDismissDetected(p.slug)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function CrossTeamInsightsPanel({ insights }: {
  insights: Array<{ tipo: string; descricao: string; pessoas: string[]; severidade: 'alta' | 'media' | 'baixa' }>
}) {
  const severityColor: Record<string, string> = {
    alta: 'var(--red)',
    media: 'var(--yellow, #d4a843)',
    baixa: 'var(--text-muted)',
  }

  return (
    <div style={{
      marginBottom: 24,
      background: 'rgba(100,120,200,0.05)',
      border: '1px solid rgba(100,120,200,0.2)',
      borderRadius: 'var(--r)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid rgba(100,120,200,0.15)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <TrendingUp size={12} color="rgba(100,120,200,0.8)" />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(100,120,200,0.9)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Insights do time
        </span>
        <span style={{
          fontSize: 10, padding: '1px 6px', borderRadius: 20,
          background: 'rgba(100,120,200,0.1)', color: 'rgba(100,120,200,0.9)',
          fontFamily: 'var(--font-mono)',
        }}>
          {insights.length}
        </span>
      </div>
      <div style={{ padding: '8px 16px' }}>
        {insights.map((insight, i) => (
          <div key={i} style={{
            padding: '6px 0',
            borderBottom: i < insights.length - 1 ? '1px solid rgba(100,120,200,0.1)' : 'none',
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: severityColor[insight.severidade],
              flexShrink: 0, marginTop: 5,
            }} />
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{insight.descricao}</div>
              {insight.pessoas.length > 0 && (
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
                  {insight.pessoas.join(', ')}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function calc1on1Alert(perfil: Partial<PerfilFrontmatter>, frequenciaDias: number, relacao?: string): { label: string; urgent: boolean } | null {
  if (relacao !== 'liderado') return null
  if (!perfil.ultimo_1on1) return null
  const daysSince = Math.floor((Date.now() - new Date(perfil.ultimo_1on1).getTime()) / 86_400_000)
  const daysLate  = daysSince - frequenciaDias
  if (daysLate <= 0) return null
  return { label: `há ${daysSince}d sem 1:1`, urgent: daysLate > frequenciaDias }
}

function PersonCard({
  person,
  perfil,
  actions,
  onViewCockpit,
  onEdit,
}: {
  person: PersonConfig
  perfil: Partial<PerfilFrontmatter>
  actions: Action[]
  onViewCockpit: () => void
  onEdit: () => void
}) {
  const healthColor = {
    verde:    'var(--green)',
    amarelo:  'var(--yellow, #d4a843)',
    vermelho: 'var(--red)',
  }[perfil.saude ?? ''] ?? 'var(--surface-3)'

  const lastUpdate = perfil.ultima_ingestao ?? perfil.ultima_atualizacao
  const diasSinceUpdate = lastUpdate
    ? Math.floor((Date.now() - new Date(lastUpdate).getTime()) / 86_400_000)
    : null
  const healthStale = diasSinceUpdate != null && diasSinceUpdate > 14

  const today = new Date().toISOString().slice(0, 10)
  const overdueActions = actions.filter(
    (a) => a.status === 'open' && a.prazo != null && a.prazo < today
  )

  const alert1on1  = calc1on1Alert(perfil, person.frequencia_1on1_dias, person.relacao)
  const alertColor = alert1on1?.urgent
    ? { text: 'var(--red)', bg: 'rgba(184,64,64,0.1)', border: 'rgba(184,64,64,0.3)' }
    : { text: 'var(--yellow, #d4a843)', bg: 'rgba(212,168,67,0.1)', border: 'rgba(212,168,67,0.3)' }

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r)',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Left border — health indicator */}
      <div
        title={diasSinceUpdate != null ? `Dados de ${diasSinceUpdate}d atrás` : undefined}
        style={{
          position: 'absolute', top: 0, left: 0, width: 3, height: '100%',
          background: healthColor,
          opacity: healthStale ? 0.45 : 1,
          transition: 'background 0.3s ease, opacity 0.3s ease',
        }}
      />

      {/* Card header */}
      <div style={{ padding: '14px 14px 12px 18px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
            {person.nome}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            {person.cargo}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            <LevelBadge nivel={person.nivel} />
            {person.squad && (
              <span style={{
                fontSize: 10, fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)', padding: '2px 6px',
                background: 'var(--surface-2)', border: '1px solid var(--border-subtle)',
                borderRadius: 3,
              }}>
                # {person.squad}
              </span>
            )}
          </div>
        </div>
        <RelacaoBadge relacao={person.relacao} />
      </div>

      {/* Stats row */}
      {perfil.total_artefatos != null && (
        <div style={{ padding: '6px 18px 8px', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <Stat label="artefatos" value={String(perfil.total_artefatos)} />
          {perfil.acoes_pendentes_count != null && perfil.acoes_pendentes_count > 0 && (
            <Stat label="ações" value={String(perfil.acoes_pendentes_count)} alert />
          )}
          {perfil.ultimo_1on1 && <Stat label="último 1:1" value={fmtDate(perfil.ultimo_1on1)} mono />}
          {alert1on1 && (
            <span style={{
              fontSize: 10, fontWeight: 600,
              padding: '2px 7px', borderRadius: 20,
              background: alertColor.bg,
              border: `1px solid ${alertColor.border}`,
              color: alertColor.text,
              alignSelf: 'center',
            }}>
              {alert1on1.label}
            </span>
          )}
          {perfil.necessita_1on1 && !perfil.dados_stale && person.relacao === 'liderado' && (
            <span
              title={perfil.motivo_1on1 ?? '1:1 necessário'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 10, fontWeight: 600,
                padding: '2px 7px', borderRadius: 20,
                background: 'rgba(192,135,58,0.1)',
                border: '1px solid rgba(192,135,58,0.3)',
                color: 'var(--accent)',
                alignSelf: 'center', cursor: 'default',
              }}
            >
              <AlertCircle size={9} />
              1:1
            </span>
          )}
          {/* Ações vencidas (abertas há > 14 dias) */}
          {overdueActions.length > 0 && (
            <span
              title={`${overdueActions.length} ação${overdueActions.length > 1 ? 'ões' : ''} em aberto há mais de 14 dias`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 10, fontWeight: 600,
                padding: '2px 7px', borderRadius: 20,
                background: 'rgba(184,64,64,0.1)',
                border: '1px solid rgba(184,64,64,0.3)',
                color: 'var(--red)',
                alignSelf: 'center', cursor: 'default',
              }}
            >
              {overdueActions.length} ação{overdueActions.length > 1 ? 'ões' : ''} vencida{overdueActions.length > 1 ? 's' : ''}
            </span>
          )}
          {/* Negligência: no updates in 30+ days */}
          {perfil.ultima_atualizacao && daysSince(perfil.ultima_atualizacao) > 30 && (
            <span
              title={`Sem atividade há ${daysSince(perfil.ultima_atualizacao)} dias`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 10, fontWeight: 600,
                padding: '2px 7px', borderRadius: 20,
                background: 'rgba(100,120,160,0.1)',
                border: '1px solid rgba(100,120,160,0.3)',
                color: 'var(--text-muted)',
                alignSelf: 'center', cursor: 'default',
              }}
            >
              {daysSince(perfil.ultima_atualizacao)}d sem atividade
            </span>
          )}
          {/* Estagnação */}
          {perfil.alerta_estagnacao && (
            <span
              title={perfil.motivo_estagnacao ?? 'Sinal de estagnação detectado'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 10, fontWeight: 600,
                padding: '2px 7px', borderRadius: 20,
                background: 'rgba(180,100,40,0.1)',
                border: '1px solid rgba(180,100,40,0.3)',
                color: '#b46428',
                alignSelf: 'center', cursor: 'default',
              }}
            >
              <TrendingDown size={9} />
              estagnação
            </span>
          )}
          {/* Evolução comprovada */}
          {perfil.sinal_evolucao && (
            <span
              title={perfil.evidencia_evolucao ?? 'Sinal de evolução detectado'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 10, fontWeight: 600,
                padding: '2px 7px', borderRadius: 20,
                background: 'rgba(40,140,80,0.1)',
                border: '1px solid rgba(40,140,80,0.3)',
                color: 'var(--green)',
                alignSelf: 'center', cursor: 'default',
              }}
            >
              <TrendingUp size={9} />
              evolução
            </span>
          )}
          {/* Tendência emocional */}
          {(perfil as Record<string, unknown>).tendencia_emocional === 'deteriorando' && (
            <span
              title={(perfil as Record<string, unknown>).nota_tendencia as string ?? 'Tendência emocional em declínio'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 10, fontWeight: 600,
                padding: '2px 7px', borderRadius: 20,
                background: 'rgba(184,64,64,0.1)',
                border: '1px solid rgba(184,64,64,0.3)',
                color: 'var(--red)',
                alignSelf: 'center', cursor: 'help',
              }}
            >
              ↓ deteriorando
            </span>
          )}
          {(perfil as Record<string, unknown>).tendencia_emocional === 'melhorando' && (
            <span
              title={(perfil as Record<string, unknown>).nota_tendencia as string ?? 'Tendência emocional positiva'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 10, fontWeight: 600,
                padding: '2px 7px', borderRadius: 20,
                background: 'rgba(40,140,80,0.1)',
                border: '1px solid rgba(40,140,80,0.3)',
                color: 'var(--green)',
                alignSelf: 'center', cursor: 'help',
              }}
            >
              ↑ melhorando
            </span>
          )}
          {/* Sugestão de ingestão direta (ceremony-only profiles) */}
          {(perfil as Record<string, unknown>).sugestao_ingestao && (
            <span
              title={(perfil as Record<string, unknown>).sugestao_ingestao as string}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 10, fontWeight: 600,
                padding: '2px 7px', borderRadius: 20,
                background: 'rgba(100,140,200,0.1)',
                border: '1px solid rgba(100,140,200,0.3)',
                color: 'var(--text-secondary)',
                alignSelf: 'center', cursor: 'help',
              }}
            >
              sem ingestão direta
            </span>
          )}
        </div>
      )}

      <div style={{ marginTop: 'auto' }}>
      <div style={{ height: 1, background: 'var(--border-subtle)', margin: '0 14px 0 18px' }} />

      {/* Actions */}
      <div style={{ padding: '9px 8px 11px 10px', display: 'flex', gap: 6 }}>
        <button onClick={onViewCockpit} style={styles.btnGhost}>
          <ChevronRight size={12} />
          Ver cockpit
        </button>
        <button onClick={onEdit} style={{ ...styles.btnSecondary, marginLeft: 'auto' }}>
          <Pencil size={12} />
          Editar
        </button>
      </div>
      </div>
    </div>
  )
}

function Stat({ label, value, mono, alert }: { label: string; value: string; mono?: boolean; alert?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{
        fontSize: mono ? 10 : 11.5, fontWeight: 600,
        color: alert ? 'var(--red)' : 'var(--text-primary)',
        fontFamily: mono ? 'var(--font-mono)' : undefined,
      }}>
        {value}
      </span>
      <span style={{ fontSize: 9.5, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
        {label}
      </span>
    </div>
  )
}

function LevelBadge({ nivel }: { nivel: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 20,
      background: 'var(--blue-dim, rgba(64,128,168,0.12))',
      color: 'var(--blue)',
      border: '1px solid rgba(64,128,168,0.2)',
    }}>
      {labelNivel(nivel)}
    </span>
  )
}

function RelacaoBadge({ relacao }: { relacao: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 20,
      background: 'var(--surface-2)', color: 'var(--text-secondary)',
      border: '1px solid var(--border)', whiteSpace: 'nowrap',
    }}>
      {labelRelacao(relacao)}
    </span>
  )
}

function DetectedRow({
  person, isLast, onRegister, onDismiss,
}: {
  person: DetectedPerson
  isLast: boolean
  onRegister: () => void
  onDismiss: () => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 16px',
      borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
            {person.nome || person.slug}
          </span>
          <span style={{
            fontSize: 10, fontFamily: 'var(--font-mono)',
            color: 'var(--text-muted)', padding: '1px 5px',
            background: 'var(--surface-2)', borderRadius: 3,
          }}>
            {person.slug}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
          {person.mentionCount}× mencionada
          {person.sourceFiles.length > 0 && ` · ${person.sourceFiles[person.sourceFiles.length - 1]}`}
        </div>
      </div>
      <button onClick={onRegister} style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '5px 10px', borderRadius: 5, border: 'none',
        background: 'rgba(192,135,58,0.12)', color: 'var(--accent)',
        fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
        fontFamily: 'var(--font)',
      }}>
        <UserCheck size={11} /> Adicionar ao time
      </button>
      <button onClick={onDismiss} style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 24, height: 24, borderRadius: 5, border: '1px solid var(--border)',
        background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
        flexShrink: 0,
      }}>
        <X size={11} />
      </button>
    </div>
  )
}

// ─── T-R10.1 — Urgências do dia ───────────────────────────────
type UrgenciaItem = { slug: string; nome: string; tipo: '1on1' | 'acao' | 'alerta'; label: string }

function UrgenciasHoje({
  urgencias,
  onNavigate,
}: {
  urgencias: UrgenciaItem[]
  onNavigate: (slug: string) => void
}) {
  const visible = urgencias.slice(0, 5)
  const hidden = urgencias.length - visible.length
  const tipoColor: Record<UrgenciaItem['tipo'], string> = {
    '1on1':   'rgba(100,120,200,0.18)',
    'acao':   'rgba(192,135,58,0.18)',
    'alerta': 'rgba(184,64,64,0.18)',
  }
  const tipoLabel: Record<UrgenciaItem['tipo'], string> = {
    '1on1':   '1:1',
    'acao':   'ação',
    'alerta': 'risco',
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6,
      }}>
        Hoje
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {visible.map((u, i) => (
          <button
            key={i}
            onClick={() => onNavigate(u.slug)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 20,
              background: tipoColor[u.tipo], border: 'none',
              cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)',
              maxWidth: 280,
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 11, flexShrink: 0 }}>{u.nome}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 10, flexShrink: 0 }}>· {tipoLabel[u.tipo]}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.label}</span>
          </button>
        ))}
        {hidden > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>
            +{hidden} mais
          </span>
        )}
      </div>
    </div>
  )
}

// ─── T4.4 — Team Risk Panel ───────────────────────────────────
type RiskItem = { slug: string; nome: string; cargo: string; motivos: string[] }

function TeamRiskPanel({
  people,
  perfis,
  actionsMap,
  onNavigate,
}: {
  people: PersonConfig[]
  perfis: Record<string, Partial<PerfilFrontmatter>>
  actionsMap: Record<string, Action[]>
  onNavigate: (slug: string) => void
}) {
  const today = new Date().toISOString().slice(0, 10)

  const atRisk: RiskItem[] = people
    .map((p) => {
      const fm = perfis[p.slug] ?? {}
      const actions = actionsMap[p.slug] ?? []
      const motivos: string[] = []

      if (fm.dados_stale) {
        motivos.push('sem dados há 30+ dias')
        return { slug: p.slug, nome: p.nome, cargo: p.cargo, motivos }
      }

      if (fm.saude === 'vermelho') motivos.push('saúde vermelho')
      if (fm.necessita_1on1)       motivos.push('1:1 urgente')

      // T4.1: 1:1 frequency alert (only for liderados — par/gestor 1:1 is not mandatory)
      if (p.relacao === 'liderado') {
        if (fm.ultimo_1on1) {
          const dias = Math.floor((Date.now() - new Date(fm.ultimo_1on1).getTime()) / 86_400_000)
          if (dias > (p.frequencia_1on1_dias + 3)) motivos.push(`sem 1:1 há ${dias}d`)
        } else {
          motivos.push('nunca teve 1:1')
        }
      }

      // T4.3: overdue actions (with deadline)
      const vencidas = actions.filter((a) => a.status === 'open' && a.prazo && a.prazo < today)
      if (vencidas.length > 0) motivos.push(`${vencidas.length} ação${vencidas.length > 1 ? 'ões' : ''} vencida${vencidas.length > 1 ? 's' : ''}`)

      if (fm.alerta_estagnacao) motivos.push('estagnação detectada')

      // V2 risk triggers
      // Ações com risco de abandono (2+ ciclos sem menção)
      const abandonoRisk = actions.filter((a) => a.status === 'open' && ((a as Record<string, unknown>).ciclos_sem_mencao as number ?? 0) >= 2)
      if (abandonoRisk.length > 0) motivos.push(`${abandonoRisk.length} ação${abandonoRisk.length > 1 ? 'ões' : ''} risco abandono`)

      // Tendência emocional deteriorando
      if ((fm as Record<string, unknown>).tendencia_emocional === 'deteriorando') motivos.push('tendência deteriorando')

      // Promessa do gestor pendente há 14+ dias
      const gestorPendentes = actions.filter((a) => a.owner === 'gestor' && a.status === 'open' && a.criadoEm)
      const gestorVencidas = gestorPendentes.filter((a) => {
        const dias = Math.floor((Date.now() - new Date(a.criadoEm).getTime()) / 86_400_000)
        return dias >= 14
      })
      if (gestorVencidas.length > 0) motivos.push(`${gestorVencidas.length} promessa${gestorVencidas.length > 1 ? 's' : ''} do gestor 14d+`)

      // Risco composto: 3+ sinais negativos simultâneos (já acima)
      // Este é implícito — se motivos.length >= 3, o badge count já sinaliza

      return { slug: p.slug, nome: p.nome, cargo: p.cargo, motivos }
    })
    .filter((r) => r.motivos.length > 0)
    .sort((a, b) => b.motivos.length - a.motivos.length)

  if (atRisk.length === 0) return null

  return (
    <div style={{
      marginBottom: 24,
      background: 'rgba(184,64,64,0.05)',
      border: '1px solid rgba(184,64,64,0.2)',
      borderRadius: 'var(--r)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid rgba(184,64,64,0.15)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <AlertCircle size={12} color="var(--red)" />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--red)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Atenção necessária
        </span>
        <span style={{
          fontSize: 10, padding: '1px 6px', borderRadius: 20,
          background: 'rgba(184,64,64,0.15)', color: 'var(--red)',
          fontFamily: 'var(--font-mono)',
        }}>
          {atRisk.length}
        </span>
      </div>
      <div style={{ padding: '8px 0' }}>
        {atRisk.map((r) => (
          <button
            key={r.slug}
            onClick={() => onNavigate(r.slug)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              width: '100%', padding: '7px 16px',
              background: 'transparent', border: 'none', cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{ minWidth: 120 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{r.nome}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{r.cargo}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {r.motivos.map((m) => (
                <span key={m} style={{
                  fontSize: 10, padding: '2px 7px', borderRadius: 20,
                  background: 'rgba(184,64,64,0.08)',
                  border: '1px solid rgba(184,64,64,0.25)',
                  color: 'var(--red)', fontWeight: 500,
                }}>
                  {m}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 40px' }}>
      <div style={{
        fontFamily: 'var(--font)',
        fontSize: 22, fontWeight: 600,
        color: 'var(--text-secondary)', marginBottom: 8, letterSpacing: '-0.02em',
      }}>
        Time vazio
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.6 }}>
        Adicione manualmente ou jogue artefatos no Inbox —<br />o Claude detectará as pessoas automaticamente.
      </div>
      <button onClick={onAdd} style={styles.btnPrimary}>
        <UserPlus size={13} />
        Adicionar pessoa manualmente
      </button>
    </div>
  )
}

// ─── Shared styles ────────────────────────────────────────────
const styles = {
  eyebrow: {
    fontSize: 10, fontWeight: 600,
    letterSpacing: '0.1em', textTransform: 'uppercase' as const,
    color: 'var(--text-muted)', marginBottom: 4,
  },
  pageTitle: {
    fontFamily: 'var(--font)',
    fontSize: 24, fontWeight: 700,
    color: 'var(--text-primary)', letterSpacing: '-0.025em', lineHeight: 1.1,
  },
  pageSub: { fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 },
  btnPrimary: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', borderRadius: 'var(--r)', border: 'none',
    background: 'var(--accent)', color: '#09090c',
    fontSize: 13, fontFamily: 'var(--font)', fontWeight: 600,
    cursor: 'pointer',
  } as React.CSSProperties,
  btnSecondary: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 10px', borderRadius: 'var(--r-sm)',
    background: 'var(--surface-2)', color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    fontSize: 12, fontFamily: 'var(--font)', fontWeight: 500,
    cursor: 'pointer', justifyContent: 'center' as const,
  } as React.CSSProperties,
  btnGhost: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '6px 10px', borderRadius: 'var(--r-sm)',
    background: 'transparent', color: 'var(--text-secondary)',
    border: '1px solid transparent',
    fontSize: 12, fontFamily: 'var(--font)', fontWeight: 500,
    cursor: 'pointer', justifyContent: 'flex-start' as const,
  } as React.CSSProperties,
}

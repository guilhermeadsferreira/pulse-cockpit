import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, FileText, CalendarDays, CalendarCheck, Pencil, ExternalLink, RefreshCw, Loader2, CheckSquare, Square, X, Plus, ArrowUpRight, Trash2, Sparkles } from 'lucide-react'
import { useRouter } from '../router'
import type { PersonConfig, PerfilData, ArtifactMeta, PautaMeta, AgendaResult, Action, ActionOwner, Demanda, PDIItem } from '../types/ipc'
import { MarkdownPreview } from '../components/MarkdownPreview'
import { labelNivel, labelRelacao, labelSaude, labelTipo, fmtDate as fmtDateUtil } from '../lib/utils'
import { CycleTab } from './CycleReportView'
import { ExternalDataCard } from '../components/ExternalDataCard'

// Styles declared at module top level so all sub-components can access them safely
const styles = {
  backBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    fontSize: 12, color: 'var(--text-secondary)',
    background: 'none', border: 'none', cursor: 'pointer',
    marginBottom: 6, padding: '4px 0', fontFamily: 'var(--font)',
  } as React.CSSProperties,
  pageTitle: {
    fontFamily: 'var(--font)',
    fontSize: 24, fontWeight: 700,
    color: 'var(--text-primary)', letterSpacing: '-0.025em', lineHeight: 1.1,
  } as React.CSSProperties,
  btnPrimary: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', borderRadius: 6, border: 'none',
    background: 'var(--accent)', color: '#09090c',
    fontSize: 13, fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer',
  } as React.CSSProperties,
  btnSecondary: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 12px', borderRadius: 6,
    background: 'var(--surface-2)', color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    fontSize: 13, fontFamily: 'var(--font)', fontWeight: 500, cursor: 'pointer',
  } as React.CSSProperties,
  btnDanger: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 12px', borderRadius: 6,
    background: 'transparent', color: '#ef4444',
    border: '1px solid #3f3f46',
    fontSize: 13, fontFamily: 'var(--font)', fontWeight: 500, cursor: 'pointer',
  } as React.CSSProperties,
  btnIcon: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 28, borderRadius: 6,
    background: 'var(--surface-2)', color: 'var(--text-secondary)',
    border: '1px solid var(--border)', cursor: 'pointer',
  } as React.CSSProperties,
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const parts = iso.split('-')
  if (parts.length !== 3) return iso
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

export function PersonView() {
  const { params, navigate, goBack } = useRouter()
  const [person,        setPerson]        = useState<PersonConfig | null>(null)
  const [perfil,        setPerfil]        = useState<PerfilData | null>(null)
  const [artifacts,     setArtifacts]     = useState<ArtifactMeta[]>([])
  const [pautas,        setPautas]        = useState<PautaMeta[]>([])
  const [activeTab,     setActiveTab]     = useState<'perfil' | 'artefatos' | 'pautas' | 'acoes' | 'ciclo' | 'dados-ext'>('perfil')
  const [actions,       setActions]       = useState<Action[]>([])
  const [gestorDemandas, setGestorDemandas] = useState<Demanda[]>([])
  const [resumoRH,      setResumoRH]      = useState<{ resumo: string; date: string | null } | null>(null)
  const [generatingAgenda, setGeneratingAgenda] = useState(false)
  const [agendaError,   setAgendaError]   = useState<string | null>(null)
  const [generatingSynthesis, setGeneratingSynthesis] = useState(false)
  const [resetting,     setResetting]     = useState(false)
  const [prep1on1Mode,  setPrep1on1Mode]  = useState(false)
  const [lastPautaContent, setLastPautaContent] = useState<string | null>(null)

  async function handleResetData() {
    if (!person) return
    if (!confirm(`Limpar todos os dados gerados de "${person.nome}"?\n\nIsso remove: perfil.md, ações, histórico e pautas. O cadastro da pessoa é preservado.`)) return
    setResetting(true)
    try {
      await window.api.ingestion.resetPersonData(person.slug)
      await loadPerfil(person.slug)
      setActiveTab('perfil')
    } finally {
      setResetting(false)
    }
  }

  const loadPerfil = useCallback(async (slug: string) => {
    const [p, a] = await Promise.all([
      window.api.people.getPerfil(slug),
      window.api.artifacts.list(slug),
    ])
    setPerfil(p)
    setArtifacts(a)
  }, [])

  const loadPautas = useCallback(async (slug: string) => {
    const p = await window.api.people.listPautas(slug)
    setPautas(p)
  }, [])

  const loadActions = useCallback(async (slug: string) => {
    const a = await window.api.actions.list(slug)
    setActions(a)
  }, [])

  const loadGestorDemandas = useCallback(async (slug: string) => {
    try {
      const d = await window.api.eu.listDemandasByPerson(slug)
      setGestorDemandas(d ?? [])
    } catch {
      // graceful: feature may not exist yet in older builds
    }
  }, [])

  const loadResumoRH = useCallback(async (slug: string) => {
    try {
      const r = await window.api.people.lastResumoRH(slug)
      setResumoRH(r)
    } catch {
      // graceful
    }
  }, [])

  useEffect(() => {
    window.api.people.get(params.slug).then(setPerson)
    loadPerfil(params.slug)
    loadPautas(params.slug)
    loadActions(params.slug)
    loadGestorDemandas(params.slug)
    loadResumoRH(params.slug)
    // Deep-link: open specific tab if passed via navigate params
    const validTabs = ['perfil', 'artefatos', 'pautas', 'acoes', 'ciclo', 'dados-ext'] as const
    if (params.tab && (validTabs as readonly string[]).includes(params.tab)) {
      setActiveTab(params.tab as typeof validTabs[number])
    }
  }, [params.slug, loadPerfil, loadPautas, loadActions, loadGestorDemandas, loadResumoRH])

  // Refresh on ingestion completed
  useEffect(() => {
    window.api.ingestion.onCompleted(() => {
      loadPerfil(params.slug)
      loadActions(params.slug)
    })
    return () => window.api.ingestion.removeListeners()
  }, [params.slug, loadPerfil, loadActions])

  // Load last pauta content when prep mode activates
  useEffect(() => {
    if (prep1on1Mode && pautas.length > 0 && lastPautaContent === null) {
      window.api.artifacts.read(pautas[0].path).then(setLastPautaContent).catch(() => {})
    }
  }, [prep1on1Mode, pautas, lastPautaContent])

  async function handleGenerateAgenda() {
    if (!person) return
    setGeneratingAgenda(true)
    setAgendaError(null)
    try {
      const res = await window.api.ai.generateAgenda(person.slug) as AgendaResult
      if (res.success) {
        await loadPautas(person.slug)
        setActiveTab('pautas')
      } else {
        setAgendaError(res.error ?? 'Erro desconhecido.')
      }
    } catch (e: unknown) {
      setAgendaError(e instanceof Error ? e.message : 'Erro ao gerar pauta.')
    } finally {
      setGeneratingAgenda(false)
    }
  }

  async function handleGenerateSynthesis() {
    if (!person) return
    setGeneratingSynthesis(true)
    try {
      await window.api.brain.runWeeklySynthesis(person.slug)
      await loadPerfil(person.slug)
    } catch { /* silent */ } finally {
      setGeneratingSynthesis(false)
    }
  }

  if (!person) {
    return <div style={{ padding: '40px', color: 'var(--text-muted)', fontSize: 13 }}>Carregando…</div>
  }

  const fm = perfil?.frontmatter
  const saude = fm?.saude ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '28px 40px 22px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      }}>
        <div>
          <button onClick={goBack} style={styles.backBtn}><ArrowLeft size={12} /> Time</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={styles.pageTitle}>{person.nome}</h1>
            {saude && <HealthDot saude={saude} />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <Badge>{labelNivel(person.nivel)}</Badge>
            <Badge>{labelRelacao(person.relacao)}</Badge>
            {person.squad && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{person.squad}</span>}
            {fm?.total_artefatos != null && (
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {fm.total_artefatos} artefato{fm.total_artefatos !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => loadPerfil(params.slug)} style={styles.btnSecondary}>
            <RefreshCw size={12} />
          </button>
          <button onClick={() => navigate('person-form', { slug: person.slug })} style={styles.btnSecondary}>
            <Pencil size={12} /> Editar
          </button>
          <button
            onClick={() => setPrep1on1Mode(v => !v)}
            style={prep1on1Mode ? {
              ...styles.btnSecondary,
              background: 'rgba(100,120,200,0.12)',
              color: 'rgba(100,120,200,0.9)',
              borderColor: 'rgba(100,120,200,0.35)',
            } : styles.btnSecondary}
          >
            <CalendarCheck size={12} />
            {prep1on1Mode ? 'Sair' : 'Preparar 1:1'}
          </button>
          <button
            onClick={handleGenerateAgenda}
            disabled={generatingAgenda || !perfil}
            style={{
              ...styles.btnSecondary,
              opacity: (!perfil) ? 0.45 : 1,
              cursor: (!perfil) ? 'not-allowed' : 'pointer',
            }}
          >
            {generatingAgenda ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <CalendarDays size={12} />}
            {generatingAgenda ? 'Gerando…' : 'Gerar pauta'}
          </button>
          <button
            onClick={handleGenerateSynthesis}
            disabled={generatingSynthesis || !perfil}
            style={{
              ...styles.btnSecondary,
              opacity: (!perfil) ? 0.45 : 1,
              cursor: (!perfil) ? 'not-allowed' : 'pointer',
            }}
          >
            {generatingSynthesis ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={12} />}
            {generatingSynthesis ? 'Gerando…' : 'Síntese'}
          </button>
          <button
            onClick={() => setActiveTab('ciclo')}
            style={styles.btnPrimary}
          >
            <FileText size={12} /> Relatório de Ciclo
          </button>
          <button
            onClick={handleResetData}
            disabled={resetting}
            style={styles.btnDanger}
            title="Limpar dados gerados (perfil, ações, histórico, pautas)"
          >
            {resetting ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={12} />}
            {resetting ? 'Limpando…' : 'Limpar dados'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 40px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '268px 1fr', gap: 22 }}>

            {/* Left sidebar */}
            <div>
              <InfoCard title="Identificação">
                <InfoRow label="Cargo"   value={person.cargo} />
                <InfoRow label="Nível"   value={labelNivel(person.nivel)} />
                {person.area  && <InfoRow label="Área"   value={person.area} />}
                {person.squad && <InfoRow label="Squad"  value={person.squad} />}
                <InfoRow label="Relação" value={labelRelacao(person.relacao)} />
              </InfoCard>

              <InfoCard title="1:1">
                <InfoRow label="Frequência"  value={`${person.frequencia_1on1_dias} dias`} />
                <InfoRow label="Promoção"    value={person.em_processo_promocao ? 'Ativo' : 'Não ativo'} />
                {fm?.ultimo_1on1 && <InfoRow label="Último 1:1" value={fmtDate(fm.ultimo_1on1)} mono />}
                {person.inicio_na_funcao && <InfoRow label="Na função desde" value={fmtDate(person.inicio_na_funcao)} mono />}
              </InfoCard>

              {fm && (
                <InfoCard title="Saúde">
                  <InfoRow
                    label="Indicador"
                    value={fm.saude ? labelSaude(fm.saude) : '—'}
                    suffix={fm.ultima_confianca === 'baixa' ? (
                      <span title="Baseado em artefato com evidência limitada (curto, ambíguo ou fragmentado)" style={{
                        fontSize: 9.5, fontWeight: 600, letterSpacing: '0.04em',
                        padding: '1px 5px', borderRadius: 3,
                        background: 'rgba(232,135,58,0.12)', border: '1px solid rgba(232,135,58,0.35)',
                        color: '#e8873a', whiteSpace: 'nowrap', cursor: 'help',
                      }}>
                        evidência limitada
                      </span>
                    ) : undefined}
                  />
                  <InfoRow label="Ações pendentes" value={String(fm.acoes_pendentes_count ?? 0)} />
                  <InfoRow label="Total artefatos" value={String(fm.total_artefatos ?? 0)} />
                  {fm.tendencia_emocional && (
                    <InfoRow
                      label="Tendência"
                      value={({
                        estavel: '→ Estável',
                        melhorando: '↑ Melhorando',
                        deteriorando: '↓ Deteriorando',
                        novo_sinal: '⚡ Novo sinal',
                      } as Record<string, string>)[fm.tendencia_emocional] ?? fm.tendencia_emocional}
                      suffix={fm.nota_tendencia ? (
                        <span title={fm.nota_tendencia} style={{
                          fontSize: 9.5, fontWeight: 600, letterSpacing: '0.04em',
                          padding: '1px 5px', borderRadius: 3,
                          background: fm.tendencia_emocional === 'deteriorando'
                            ? 'rgba(184,64,64,0.12)' : fm.tendencia_emocional === 'melhorando'
                            ? 'rgba(100,180,100,0.12)' : 'rgba(255,255,255,0.06)',
                          border: `1px solid ${fm.tendencia_emocional === 'deteriorando'
                            ? 'rgba(184,64,64,0.35)' : fm.tendencia_emocional === 'melhorando'
                            ? 'rgba(100,180,100,0.35)' : 'rgba(255,255,255,0.12)'}`,
                          color: fm.tendencia_emocional === 'deteriorando'
                            ? 'var(--red)' : fm.tendencia_emocional === 'melhorando'
                            ? 'var(--green)' : 'var(--text-secondary)',
                          whiteSpace: 'nowrap', cursor: 'help', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {fm.nota_tendencia}
                        </span>
                      ) : undefined}
                    />
                  )}
                </InfoCard>
              )}

              {person.notas_manuais && (
                <InfoCard title="Notas do gestor">
                  <p style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {person.notas_manuais}
                  </p>
                </InfoCard>
              )}

              {gestorDemandas.length > 0 && (
                <InfoCard title={`Minhas promessas (${gestorDemandas.length})`}>
                  <div style={{ padding: '6px 12px 10px' }}>
                    {gestorDemandas.map((d) => {
                      const diasAberto = Math.floor((Date.now() - new Date(d.criadoEm).getTime()) / 86_400_000)
                      const vencida = d.prazo && d.prazo < new Date().toISOString().slice(0, 10)
                      return (
                        <div key={d.id} style={{
                          fontSize: 11.5, lineHeight: 1.5, padding: '4px 0',
                          borderBottom: '1px solid var(--border-subtle)',
                          color: vencida ? 'var(--red)' : 'var(--text-secondary)',
                        }}>
                          <span style={{ fontWeight: 600, color: vencida ? 'var(--red)' : 'var(--text-primary)' }}>
                            {d.descricao}
                          </span>
                          <br />
                          <span style={{ fontSize: 10, opacity: 0.7 }}>
                            {diasAberto}d aberta{d.prazo ? ` · prazo: ${fmtDate(d.prazo)}` : ''}{vencida ? ' · VENCIDA' : ''}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </InfoCard>
              )}

            </div>

            {/* Right content */}
            <div>
              {prep1on1Mode ? (
                /* ── Modo Preparar 1:1 ── */
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 22 }}>
                  {/* Coluna esquerda */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {/* Delta desde último 1:1 */}
                    {fm?.ultimo_1on1 && (
                      <SinceLastMeetingCard
                        ultimo1on1={fm.ultimo_1on1}
                        artifacts={artifacts}
                        actions={actions}
                      />
                    )}

                    {/* Ações abertas do liderado */}
                    <div style={{
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 6, overflow: 'hidden',
                    }}>
                      <div style={{
                        padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)',
                        fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
                        textTransform: 'uppercase' as const, color: 'var(--text-muted)',
                      }}>
                        Ações do liderado · {actions.filter(a => a.status === 'open' && a.owner !== 'gestor').length}
                      </div>
                      <div style={{ padding: '8px 16px' }}>
                        {(() => {
                          const today = new Date().toISOString().slice(0, 10)
                          const lideradoActions = actions
                            .filter(a => a.status === 'open' && a.owner !== 'gestor')
                            .sort((a, b) => {
                              const aVenc = a.prazo && a.prazo < today
                              const bVenc = b.prazo && b.prazo < today
                              if (aVenc && !bVenc) return -1
                              if (!aVenc && bVenc) return 1
                              if (a.prazo && b.prazo) return a.prazo.localeCompare(b.prazo)
                              return 0
                            })
                          if (lideradoActions.length === 0) {
                            return <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>Nenhuma ação aberta</div>
                          }
                          return lideradoActions.map(a => {
                            const vencida = a.prazo && a.prazo < today
                            return (
                              <div key={a.id} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '6px 0',
                                borderBottom: '1px solid var(--border-subtle)',
                                fontSize: 12,
                              }}>
                                <Square size={12} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                                <span style={{ flex: 1, color: 'var(--text-primary)' }}>{a.descricao ?? a.texto}</span>
                                {a.prazo && (
                                  <span style={{
                                    fontSize: 10, fontFamily: 'var(--font-mono)', flexShrink: 0,
                                    color: vencida ? 'var(--red)' : 'var(--text-muted)',
                                    fontWeight: vencida ? 600 : 400,
                                  }}>
                                    {new Date(a.prazo + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                  </span>
                                )}
                              </div>
                            )
                          })
                        })()}
                      </div>
                    </div>

                    {/* Gerar pauta + última pauta inline */}
                    <div>
                      <button
                        onClick={handleGenerateAgenda}
                        disabled={generatingAgenda || !perfil}
                        style={{
                          ...styles.btnPrimary,
                          opacity: !perfil ? 0.45 : 1,
                          cursor: !perfil ? 'not-allowed' : 'pointer',
                          marginBottom: 14,
                        }}
                      >
                        {generatingAgenda
                          ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Gerando…</>
                          : <><CalendarDays size={12} /> Gerar pauta</>}
                      </button>

                      {agendaError && (
                        <div style={{
                          marginBottom: 14, padding: '10px 14px', borderRadius: 6,
                          background: 'var(--red-dim)', border: '1px solid rgba(184,64,64,0.3)',
                          fontSize: 12.5, color: 'var(--red)',
                        }}>
                          {agendaError}
                        </div>
                      )}

                      {pautas.length > 0 && (
                        <div style={{
                          background: 'var(--surface)', border: '1px solid var(--border)',
                          borderRadius: 6, overflow: 'hidden',
                        }}>
                          <div style={{
                            padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)',
                            fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
                            textTransform: 'uppercase' as const, color: 'var(--text-muted)',
                          }}>
                            Última pauta · {fmtDate(pautas[0].date)}
                          </div>
                          <div style={{ padding: '12px 16px' }}>
                            {lastPautaContent
                              ? <MarkdownPreview content={lastPautaContent} />
                              : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Carregando…</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Coluna direita */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {/* Dados externos */}
                    {(person.jiraEmail || person.githubUsername) ? (
                      <ExternalTab slug={person.slug} />
                    ) : (
                      <div style={{
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: 6, padding: '16px',
                        fontSize: 12, color: 'var(--text-muted)',
                      }}>
                        Jira/GitHub não configurados para esta pessoa.
                      </div>
                    )}

                    {/* Minhas promessas */}
                    {gestorDemandas.filter(d => d.status === 'open').length > 0 && (
                      <div style={{
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: 6, overflow: 'hidden',
                      }}>
                        <div style={{
                          padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)',
                          fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
                          textTransform: 'uppercase' as const, color: 'var(--text-muted)',
                        }}>
                          Minhas promessas
                        </div>
                        <div style={{ padding: '8px 16px' }}>
                          {gestorDemandas.filter(d => d.status === 'open').map(d => {
                            const today = new Date().toISOString().slice(0, 10)
                            const vencida = d.prazo && d.prazo < today
                            return (
                              <div key={d.id} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '6px 0',
                                borderBottom: '1px solid var(--border-subtle)',
                                fontSize: 12,
                              }}>
                                <span style={{
                                  flex: 1,
                                  color: vencida ? 'var(--red)' : 'var(--text-primary)',
                                  fontWeight: vencida ? 600 : 400,
                                }}>
                                  {d.descricao}
                                </span>
                                {d.prazo && (
                                  <span style={{
                                    fontSize: 10, fontFamily: 'var(--font-mono)', flexShrink: 0,
                                    color: vencida ? 'var(--red)' : 'var(--text-muted)',
                                    fontWeight: vencida ? 600 : 400,
                                  }}>
                                    {vencida ? 'VENCIDA' : new Date(d.prazo + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* ── Layout original com abas ── */
                <>
              {/* Tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 22 }}>
                {([
                  { id: 'perfil',    label: 'Perfil vivo' },
                  { id: 'artefatos', label: 'Artefatos' },
                  { id: 'pautas',    label: 'Pautas' },
                  { id: 'acoes',     label: 'Ações' },
                  { id: 'ciclo',     label: 'Relatório de Ciclo' },
                  ...(person.jiraEmail || person.githubUsername ? [{ id: 'dados-ext' as const, label: 'Dados Ext.' }] : []),
                ] as const).map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    style={{
                      padding: '9px 18px',
                      fontSize: 13.5,
                      fontWeight: activeTab === id ? 500 : 400,
                      color: activeTab === id ? 'var(--text-primary)' : 'var(--text-secondary)',
                      background: 'none', border: 'none',
                      borderBottom: activeTab === id ? '2px solid var(--accent)' : '2px solid transparent',
                      marginBottom: -1, cursor: 'pointer',
                      fontFamily: 'var(--font)',
                    }}
                  >
                    {label}
                    {id === 'artefatos' && artifacts.length > 0 && (
                      <span style={{ marginLeft: 6, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        {artifacts.length}
                      </span>
                    )}
                    {id === 'pautas' && pautas.length > 0 && (
                      <span style={{ marginLeft: 6, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        {pautas.length}
                      </span>
                    )}
                    {id === 'acoes' && actions.filter(a => a.status === 'open').length > 0 && (
                      <span style={{ marginLeft: 6, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>
                        {actions.filter(a => a.status === 'open').length}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {agendaError && (
                <div style={{
                  marginBottom: 16, padding: '10px 14px', borderRadius: 6,
                  background: 'var(--red-dim)', border: '1px solid rgba(184,64,64,0.3)',
                  fontSize: 12.5, color: 'var(--red)',
                }}>
                  {agendaError}
                </div>
              )}
              {activeTab === 'perfil'    && (
                <>
                  {fm?.ultimo_1on1 && (
                    <SinceLastMeetingCard
                      ultimo1on1={fm.ultimo_1on1}
                      artifacts={artifacts}
                      actions={actions}
                    />
                  )}
                  {person.pdi && person.pdi.length > 0 && (
                    <PDISection pdi={person.pdi} />
                  )}
                  <PerfilTab perfil={perfil} />
                  {resumoRH && (
                    <details style={{ marginTop: 18, background: 'var(--surface-2)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
                      <summary style={{
                        padding: '10px 16px', fontSize: 12, fontWeight: 600,
                        color: 'var(--text-secondary)', cursor: 'pointer',
                        fontFamily: 'var(--font)',
                      }}>
                        Resumo Executivo RH (Qulture Rocks){resumoRH.date ? ` · ${fmtDate(resumoRH.date)}` : ''}
                      </summary>
                      <div style={{ padding: '0 16px 14px' }}>
                        <MarkdownPreview content={resumoRH.resumo} />
                      </div>
                    </details>
                  )}
                </>
              )}
              {activeTab === 'artefatos' && <ArtifactsTab artifacts={artifacts} />}
              {activeTab === 'pautas'    && <PautasTab pautas={pautas} onGenerate={handleGenerateAgenda} generating={generatingAgenda} hasPerfil={!!perfil} slug={person?.slug ?? ''} />}
              {activeTab === 'acoes'     && (
                <AcoesTab
                  actions={actions}
                  personSlug={person.slug}
                  personRelacao={person.relacao}
                  personPdi={person.pdi}
                  onUpdateStatus={async (id, status) => {
                    try {
                      await window.api.actions.updateStatus(person.slug, id, status)
                      loadActions(person.slug)
                    } catch (err) {
                      window.api.logs.write('error', 'PersonView', 'updateStatus failed', { slug: person.slug, id, status })
                    }
                  }}
                  onDelete={async (id) => {
                    try {
                      await window.api.actions.delete(person.slug, id)
                      loadActions(person.slug)
                    } catch (err) {
                      window.api.logs.write('error', 'PersonView', 'delete failed', { slug: person.slug, id })
                    }
                  }}
                  onSaveAction={async (action) => {
                    await window.api.actions.save(action)
                    loadActions(person.slug)
                  }}
                  onSendToDemandas={async (action) => {
                    const t = new Date().toISOString().slice(0, 10)
                    const demanda: Demanda = {
                      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                      descricao: action.texto,
                      origem: 'Liderado',
                      prazo: action.prazo ?? null,
                      criadoEm: t,
                      atualizadoEm: t,
                      status: 'open',
                    }
                    await window.api.eu.saveDemanda(demanda)
                    window.dispatchEvent(new Event('demandas:changed'))
                  }}
                />
              )}
              {activeTab === 'ciclo'     && <CycleTab slug={person.slug} person={person} />}
              {activeTab === 'dados-ext' && <ExternalTab slug={person.slug} />}
                </>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}

// ── Perfil tab ─────────────────────────────────────────────────────────────────

function PerfilTab({ perfil }: { perfil: PerfilData | null }) {
  if (!perfil) {
    return (
      <PlaceholderTab
        icon={<FileText size={28} />}
        title="Perfil vivo"
        desc="Disponível após a primeira ingestão de artefato. Arraste um arquivo para o Inbox para começar."
        fase="Aguardando ingestão"
      />
    )
  }

  // Parse sections from raw markdown
  const sections = parsePerfilSections(perfil.raw)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {sections.resumo && (
        <PerfilSection title="Resumo Evolutivo">
          <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
            {sections.resumo}
          </p>
        </PerfilSection>
      )}

      {sections.acoes.length > 0 && (
        <PerfilSection title={`Ações Pendentes (${sections.acoes.filter(a => a.pending).length})`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sections.acoes.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '4px 0' }}>
                <span style={{
                  marginTop: 3, width: 12, height: 12, border: '1.5px solid var(--border)',
                  borderRadius: 3, flexShrink: 0,
                  background: a.pending ? 'transparent' : 'var(--accent)',
                }} />
                <span style={{ fontSize: 12.5, color: a.pending ? 'var(--text-primary)' : 'var(--text-muted)', textDecoration: a.pending ? 'none' : 'line-through' }}>
                  {a.text}
                </span>
              </div>
            ))}
          </div>
        </PerfilSection>
      )}

      {sections.atencao.length > 0 && (
        <PerfilSection title="Pontos de Atenção">
          {sections.atencao.map((item, i) => (
            <DatedItem key={i} text={item} />
          ))}
        </PerfilSection>
      )}

      {sections.conquistas.length > 0 && (
        <PerfilSection title="Conquistas e Elogios">
          {sections.conquistas.map((item, i) => (
            <DatedItem key={i} text={item} />
          ))}
        </PerfilSection>
      )}

      {sections.temas.length > 0 && (
        <PerfilSection title="Temas Recorrentes">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sections.temas.map((t, i) => (
              <span key={i} style={{
                fontSize: 11, padding: '3px 9px', borderRadius: 20,
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
              }}>
                {t}
              </span>
            ))}
          </div>
        </PerfilSection>
      )}

      {sections.resumosAnterioresRaw && (
        <details style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          <summary style={{
            padding: '10px 16px', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
            textTransform: 'uppercase' as const, color: 'var(--text-muted)', cursor: 'pointer',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            Resumos anteriores
          </summary>
          <div style={{ padding: '12px 16px' }}>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>
              {sections.resumosAnterioresRaw}
            </p>
          </div>
        </details>
      )}
    </div>
  )
}

// ── Artifacts tab ──────────────────────────────────────────────────────────────

function ArtifactsTab({ artifacts }: { artifacts: ArtifactMeta[] }) {
  if (artifacts.length === 0) {
    return (
      <PlaceholderTab
        icon={<FileText size={28} />}
        title="Artefatos"
        desc="Nenhum artefato processado ainda."
        fase="Aguardando ingestão"
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {artifacts.map((a, i) => <ArtifactCard key={i} artifact={a} />)}
    </div>
  )
}

function extractQRSummary(content: string): string | null {
  const match = content.match(/##\s*Resumo Executivo \(Qulture Rocks\)([\s\S]*?)(?=\n##\s|\s*$)/)
  return match ? match[1].trim() : null
}

function ArtifactCard({ artifact: a }: { artifact: ArtifactMeta }) {
  const [expanded, setExpanded] = useState(false)
  const [content,  setContent]  = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [copied,   setCopied]   = useState(false)

  async function toggle() {
    if (!expanded && content === null) {
      setLoading(true)
      const raw = await window.api.artifacts.read(a.path)
      // Strip YAML frontmatter for display
      setContent(raw.replace(/^---\n[\s\S]*?\n---\n\n?/, '').trim())
      setLoading(false)
    }
    setExpanded((v) => !v)
  }

  async function copyQR(text: string, e: React.MouseEvent) {
    e.stopPropagation()
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const is1on1 = a.tipo === '1on1'
  const qrSummary = is1on1 && content ? extractQRSummary(content) : null

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 6, overflow: 'hidden',
    }}>
      {/* Header row */}
      <div
        onClick={toggle}
        style={{
          padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 12,
          cursor: 'pointer',
          background: expanded ? 'var(--surface-2)' : 'transparent',
          transition: 'background 0.12s',
        }}
      >
        <span style={{
          fontSize: 9, fontWeight: 600, letterSpacing: '0.07em',
          textTransform: 'uppercase' as const,
          padding: '2px 6px', borderRadius: 20,
          background: 'var(--surface-3)', border: '1px solid var(--border)',
          color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {labelTipo(a.tipo)}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {fmtDate(a.date)}
        </span>
        <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {a.fileName}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {loading && <Loader2 size={12} style={{ color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />}
          <button
            onClick={(e) => { e.stopPropagation(); window.api.shell.open(a.path) }}
            style={{ ...styles.btnIcon, width: 24, height: 24 }}
            title="Abrir no editor"
          >
            <ExternalLink size={11} />
          </button>
          <span style={{
            fontSize: 10, color: 'var(--text-muted)', transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s', display: 'flex',
          }}>
            ▾
          </span>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && content !== null && (
        <div style={{
          padding: '16px 18px',
          borderTop: '1px solid var(--border-subtle)',
        }}>
          {qrSummary && (
            <div style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '12px 14px',
              marginBottom: 14,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 8,
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
                  textTransform: 'uppercase' as const,
                  color: 'var(--text-muted)',
                }}>
                  Resumo Executivo (Qulture Rocks)
                </span>
                <button
                  onClick={(e) => copyQR(qrSummary, e)}
                  style={{
                    ...styles.btnIcon,
                    fontSize: 11, padding: '3px 8px', width: 'auto', height: 'auto',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    color: copied ? 'var(--accent)' : 'var(--text-muted)',
                    border: '1px solid var(--border)',
                    borderRadius: 4, background: 'var(--surface-3)',
                  }}
                  title="Copiar resumo para o Qulture Rocks"
                >
                  {copied ? 'Copiado!' : 'Copiar para QR'}
                </button>
              </div>
              <pre style={{
                margin: 0, whiteSpace: 'pre-wrap', fontSize: 12,
                lineHeight: 1.6, color: 'var(--text-secondary)',
                fontFamily: 'var(--font)',
              }}>
                {qrSummary}
              </pre>
            </div>
          )}
          <MarkdownPreview content={content} maxHeight={480} />
        </div>
      )}
    </div>
  )
}

// ── Pautas tab ─────────────────────────────────────────────────────────────────

function PautasTab({
  pautas, onGenerate, generating, hasPerfil, slug,
}: {
  pautas:     PautaMeta[]
  onGenerate: () => void
  generating: boolean
  hasPerfil:  boolean
  slug:       string
}) {
  if (pautas.length === 0) {
    return (
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
        padding: '48px 32px', textAlign: 'center',
      }}>
        <div style={{ color: 'var(--text-muted)', marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
          <CalendarDays size={28} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
          Nenhuma pauta gerada
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
          {hasPerfil
            ? 'Clique em "Gerar pauta" para criar a pauta do próximo 1:1.'
            : 'Ingira um artefato primeiro para que o perfil vivo esteja disponível.'}
        </div>
        {hasPerfil && (
          <button onClick={onGenerate} disabled={generating} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 6,
            background: 'var(--accent)', color: '#09090c',
            border: 'none', fontSize: 13, fontWeight: 600, cursor: generating ? 'wait' : 'pointer',
          }}>
            {generating
              ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Gerando…</>
              : <><CalendarDays size={12} /> Gerar pauta</>}
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {pautas.map((p, i) => <PautaCard key={i} pauta={p} slug={slug} />)}
    </div>
  )
}

function PautaCard({ pauta: p, slug }: { pauta: PautaMeta; slug: string }) {
  const [expanded, setExpanded] = useState(false)
  const [content,  setContent]  = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [rated,    setRated]    = useState<string | null>(null)

  async function toggle() {
    if (!expanded && content === null) {
      setLoading(true)
      const raw = await window.api.artifacts.read(p.path)
      setContent(raw)
      setLoading(false)
    }
    setExpanded((v) => !v)
  }

  async function handleRate(rating: 'util' | 'precisa_melhorar') {
    await window.api.people.ratePauta(slug, p.date, rating)
    setRated(rating)
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 6, overflow: 'hidden',
    }}>
      <div
        onClick={toggle}
        style={{
          padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
          cursor: 'pointer',
          background: expanded ? 'var(--surface-2)' : 'transparent',
          transition: 'background 0.12s',
        }}
      >
        <CalendarDays size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {fmtDate(p.date)}
        </span>
        <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {p.fileName}
        </span>
        {rated && (
          <span style={{
            fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 20,
            background: rated === 'util' ? 'rgba(76,175,80,0.1)' : 'rgba(255,152,0,0.1)',
            border: `1px solid ${rated === 'util' ? 'rgba(76,175,80,0.3)' : 'rgba(255,152,0,0.3)'}`,
            color: rated === 'util' ? 'var(--green)' : 'var(--yellow, #d4a843)',
          }}>
            {rated === 'util' ? 'Útil' : 'Melhorar'}
          </span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {loading && <Loader2 size={12} style={{ color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />}
          <button
            onClick={(e) => { e.stopPropagation(); window.api.shell.open(p.path) }}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 24, height: 24, borderRadius: 6,
              background: 'var(--surface-2)', color: 'var(--text-secondary)',
              border: '1px solid var(--border)', cursor: 'pointer', flexShrink: 0,
            }}
            title="Abrir no editor"
          >
            <ExternalLink size={11} />
          </button>
          <span style={{
            fontSize: 10, color: 'var(--text-muted)',
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s', display: 'flex',
          }}>▾</span>
        </div>
      </div>
      {expanded && content !== null && (
        <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ padding: '16px 18px' }}>
            <MarkdownPreview content={content} maxHeight={560} />
          </div>
          {!rated && (
            <div style={{
              padding: '10px 18px', borderTop: '1px solid var(--border-subtle)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Esta pauta foi útil?</span>
              <button
                onClick={() => handleRate('util')}
                style={{
                  fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 4,
                  background: 'rgba(76,175,80,0.1)', border: '1px solid rgba(76,175,80,0.3)',
                  color: 'var(--green)', cursor: 'pointer',
                }}
              >
                Útil
              </button>
              <button
                onClick={() => handleRate('precisa_melhorar')}
                style={{
                  fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 4,
                  background: 'rgba(255,152,0,0.1)', border: '1px solid rgba(255,152,0,0.3)',
                  color: 'var(--yellow, #d4a843)', cursor: 'pointer',
                }}
              >
                Precisa melhorar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Ações tab ──────────────────────────────────────────────────────────────────

function AcoesTab({
  actions,
  personSlug,
  personRelacao,
  personPdi,
  onUpdateStatus,
  onDelete,
  onSaveAction,
  onSendToDemandas,
}: {
  actions: Action[]
  personSlug: string
  personRelacao?: string
  personPdi?: PDIItem[]
  onUpdateStatus: (id: string, status: 'open' | 'done' | 'cancelled') => Promise<void>
  onDelete: (id: string) => Promise<void>
  onSaveAction: (action: Action) => Promise<void>
  onSendToDemandas: (action: Action) => Promise<void>
}) {
  const [activeTab, setActiveTab]       = useState<'open' | 'done' | 'cancelled'>('open')
  const [showForm, setShowForm]         = useState(false)
  const [formTexto, setFormTexto]       = useState('')
  const [formOwner, setFormOwner]       = useState<ActionOwner>('liderado')
  const [formPrazo, setFormPrazo]       = useState('')
  const [formPdiRef, setFormPdiRef]     = useState('')
  const [sentToDemandas, setSentToDemandas] = useState<string | null>(null)

  async function submitForm() {
    if (!formTexto.trim()) return
    const t = new Date().toISOString().slice(0, 10)
    const action: Action = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      personSlug,
      texto: formTexto.trim(),
      owner: formOwner,
      status: 'open',
      criadoEm: t,
      prazo: formPrazo || null,
      ...(formPdiRef ? { pdi_objetivo_ref: formPdiRef } : {}),
    }
    await onSaveAction(action)
    setShowForm(false)
    setFormTexto('')
    setFormOwner('liderado')
    setFormPrazo('')
    setFormPdiRef('')
  }

  async function handleSendToDemandas(action: Action) {
    await onSendToDemandas(action)
    setSentToDemandas(action.id)
    setTimeout(() => setSentToDemandas(null), 2500)
  }

  const openList      = actions.filter((a) => a.status === 'open')
  const doneList      = actions.filter((a) => a.status === 'done')
  const cancelledList = actions.filter((a) => a.status === 'cancelled')
  const currentList   = activeTab === 'open' ? openList : activeTab === 'done' ? doneList : cancelledList

  const lideradoActions = currentList.filter((a) => !a.owner || a.owner === 'liderado' || a.owner === 'terceiro')
  const gestorActions   = currentList.filter((a) => a.owner === 'gestor')

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        marginBottom: 16, borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{ display: 'flex', gap: 0 }}>
          {([
            { id: 'open',      label: `Abertas (${openList.length})` },
            { id: 'done',      label: `Concluídas (${doneList.length})` },
            { id: 'cancelled', label: `Canceladas (${cancelledList.length})` },
          ] as const).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                padding: '7px 14px', borderRadius: 0, fontSize: 12.5,
                background: 'transparent', border: 'none',
                borderBottom: activeTab === id ? '2px solid var(--accent)' : '2px solid transparent',
                color: activeTab === id ? 'var(--text-primary)' : 'var(--text-muted)',
                cursor: 'pointer', fontFamily: 'var(--font)',
                fontWeight: activeTab === id ? 600 : 400,
                marginBottom: -1,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowForm(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 500,
            background: 'var(--accent-dim)', border: '1px solid rgba(192,135,58,0.3)',
            color: 'var(--accent)', cursor: 'pointer', fontFamily: 'var(--font)',
            marginBottom: 8,
          }}
        >
          <Plus size={13} /> Nova ação
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div style={{
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 8, padding: 16, marginBottom: 16,
        }}>
          <input
            autoFocus
            value={formTexto}
            onChange={(e) => setFormTexto(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitForm()}
            placeholder="Descreva a ação..."
            style={{
              width: '100%', padding: '8px 10px', boxSizing: 'border-box',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--text-primary)', fontSize: 13,
              fontFamily: 'var(--font)', outline: 'none', marginBottom: 10,
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Responsável</label>
            <select
              value={formOwner}
              onChange={(e) => setFormOwner(e.target.value as ActionOwner)}
              style={{
                padding: '4px 8px', borderRadius: 6, fontSize: 12.5,
                background: 'var(--surface)', border: '1px solid var(--border)',
                color: 'var(--text-primary)', fontFamily: 'var(--font)', cursor: 'pointer',
              }}
            >
              <option value="liderado">{personRelacao === 'par' ? 'Par' : personRelacao === 'gestor' ? 'Gestor' : 'Liderado'}</option>
              <option value="gestor">Eu</option>
            </select>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 6 }}>Prazo</label>
            <input
              type="date"
              value={formPrazo}
              onChange={(e) => setFormPrazo(e.target.value)}
              style={{
                padding: '4px 8px', borderRadius: 6, fontSize: 12.5,
                background: 'var(--surface)', border: '1px solid var(--border)',
                color: formPrazo ? 'var(--text-primary)' : 'var(--text-muted)',
                fontFamily: 'var(--font)', cursor: 'pointer',
              }}
            />
            {formPrazo && (
              <button
                onClick={() => setFormPrazo('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 2px', fontSize: 12 }}
              >×</button>
            )}
            {personPdi && personPdi.length > 0 && (
              <>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 6 }}>PDI</label>
                <select
                  value={formPdiRef}
                  onChange={(e) => setFormPdiRef(e.target.value)}
                  style={{
                    padding: '4px 8px', borderRadius: 6, fontSize: 12.5,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    color: formPdiRef ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontFamily: 'var(--font)', cursor: 'pointer', maxWidth: 180,
                  }}
                >
                  <option value="">— nenhum —</option>
                  {personPdi.map((p, i) => (
                    <option key={i} value={p.objetivo}>{p.objetivo}</option>
                  ))}
                </select>
              </>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setShowForm(false); setFormTexto(''); setFormOwner('liderado'); setFormPrazo(''); setFormPdiRef('') }}
                style={acoesStyles.btnSecondary}
              >Cancelar</button>
              <button onClick={submitForm} style={acoesStyles.btnPrimary} disabled={!formTexto.trim()}>
                Criar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {currentList.length === 0 && !showForm && (
        <PlaceholderTab
          icon={<CheckSquare size={28} />}
          title="Nenhuma ação"
          desc={activeTab === 'open'
            ? 'Ações dos artefatos aparecerão aqui após ingestão. Você também pode criar manualmente.'
            : `Nenhuma ação ${activeTab === 'done' ? 'concluída' : 'cancelada'} ainda.`}
          fase={activeTab === 'open' ? 'Aguardando ingestão' : '—'}
        />
      )}

      {/* Do liderado */}
      {lideradoActions.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
            textTransform: 'uppercase' as const, color: 'var(--text-muted)',
            padding: '8px 0 6px', marginBottom: 4,
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            {personRelacao === 'par' ? 'Do par' : personRelacao === 'gestor' ? 'Do gestor' : 'Do liderado'} · {lideradoActions.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {lideradoActions.map((a) => (
              <ActionRow key={a.id} action={a} slug={personSlug} onUpdateStatus={onUpdateStatus} onDelete={onDelete} />
            ))}
          </div>
        </div>
      )}

      {/* Minhas (gestor) */}
      {gestorActions.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
            textTransform: 'uppercase' as const, color: 'var(--text-muted)',
            padding: '8px 0 6px', marginBottom: 4,
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            Minhas · {gestorActions.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {gestorActions.map((a) => (
              <ActionRow
                key={a.id}
                action={a}
                slug={personSlug}
                onUpdateStatus={onUpdateStatus}
                onDelete={onDelete}
                onSendToDemandas={a.status === 'open' ? handleSendToDemandas : undefined}
                sentToDemandas={sentToDemandas === a.id}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ActionRow({
  action: a,
  slug,
  onUpdateStatus,
  onDelete,
  onSendToDemandas,
  sentToDemandas,
}: {
  action: Action
  slug: string
  onUpdateStatus: (id: string, status: 'open' | 'done' | 'cancelled') => Promise<void>
  onDelete: (id: string) => Promise<void>
  onSendToDemandas?: (action: Action) => Promise<void>
  sentToDemandas?: boolean
}) {
  const isDone      = a.status === 'done'
  const isCancelled = a.status === 'cancelled'

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '8px 0', borderBottom: '1px solid var(--border-subtle)',
    }}>
      <button
        onClick={() => onUpdateStatus(a.id, isDone ? 'open' : 'done')}
        title={isDone ? 'Reabrir' : 'Marcar como concluída'}
        style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: isDone ? 'var(--accent)' : 'var(--border)',
          flexShrink: 0, marginTop: 1,
        }}
      >
        {isDone ? <CheckSquare size={15} /> : <Square size={15} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, color: isDone || isCancelled ? 'var(--text-muted)' : 'var(--text-primary)',
          textDecoration: isDone || isCancelled ? 'line-through' : 'none',
          lineHeight: 1.5,
        }}>
          {a.descricao ?? ((a.responsavel && a.texto?.startsWith(a.responsavel) ? a.texto.slice(a.responsavel.length).replace(/^:\s*/, '') : a.texto) || '')}
        </div>
        {a.contexto && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>
            {a.contexto}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
          {a.responsavel && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {a.responsavel}
            </span>
          )}
          {a.prazo && !isDone && !isCancelled && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              prazo {fmtDate(a.prazo)}
            </span>
          )}
          {a.fonteArtefato && (
            <button
              onClick={() => window.api.artifacts.open(slug, a.fonteArtefato!)}
              style={{
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                textDecoration: 'underline', textDecorationStyle: 'dotted',
              }}
            >
              {a.fonteArtefato}
            </button>
          )}
          {a.criadoEm && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {fmtDateUtil(a.criadoEm)}
            </span>
          )}
          {a.concluidoEm && (
            <span style={{ fontSize: 10, color: 'var(--green)' }}>
              concluída {fmtDateUtil(a.concluidoEm)}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center', marginTop: 1 }}>
        {onSendToDemandas && (
          sentToDemandas ? (
            <span style={{ fontSize: 11, color: 'var(--accent)', padding: '2px 6px' }}>✓ adicionada</span>
          ) : (
            <button
              onClick={() => onSendToDemandas(a)}
              title="Adicionar nas minhas demandas"
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', borderRadius: 5, fontSize: 11,
                background: 'var(--accent-dim)', border: '1px solid rgba(192,135,58,0.25)',
                color: 'var(--accent)', cursor: 'pointer', fontFamily: 'var(--font)',
                whiteSpace: 'nowrap',
              }}
            >
              <ArrowUpRight size={11} /> Minhas demandas
            </button>
          )
        )}
        {isCancelled ? (
          <button
            onClick={() => onDelete(a.id)}
            title="Excluir permanentemente"
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              color: 'var(--text-muted)', flexShrink: 0,
            }}
          >
            <Trash2 size={13} />
          </button>
        ) : (
          <button
            onClick={() => onUpdateStatus(a.id, 'cancelled')}
            title="Cancelar"
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              color: 'var(--text-muted)', flexShrink: 0,
            }}
          >
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Ações shared styles ────────────────────────────────────────────────────────

const acoesStyles = {
  btnPrimary: {
    padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
    background: 'var(--accent-dim)', border: '1px solid rgba(192,135,58,0.3)',
    color: 'var(--accent)', cursor: 'pointer', fontFamily: 'var(--font)',
  } as React.CSSProperties,
  btnSecondary: {
    padding: '4px 12px', borderRadius: 6, fontSize: 12,
    background: 'transparent', border: '1px solid var(--border)',
    color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font)',
  } as React.CSSProperties,
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function stripMd(s: string): string {
  return s.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').trim()
}

function parsePerfilSections(raw: string) {
  function extractBlock(openLabel: string, closeLabel: string): string {
    const re = new RegExp(`${escapeRe(openLabel)}\n([\\s\\S]*?)\n${escapeRe(closeLabel)}`)
    const m = raw.match(re)
    return m ? m[1].trim() : ''
  }

  const resumoRaw = extractBlock(
    '<!-- BLOCO GERENCIADO PELA IA — reescrito a cada ingestão -->',
    '<!-- FIM BLOCO RESUMO -->',
  )

  const acoesRaw = extractBlock(
    '<!-- BLOCO GERENCIADO PELA IA — append de novos itens -->',
    '<!-- FIM BLOCO ACOES -->',
  )
  const acoes = acoesRaw
    .split('\n')
    .filter((l) => l.startsWith('- '))
    .map((l) => ({
      pending: l.startsWith('- [ ]'),
      text: stripMd(l.replace(/^- \[[ x]\] /, '').trim()),
    }))

  const atencaoRaw = extractBlock(
    '<!-- BLOCO GERENCIADO PELA IA — append apenas -->',
    '<!-- FIM BLOCO ATENCAO -->',
  )
  const atencao = atencaoRaw.split('\n').filter((l) => l.startsWith('- ')).map((l) => stripMd(l.slice(2).trim()))

  const conquistasRaw = extractBlock(
    '<!-- BLOCO GERENCIADO PELA IA — append apenas (conquistas) -->',
    '<!-- FIM BLOCO CONQUISTAS -->',
  )
  const conquistas = conquistasRaw.split('\n').filter((l) => l.startsWith('- ')).map((l) => stripMd(l.slice(2).trim()))

  const temasRaw = extractBlock(
    '<!-- BLOCO GERENCIADO PELA IA — lista deduplicada, substituída a cada ingestão -->',
    '<!-- FIM BLOCO TEMAS -->',
  )
  const temas = temasRaw.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2).trim())

  const resumosAnterioresRaw = extractBlock(
    '<!-- BLOCO GERENCIADO PELA IA — histórico de resumos (max 3) -->',
    '<!-- FIM BLOCO RESUMOS_ANTERIORES -->',
  )

  return { resumo: stripMd(resumoRaw), acoes, atencao, conquistas, temas, resumosAnterioresRaw }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function DatedItem({ text }: { text: string }) {
  const match = text.match(/^(\d{4}-\d{2}-\d{2}):\s*(.*)$/)
  if (match) {
    return (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '3px 0', lineHeight: 1.5 }}>
        <span style={{
          fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
          flexShrink: 0, paddingTop: 1,
        }}>
          {fmtDate(match[1])}
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{match[2]}</span>
      </div>
    )
  }
  return (
    <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', padding: '3px 0', lineHeight: 1.5 }}>
      {text}
    </div>
  )
}

function PerfilSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 6, overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)',
        fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
        textTransform: 'uppercase' as const, color: 'var(--text-muted)',
      }}>
        {title}
      </div>
      <div style={{ padding: '14px 16px' }}>{children}</div>
    </div>
  )
}

function PlaceholderTab({ icon, title, desc, fase }: { icon: React.ReactNode; title: string; desc: string; fase: string }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
      padding: '48px 32px', textAlign: 'center',
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 12, display: 'flex', justifyContent: 'center' }}>{icon}</div>
      <div style={{ fontFamily: 'var(--font)', fontSize: 17, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-secondary)', marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>{desc}</div>
      <span style={{
        fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const,
        padding: '3px 8px', borderRadius: 20,
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        color: 'var(--text-muted)',
      }}>
        {fase}
      </span>
    </div>
  )
}

function HealthDot({ saude }: { saude: string }) {
  const color = saude === 'verde' ? 'var(--green)' : saude === 'amarelo' ? 'var(--yellow, #d4a843)' : 'var(--red)'
  return (
    <span style={{
      width: 8, height: 8, borderRadius: '50%',
      background: color, display: 'inline-block',
      boxShadow: `0 0 6px ${color}`,
    }} title={`Saúde: ${saude}`} />
  )
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 6, overflow: 'hidden', marginBottom: 14,
    }}>
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)',
        fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
        textTransform: 'uppercase' as const, color: 'var(--text-muted)',
      }}>
        {title}
      </div>
      <div>{children}</div>
    </div>
  )
}

function InfoRow({ label, value, mono, suffix }: { label: string; value: string; mono?: boolean; suffix?: React.ReactNode }) {
  return (
    <div style={{
      padding: '9px 16px', display: 'flex', justifyContent: 'space-between',
      alignItems: 'center', borderBottom: '1px solid var(--border-subtle)',
    }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          fontSize: mono ? 11 : 12, fontWeight: 500, color: 'var(--text-primary)',
          fontFamily: mono ? 'JetBrains Mono, monospace' : undefined,
        }}>
          {value}
        </span>
        {suffix}
      </div>
    </div>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20,
      background: 'var(--surface-2)', color: 'var(--text-secondary)',
      border: '1px solid var(--border)',
    }}>
      {children}
    </span>
  )
}

// ── T-R4.3: Desde a última 1:1 ────────────────────────────────────────────────

function SinceLastMeetingCard({
  ultimo1on1, artifacts, actions,
}: {
  ultimo1on1: string
  artifacts: ArtifactMeta[]
  actions: Action[]
}) {
  const today = new Date().toISOString().slice(0, 10)
  const newArtifacts = artifacts.filter(a => a.date > ultimo1on1)
  const closedActions = actions.filter(a => a.status === 'done' && a.concluidoEm && a.concluidoEm > ultimo1on1)
  const expiredActions = actions.filter(a => a.status === 'open' && a.prazo && a.prazo < today)

  const hasActivity = newArtifacts.length > 0 || closedActions.length > 0 || expiredActions.length > 0

  // Detect health change: compare most recent artifact health with last artifact before ultimo1on1
  const sorted = [...artifacts].sort((a, b) => a.date.localeCompare(b.date))
  const lastBefore = sorted.filter(a => a.date <= ultimo1on1).at(-1)
  const firstAfter  = sorted.find(a => a.date > ultimo1on1)
  const healthChanged = lastBefore && firstAfter && (lastBefore as ArtifactMeta & { saude?: string }).saude !== (firstAfter as ArtifactMeta & { saude?: string }).saude

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 6, padding: '10px 16px', marginBottom: 14,
      display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
    }}>
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginRight: 4 }}>
        Desde {fmtDate(ultimo1on1)}
      </span>
      {!hasActivity && !healthChanged && (
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nenhuma ingestão desde o último 1:1</span>
      )}
      {newArtifacts.length > 0 && (
        <span style={{ fontSize: 11.5, padding: '2px 8px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
          {newArtifacts.length} artefato{newArtifacts.length !== 1 ? 's' : ''} novo{newArtifacts.length !== 1 ? 's' : ''}
        </span>
      )}
      {closedActions.length > 0 && (
        <span style={{ fontSize: 11.5, padding: '2px 8px', borderRadius: 12, background: 'rgba(100,180,100,0.1)', border: '1px solid rgba(100,180,100,0.3)', color: 'var(--green)' }}>
          {closedActions.length} ação{closedActions.length !== 1 ? 'ões' : ''} concluída{closedActions.length !== 1 ? 's' : ''}
        </span>
      )}
      {expiredActions.length > 0 && (
        <span style={{ fontSize: 11.5, padding: '2px 8px', borderRadius: 12, background: 'rgba(184,64,64,0.08)', border: '1px solid rgba(184,64,64,0.3)', color: 'var(--red)' }}>
          {expiredActions.length} ação{expiredActions.length !== 1 ? 'ões' : ''} vencida{expiredActions.length !== 1 ? 's' : ''}
        </span>
      )}
      {healthChanged && (
        <span style={{ fontSize: 11.5, padding: '2px 8px', borderRadius: 12, background: 'rgba(232,135,58,0.1)', border: '1px solid rgba(232,135,58,0.3)', color: '#e8873a' }}>
          saúde alterada
        </span>
      )}
    </div>
  )
}

// ── T-R4.1: PDI Section ────────────────────────────────────────────────────────

function PDISection({ pdi }: { pdi: PDIItem[] }) {
  const concluidos = pdi.filter(p => p.status === 'concluido').length
  const pct = pdi.length > 0 ? Math.round((concluidos / pdi.length) * 100) : 0

  const statusColor = (s: string) =>
    s === 'concluido' ? 'var(--green)' : s === 'em_andamento' ? '#e8873a' : 'var(--text-muted)'
  const statusBg = (s: string) =>
    s === 'concluido' ? 'rgba(100,180,100,0.12)' : s === 'em_andamento' ? 'rgba(232,135,58,0.1)' : 'var(--surface-2)'
  const statusBorder = (s: string) =>
    s === 'concluido' ? 'rgba(100,180,100,0.3)' : s === 'em_andamento' ? 'rgba(232,135,58,0.3)' : 'var(--border)'
  const statusLabel = (s: string) =>
    s === 'concluido' ? 'Concluído' : s === 'em_andamento' ? 'Em andamento' : 'Não iniciado'

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 6, overflow: 'hidden', marginBottom: 14,
    }}>
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--text-muted)' }}>
          PDI
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {concluidos}/{pdi.length}
        </span>
      </div>
      <div style={{ padding: '6px 16px 4px', background: 'var(--surface-2)' }}>
        <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--green)', borderRadius: 2, transition: 'width 0.3s' }} />
        </div>
      </div>
      <div style={{ padding: '8px 16px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {pdi.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 10, flexShrink: 0,
              background: statusBg(item.status), border: `1px solid ${statusBorder(item.status)}`,
              color: statusColor(item.status),
            }}>
              {statusLabel(item.status)}
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{item.objetivo}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── T-R4.2: External Tab ───────────────────────────────────────────────────────

function ExternalTab({ slug }: { slug: string }) {
  const [historico, setHistorico] = useState<Record<string, { github?: { commits30d?: number; prsMerged30d?: number } | null }> | null>(null)

  useEffect(() => {
    window.api.external.getHistorico(slug).then(setHistorico)
  }, [slug])

  const months = historico ? Object.keys(historico).sort().reverse().slice(0, 6) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <ExternalDataCard slug={slug} />
      {months.length > 1 && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 6, overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)',
            fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
            textTransform: 'uppercase' as const, color: 'var(--text-muted)',
          }}>
            Histórico mensal
          </div>
          <div style={{ padding: '10px 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>
              <span>Mês</span><span style={{ textAlign: 'right' }}>Commits</span><span style={{ textAlign: 'right' }}>PRs merged</span>
            </div>
            {months.map(m => {
              const gh = historico![m]?.github
              return (
                <div key={m} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, fontSize: 12, padding: '3px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{m}</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{gh?.commits30d ?? '—'}</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{gh?.prsMerged30d ?? '—'}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

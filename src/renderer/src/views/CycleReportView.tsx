import { useState } from 'react'
import { FileText, ExternalLink, Loader2 } from 'lucide-react'
import type { PersonConfig, CycleReportParams, CycleReportResult } from '../types/ipc'
import { MarkdownPreview } from '../components/MarkdownPreview'
import { fmtDate } from '../lib/utils'

/** Embedded tab used inside PersonView — no person selector needed. */
export function CycleTab({ slug, person }: { slug: string; person: PersonConfig }) {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 3)
    return d.toISOString().slice(0, 10)
  })
  const [dateTo,  setDateTo]  = useState(() => new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState<CycleReportResult | null>(null)

  async function handleGenerate() {
    setLoading(true)
    setResult(null)
    try {
      const params: CycleReportParams = { personSlug: slug, periodoInicio: dateFrom, periodoFim: dateTo }
      const res = await window.api.ai.cycleReport(params) as CycleReportResult
      setResult(res)
    } catch (e: unknown) {
      setResult({ success: false, error: e instanceof Error ? e.message : 'Erro desconhecido.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Period + generate */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 6, overflow: 'hidden',
      }}>
        <div style={{ padding: '13px 20px', borderBottom: '1px solid var(--border-subtle)', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          Período de avaliação
          <div style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)', marginTop: 2 }}>
            Início e fim do ciclo a sintetizar
          </div>
        </div>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 8 }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} />
          <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   style={inputStyle} />
        </div>
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 6 }}>
          {[
            {
              label: 'Últimos 90 dias',
              fn: () => {
                const to = new Date()
                const from = new Date(Date.now() - 90 * 86_400_000)
                setDateFrom(from.toISOString().slice(0, 10))
                setDateTo(to.toISOString().slice(0, 10))
              },
            },
            {
              label: 'Último trimestre',
              fn: () => {
                const now = new Date()
                const q = Math.floor(now.getMonth() / 3)
                const prevQ = q === 0 ? 3 : q - 1
                const year = q === 0 ? now.getFullYear() - 1 : now.getFullYear()
                const from = new Date(year, prevQ * 3, 1)
                const to = new Date(year, prevQ * 3 + 3, 0)
                setDateFrom(from.toISOString().slice(0, 10))
                setDateTo(to.toISOString().slice(0, 10))
              },
            },
            {
              label: 'Últimos 6 meses',
              fn: () => {
                const to = new Date()
                const from = new Date(Date.now() - 180 * 86_400_000)
                setDateFrom(from.toISOString().slice(0, 10))
                setDateTo(to.toISOString().slice(0, 10))
              },
            },
          ].map(({ label, fn }) => (
            <button
              key={label}
              onClick={fn}
              style={{
                padding: '4px 10px', borderRadius: 5, border: '1px solid var(--border)',
                background: 'var(--surface-2)', color: 'var(--text-secondary)',
                fontSize: 11, fontFamily: 'var(--font)', cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ padding: '16px 20px' }}>
          <button
            onClick={handleGenerate}
            disabled={loading}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '10px', borderRadius: 6, border: 'none',
              background: loading ? 'var(--surface-3)' : 'var(--accent)',
              color: loading ? 'var(--text-muted)' : '#09090c',
              fontSize: 13, fontFamily: 'var(--font)', fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.15s ease',
            }}
          >
            {loading
              ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Gerando relatório…</>
              : <><FileText size={14} /> Gerar relatório de ciclo</>}
          </button>
        </div>
      </div>

      {result && (
        result.success && result.result
          ? <CycleResultView result={result} person={person} />
          : <ErrorCard error={result.error ?? 'Erro desconhecido.'} />
      )}
    </div>
  )
}

// ── Result view ────────────────────────────────────────────────────────────────

function CycleResultView({ result, person }: { result: CycleReportResult; person?: PersonConfig }) {
  const r = result.result!
  const [view, setView] = useState<'estruturado' | 'markdown'>('estruturado')
  const promoColor = r.flag_promovibilidade === 'sim' ? 'var(--green)' : r.flag_promovibilidade === 'nao' ? 'var(--red)' : 'var(--amber)'
  const promoLabel = r.flag_promovibilidade === 'sim' ? 'Sim — promovível neste ciclo' : r.flag_promovibilidade === 'nao' ? 'Não — sem evidências suficientes' : 'Avaliar — potencial identificado'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header result card */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden',
      }}>
        <div style={{
          padding: '12px 18px', borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 2 }}>
              Relatório gerado
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              {person?.nome ?? 'Pessoa'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
              background: `${promoColor}18`, border: `1px solid ${promoColor}40`,
              color: promoColor,
            }}>
              {promoLabel}
            </span>
            {/* View toggle */}
            <div style={{
              display: 'flex', borderRadius: 6, overflow: 'hidden',
              border: '1px solid var(--border)',
            }}>
              {(['estruturado', 'markdown'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  style={{
                    padding: '5px 10px', border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: 500,
                    background: view === v ? 'var(--surface-3)' : 'var(--surface-2)',
                    color: view === v ? 'var(--text-primary)' : 'var(--text-muted)',
                  }}
                >
                  {v === 'estruturado' ? 'Estruturado' : 'Markdown'}
                </button>
              ))}
            </div>
            {result.path && (
              <button
                onClick={() => window.api.shell.open(result.path!)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '6px 10px', borderRadius: 6,
                  background: 'var(--surface-2)', color: 'var(--text-secondary)',
                  border: '1px solid var(--border)', fontSize: 12, cursor: 'pointer',
                }}
              >
                <ExternalLink size={11} /> Abrir
              </button>
            )}
          </div>
        </div>

        {/* Conclusão */}
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
            Conclusão para o fórum
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.75, margin: 0 }}>
            {r.conclusao_para_calibracao}
          </p>
        </div>

        {/* Evolução frente ao cargo */}
        <div style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
            Evolução frente ao cargo
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.75, margin: 0 }}>
            {r.evolucao_frente_ao_cargo}
          </p>
        </div>
      </div>

      {/* Markdown full view */}
      {view === 'markdown' && result.markdown && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '20px 22px',
        }}>
          <MarkdownPreview content={result.markdown} />
        </div>
      )}

      {/* Linha do tempo */}
      {view === 'estruturado' && r.linha_do_tempo.length > 0 && (
        <ResultSection title="Linha do Tempo">
          {r.linha_do_tempo.map((e, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '5px 0', borderBottom: i < r.linha_do_tempo.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', paddingTop: 2 }}>
                {fmtDate(e.data)}
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{e.evento}</span>
            </div>
          ))}
        </ResultSection>
      )}

      {/* Entregas */}
      {view === 'estruturado' && r.entregas_e_conquistas.length > 0 && (
        <ResultSection title="Entregas e Conquistas">
          {r.entregas_e_conquistas.map((e, i) => (
            <div key={i} style={{ fontSize: 12.5, color: 'var(--green)', padding: '3px 0' }}>• {e}</div>
          ))}
        </ResultSection>
      )}

      {/* Padrões */}
      {view === 'estruturado' && r.padroes_de_comportamento.length > 0 && (
        <ResultSection title="Padrões de Comportamento">
          {r.padroes_de_comportamento.map((p, i) => (
            <div key={i} style={{ fontSize: 12.5, color: 'var(--text-secondary)', padding: '3px 0' }}>• {p}</div>
          ))}
        </ResultSection>
      )}

      {/* Desenvolvimento */}
      {view === 'estruturado' && r.pontos_de_desenvolvimento.length > 0 && (
        <ResultSection title="Pontos de Desenvolvimento">
          {r.pontos_de_desenvolvimento.map((p, i) => (
            <div key={i} style={{ fontSize: 12.5, color: 'var(--amber)', padding: '3px 0' }}>• {p}</div>
          ))}
        </ResultSection>
      )}
    </div>
  )
}

function ResultSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
      <div style={{
        padding: '10px 18px', borderBottom: '1px solid var(--border-subtle)',
        fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
        textTransform: 'uppercase' as const, color: 'var(--text-muted)',
      }}>
        {title}
      </div>
      <div style={{ padding: '12px 18px' }}>{children}</div>
    </div>
  )
}

function ErrorCard({ error }: { error: string }) {
  return (
    <div style={{
      padding: '16px 18px', borderRadius: 6,
      background: 'var(--red-dim)', border: '1px solid rgba(184,64,64,0.3)',
      fontSize: 13, color: 'var(--red)',
    }}>
      {error}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)',
  borderRadius: 6, padding: '8px 12px',
  fontFamily: 'var(--font-mono)', fontSize: 12,
  color: 'var(--text-primary)', outline: 'none',
}

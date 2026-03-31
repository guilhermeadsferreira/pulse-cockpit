import { useState, useEffect } from 'react'
import { ArrowLeft, Save, Trash2 } from 'lucide-react'
import { useRouter } from '../router'
import { toSlug } from '../lib/utils'
import type { PersonConfig, PersonLevel, PersonRelacao } from '../types/ipc'

const NIVEIS: { value: PersonLevel; label: string }[] = [
  { value: 'junior',    label: 'Junior' },
  { value: 'pleno',     label: 'Pleno' },
  { value: 'senior',    label: 'Sênior' },
  { value: 'staff',     label: 'Staff' },
  { value: 'principal', label: 'Principal' },
  { value: 'manager',   label: 'Gerente' },
]

const RELACOES: { value: PersonRelacao; label: string }[] = [
  { value: 'liderado',    label: 'Liderado' },
  { value: 'par',         label: 'Par' },
  { value: 'gestor',      label: 'Gestor' },
  { value: 'stakeholder', label: 'Stakeholder' },
]

const CARGOS_SUGERIDOS = [
  'Backend Sênior', 'Backend Pleno', 'Backend Junior',
  'Frontend Sênior', 'Frontend Pleno', 'Frontend Junior',
  'Fullstack Sênior', 'Fullstack Pleno', 'Fullstack Junior',
  'Tech Lead', 'Staff Engineer', 'Principal Engineer',
  'Product Manager', 'Engineering Manager', 'Data Engineer',
  'QA Engineer', 'DevOps Engineer', 'SRE', 'Business Partner Tech',
]

const EMPTY: Partial<PersonConfig> = {
  schema_version: 1,
  nome: '',
  slug: '',
  cargo: '',
  nivel: 'senior',
  area: '',
  squad: '',
  relacao: 'liderado',
  frequencia_1on1_dias: 14,
  em_processo_promocao: false,
  pdi: [],
  alerta_ativo: false,
  notas_manuais: '',
  jiraEmail: undefined,
  githubUsername: undefined,
}

export function PersonFormView() {
  const { params, navigate, goBack } = useRouter()
  const isEdit = Boolean(params.slug)

  const [form, setForm] = useState<Partial<PersonConfig>>({ ...EMPTY })
  const [autoSlug, setAutoSlug] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDelete, setShowDelete] = useState(false)

  useEffect(() => {
    if (isEdit) {
      window.api.people.get(params.slug).then((person) => {
        if (person) {
          setForm(person)
          setAutoSlug(false)
        }
      })
    } else if (params.prefillSlug || params.prefillNome) {
      // Pre-populate from a detected person
      setForm((f) => ({
        ...f,
        nome: params.prefillNome || f.nome || '',
        slug: params.prefillSlug || f.slug || '',
        ...(params.defaultRelacao ? { relacao: params.defaultRelacao } : {}),
      }))
      setAutoSlug(false)
    } else if (params.defaultRelacao) {
      setForm((f) => ({ ...f, relacao: params.defaultRelacao }))
    }
  }, [params.slug, params.prefillSlug, params.prefillNome, params.defaultRelacao])

  function handleNameChange(value: string) {
    setForm((f) => ({
      ...f,
      nome: value,
      ...(autoSlug ? { slug: toSlug(value) } : {}),
    }))
  }

  function set(field: keyof PersonConfig, value: unknown) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSave() {
    if (!form.nome?.trim()) { setError('Nome é obrigatório'); return }
    if (!form.cargo?.trim()) { setError('Cargo é obrigatório'); return }
    if (!form.slug?.trim())  { setError('Slug não pode ser vazio'); return }

    setSaving(true)
    setError(null)
    try {
      await window.api.people.save(form as PersonConfig)
      // If registering a previously detected person, remove from detected list
      if (params.prefillSlug) {
        await window.api.detected.dismiss(params.prefillSlug)
      }
      navigate('person', { slug: form.slug! })
    } catch (e) {
      setError(String(e))
      setSaving(false)
    }
  }

  async function handleDelete() {
    await window.api.people.delete(params.slug)
    navigate('dashboard')
  }

  const title = isEdit ? `Editar — ${form.nome || params.slug}` : 'Adicionar pessoa'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '28px 40px 22px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      }}>
        <div>
          <button onClick={goBack} style={styles.backBtn}>
            <ArrowLeft size={12} /> Time
          </button>
          <h1 style={styles.pageTitle}>{title}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isEdit && (
            <button onClick={() => setShowDelete(true)} style={styles.btnDanger}>
              <Trash2 size={12} /> Excluir
            </button>
          )}
          <button onClick={handleSave} disabled={saving} style={styles.btnPrimary}>
            <Save size={12} />
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Form */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 40px' }}>
        <div style={{ maxWidth: 580 }}>

          {error && (
            <div style={{
              marginBottom: 20, padding: '10px 14px', borderRadius: 6,
              background: 'rgba(184,64,64,0.08)', border: '1px solid rgba(184,64,64,0.25)',
              fontSize: 13, color: 'var(--red)',
            }}>
              {error}
            </div>
          )}

          <FormSection title="Identificação">
            <Field label="Nome *" hint="Nome completo da pessoa">
              <input
                style={styles.input}
                value={form.nome ?? ''}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="ex: Maria Silva"
              />
            </Field>

            <Field label="Slug" hint="Identificador único (gerado automaticamente)">
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  style={{ ...styles.input, flex: 1, color: isEdit ? 'var(--text-muted)' : undefined }}
                  value={form.slug ?? ''}
                  readOnly={isEdit}
                  onChange={(e) => {
                    setAutoSlug(false)
                    set('slug', e.target.value)
                  }}
                  placeholder="gerado a partir do nome"
                />
                {!isEdit && (
                  <button
                    onClick={() => { setAutoSlug(true); set('slug', toSlug(form.nome ?? '')) }}
                    style={styles.btnSecondary}
                  >
                    Regenerar
                  </button>
                )}
              </div>
            </Field>

            <Field label="Cargo *">
              <select
                style={styles.select}
                value={form.cargo ?? ''}
                onChange={(e) => set('cargo', e.target.value)}
              >
                <option value="">Selecione…</option>
                {CARGOS_SUGERIDOS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Nível">
                <select style={styles.select} value={form.nivel ?? 'senior'} onChange={(e) => set('nivel', e.target.value)}>
                  {NIVEIS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <Field label="Relação">
                <select style={styles.select} value={form.relacao ?? 'liderado'} onChange={(e) => set('relacao', e.target.value)}>
                  {RELACOES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Área">
                <input
                  style={styles.input}
                  value={form.area ?? ''}
                  onChange={(e) => set('area', e.target.value)}
                  placeholder="ex: Plataforma"
                />
              </Field>
              <Field label="Squad">
                <input
                  style={styles.input}
                  value={form.squad ?? ''}
                  onChange={(e) => set('squad', e.target.value)}
                  placeholder="ex: Core Infrastructure"
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="1:1">
            <Field label="Frequência (dias)" hint="A cada quantos dias fazem 1:1">
              <input
                type="number"
                style={{ ...styles.input, maxWidth: 120 }}
                value={form.frequencia_1on1_dias ?? 14}
                onChange={(e) => set('frequencia_1on1_dias', parseInt(e.target.value, 10))}
                min={1}
              />
            </Field>
          </FormSection>

          <FormSection title="Desenvolvimento">
            <Field label="Início na função">
              <input
                type="date"
                style={{ ...styles.input, maxWidth: 180 }}
                value={form.inicio_na_funcao ?? ''}
                onChange={(e) => set('inicio_na_funcao', e.target.value)}
              />
            </Field>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4 }}>
              <input
                type="checkbox"
                id="promo"
                checked={form.em_processo_promocao ?? false}
                onChange={(e) => set('em_processo_promocao', e.target.checked)}
                style={{ width: 14, height: 14, accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              <label htmlFor="promo" style={{ fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
                Em processo de promoção
              </label>
            </div>

            {form.em_processo_promocao && (
              <Field label="Cargo alvo">
                <input
                  style={styles.input}
                  value={form.objetivo_cargo_alvo ?? ''}
                  onChange={(e) => set('objetivo_cargo_alvo', e.target.value)}
                  placeholder="ex: staff"
                />
              </Field>
            )}
          </FormSection>

          <FormSection title="Notas manuais">
            <textarea
              style={{
                ...styles.input,
                width: '100%', height: 100,
                resize: 'vertical', lineHeight: 1.6,
              }}
              value={form.notas_manuais ?? ''}
              onChange={(e) => set('notas_manuais', e.target.value)}
              placeholder="Contexto relevante sobre esta pessoa que a IA deve conhecer…"
            />
          </FormSection>

          <FormSection title="Identidade Externa">
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
              Vincula esta pessoa às suas contas externas para buscar métricas automaticamente. Ambos os campos são opcionais — sem eles, a pessoa é ignorada na análise cruzada.
            </p>
            <Field label="Email do Jira" hint="Email usado no Jira (mesmo do Settings)">
              <input
                style={styles.input}
                type="text"
                value={form.jiraEmail ?? ''}
                onChange={(e) => set('jiraEmail', e.target.value || undefined)}
                placeholder="pessoa@empresa.com"
              />
            </Field>
            <Field label="Username do GitHub" hint="Sem @ — igual ao perfil GitHub">
              <input
                style={styles.input}
                type="text"
                value={form.githubUsername ?? ''}
                onChange={(e) => set('githubUsername', e.target.value || undefined)}
                placeholder="username"
              />
            </Field>
          </FormSection>

        </div>
      </div>

      {/* Delete confirmation */}
      {showDelete && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 999,
        }}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 24, maxWidth: 400, width: '100%', margin: '0 16px',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
              Excluir {form.nome}?
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              Todos os artefatos, perfil e pautas desta pessoa serão removidos permanentemente.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowDelete(false)} style={styles.btnSecondary}>
                Cancelar
              </button>
              <button onClick={handleDelete} style={styles.btnDanger}>
                Excluir permanentemente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 6, overflow: 'hidden', marginBottom: 16,
    }}>
      <div style={{
        padding: '11px 18px', borderBottom: '1px solid var(--border-subtle)',
        fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
        textTransform: 'uppercase' as const, color: 'var(--text-muted)',
      }}>
        {title}
      </div>
      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: hint ? 2 : 6 }}>
        {label}
      </div>
      {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{hint}</div>}
      {children}
    </div>
  )
}

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
  input: {
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '8px 12px',
    fontFamily: 'var(--font)', fontSize: 13,
    color: 'var(--text-primary)', outline: 'none', width: '100%',
  } as React.CSSProperties,
  select: {
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '8px 12px',
    fontFamily: 'var(--font)', fontSize: 13,
    color: 'var(--text-primary)', outline: 'none', width: '100%',
    cursor: 'pointer',
  } as React.CSSProperties,
  btnPrimary: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', borderRadius: 6, border: 'none',
    background: 'var(--accent)', color: '#09090c',
    fontSize: 13, fontFamily: 'var(--font)', fontWeight: 600,
    cursor: 'pointer',
  } as React.CSSProperties,
  btnSecondary: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 12px', borderRadius: 6,
    background: 'var(--surface-2)', color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    fontSize: 13, fontFamily: 'var(--font)', fontWeight: 500,
    cursor: 'pointer',
  } as React.CSSProperties,
  btnDanger: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 12px', borderRadius: 6,
    background: 'rgba(184,64,64,0.12)', color: 'var(--red)',
    border: '1px solid rgba(184,64,64,0.3)',
    fontSize: 13, fontFamily: 'var(--font)', fontWeight: 500,
    cursor: 'pointer',
  } as React.CSSProperties,
}

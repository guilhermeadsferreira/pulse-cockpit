import { useState, useEffect } from 'react'
import { FolderOpen, Cpu, CheckCircle2, XCircle, User, RefreshCw, Zap } from 'lucide-react'
import type { AppSettings } from '../types/ipc'

export function SettingsView() {
  const [form, setForm] = useState<AppSettings | null>(null)
  const [saved, setSaved] = useState(false)
  const [claudeStatus, setClaudeStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [claudeError, setClaudeError] = useState<string | null>(null)
  const [reingestStatus, setReingestStatus] = useState<'idle' | 'loading' | 'confirming' | 'running' | 'done' | 'error'>('idle')
  const [reingestInfo, setReingestInfo] = useState<{ count: number; files: string[] } | null>(null)
  const [reingestResult, setReingestResult] = useState<string | null>(null)

  useEffect(() => {
    window.api.settings.load().then(setForm)
  }, [])

  function set(field: keyof AppSettings, value: unknown) {
    setForm((f) => f ? ({ ...f, [field]: value }) : f)
    setSaved(false)
  }

  async function handleSelectFolder() {
    const path = await window.api.settings.selectFolder()
    if (path) set('workspacePath', path)
  }

  async function handleSave() {
    if (!form) return
    await window.api.settings.save(form)
    await window.api.settings.setupWorkspace(form.workspacePath)
    window.dispatchEvent(new CustomEvent('settings:saved'))
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function handleDetectClaude() {
    const bin = await window.api.settings.detectClaude()
    if (bin) set('claudeBinPath', bin)
  }

  async function handleReingestPreview() {
    setReingestStatus('loading')
    setReingestResult(null)
    const files: string[] = await window.api.ingestion.listProcessados()
    setReingestInfo({ count: files.length, files })
    setReingestStatus('confirming')
  }

  async function handleReingestConfirm() {
    if (!reingestInfo) return
    setReingestStatus('running')
    await window.api.ingestion.resetData()
    const result = await window.api.ingestion.batchReingest(reingestInfo.files) as { processed: number; errors: string[] }
    setReingestResult(`${result.processed} arquivo(s) reingeridos${result.errors.length ? ` — ${result.errors.length} erro(s)` : ''}`)
    setReingestStatus('done')
  }

  function handleReingestCancel() {
    setReingestStatus('idle')
    setReingestInfo(null)
    setReingestResult(null)
  }

  async function handleTestClaude() {
    setClaudeStatus('testing')
    setClaudeError(null)
    const result = await window.api.ai.test()
    if (result.success) {
      setClaudeStatus('ok')
    } else {
      setClaudeStatus('error')
      setClaudeError(result.error ?? 'Erro desconhecido')
    }
  }

  if (!form) return <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Carregando…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '28px 40px 22px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      }}>
        <div>
          <div style={styles.eyebrow}>Configuração</div>
          <h1 style={styles.pageTitle}>Settings</h1>
        </div>
        <button onClick={handleSave} style={styles.btnPrimary}>
          {saved ? <><CheckCircle2 size={13} /> Salvo</> : 'Salvar alterações'}
        </button>
      </div>

      {/* Form */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 40px' }}>
        <div style={{ maxWidth: 580 }}>

          {/* Perfil do gestor */}
          <Section
            icon={<User size={14} />}
            title="Perfil do gestor"
            desc="Seu nome e cargo exibidos na barra lateral"
          >
            <Field label="Nome">
              <input
                style={styles.input}
                value={form.managerName ?? ''}
                onChange={(e) => set('managerName', e.target.value)}
                placeholder="Ex: Guilherme Augusto"
              />
            </Field>
            <Field label="Cargo / Função">
              <input
                style={styles.input}
                value={form.managerRole ?? ''}
                onChange={(e) => set('managerRole', e.target.value)}
                placeholder="Ex: Gerente de Engenharia"
              />
            </Field>
          </Section>

          {/* Workspace */}
          <Section
            icon={<FolderOpen size={14} />}
            title="Workspace"
            desc="Pasta onde seus dados são armazenados localmente"
          >
            <Field label="Caminho do workspace" hint="Pode ser uma pasta no iCloud Drive ou Google Drive">
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  style={styles.input}
                  value={form.workspacePath}
                  onChange={(e) => set('workspacePath', e.target.value)}
                />
                <button onClick={handleSelectFolder} style={styles.btnSecondary}>
                  <FolderOpen size={12} /> Selecionar
                </button>
              </div>
            </Field>
          </Section>

          {/* Dados */}
          <Section
            icon={<RefreshCw size={14} />}
            title="Dados"
            desc="Reingestão de artefatos já processados — use se os perfis estiverem desatualizados"
          >
            <Field label="Reingerir todos os artefatos" hint="Apaga os dados gerados (perfis, insights) e processa novamente todos os arquivos da pasta processados/">
              {reingestStatus === 'idle' && (
                <button onClick={handleReingestPreview} style={styles.btnSecondary}>
                  <RefreshCw size={12} /> Verificar arquivos
                </button>
              )}
              {reingestStatus === 'loading' && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Listando arquivos…</span>
              )}
              {reingestStatus === 'confirming' && reingestInfo && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {reingestInfo.count} arquivo(s) encontrado(s) em <code style={{ fontFamily: 'var(--font-mono)' }}>processados/</code>. Isso vai apagar os dados gerados e reingerir tudo.
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handleReingestConfirm} style={{ ...styles.btnSecondary, color: 'var(--red)', borderColor: 'var(--red)' }}>
                      Confirmar reingestão
                    </button>
                    <button onClick={handleReingestCancel} style={styles.btnSecondary}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
              {reingestStatus === 'running' && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Reingerindo… aguarde</span>
              )}
              {reingestStatus === 'done' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <StatusLine ok>{reingestResult}</StatusLine>
                  <button onClick={handleReingestCancel} style={{ ...styles.btnSecondary, alignSelf: 'flex-start' }}>
                    Reiniciar
                  </button>
                </div>
              )}
              {reingestStatus === 'error' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <StatusLine ok={false}>{reingestResult ?? 'Erro ao reingerir'}</StatusLine>
                  <button onClick={handleReingestCancel} style={{ ...styles.btnSecondary, alignSelf: 'flex-start' }}>
                    Tentar novamente
                  </button>
                </div>
              )}
            </Field>
          </Section>

          {/* Modelo Híbrido */}
          <Section
            icon={<Zap size={14} />}
            title="Modelo Híbrido (OpenRouter)"
            desc="Usa modelos leves via OpenRouter para passes de baixa complexidade — reduz latência de ingestão"
          >
            <Field
              label="OpenRouter API Key"
              hint="Cole sua key de api.openrouter.ai/keys — armazenada localmente em ~/.pulsecockpit/settings.json"
            >
              <input
                style={styles.input}
                type="password"
                value={form.openRouterApiKey ?? ''}
                onChange={(e) => set('openRouterApiKey', e.target.value || undefined)}
                placeholder="sk-or-v1-..."
              />
            </Field>
            <Field
              label="Usar modelo híbrido"
              hint={!form.openRouterApiKey ? 'Configure a API Key acima para ativar' : 'Ativo: Pass Cerimônia usará OpenRouter com fallback para Claude CLI'}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: form.openRouterApiKey ? 'pointer' : 'default' }}>
                <input
                  type="checkbox"
                  checked={form.useHybridModel ?? false}
                  disabled={!form.openRouterApiKey}
                  onChange={(e) => set('useHybridModel', e.target.checked)}
                />
                <span style={{ fontSize: 12, color: form.openRouterApiKey ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  Ativar modelo híbrido
                </span>
              </label>
            </Field>
          </Section>

          {/* Claude CLI */}
          <Section
            icon={<Cpu size={14} />}
            title="Claude Code CLI"
            desc="O app usa seu Claude Code local — sem API key necessária"
          >
            <Field label="Binário do claude" hint="Detectado via which claude — armazenado como path absoluto">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  style={{ ...styles.input, flex: 1, minWidth: 200 }}
                  value={form.claudeBinPath}
                  onChange={(e) => set('claudeBinPath', e.target.value)}
                />
                <button onClick={handleDetectClaude} style={styles.btnSecondary}>
                  Detectar
                </button>
                <button
                  onClick={handleTestClaude}
                  disabled={claudeStatus === 'testing'}
                  style={styles.btnSecondary}
                >
                  {claudeStatus === 'testing' ? 'Testando…' : 'Testar'}
                </button>
              </div>

              {claudeStatus === 'ok' && (
                <StatusLine ok>Claude Code CLI funcionando</StatusLine>
              )}
              {claudeStatus === 'error' && (
                <StatusLine ok={false}>{claudeError ?? 'Erro ao conectar'}</StatusLine>
              )}
              {!form.claudeBinPath && (
                <StatusLine ok={false}>Binário não configurado — instale o Claude Code CLI</StatusLine>
              )}
            </Field>
          </Section>

        </div>
      </div>
    </div>
  )
}

function Section({ icon, title, desc, children }: {
  icon: React.ReactNode; title: string; desc: string; children: React.ReactNode
}) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 6, overflow: 'hidden', marginBottom: 20,
    }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
          <span style={{ color: 'var(--text-secondary)' }}>{icon}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{desc}</div>
      </div>
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: hint ? 2 : 6 }}>{label}</div>
      {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{hint}</div>}
      {children}
    </div>
  )
}

function StatusLine({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      marginTop: 8, fontSize: 12,
      color: ok ? 'var(--green)' : 'var(--red)',
    }}>
      {ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
      {children}
    </div>
  )
}

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
  } as React.CSSProperties,
  input: {
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '8px 12px',
    fontFamily: 'var(--font-mono)', fontSize: 12,
    color: 'var(--text-primary)', outline: 'none', width: '100%',
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
    fontSize: 12, fontFamily: 'var(--font)', fontWeight: 500, cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,
}

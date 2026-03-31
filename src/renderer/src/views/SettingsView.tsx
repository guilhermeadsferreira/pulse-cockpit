import { useState, useEffect } from 'react'
import { FolderOpen, Cpu, CheckCircle2, XCircle, User, RefreshCw, Zap, Sparkles, ChevronDown, ChevronRight, ExternalLink, Github, AlertCircle } from 'lucide-react'
import type { AppSettings, IngestionOperation, OperationProviderConfig } from '../types/ipc'

export function SettingsView() {
  const [form, setForm] = useState<AppSettings | null>(null)
  const [saved, setSaved] = useState(false)
  const [claudeStatus, setClaudeStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [claudeError, setClaudeError] = useState<string | null>(null)
  const [reingestStatus, setReingestStatus] = useState<'idle' | 'loading' | 'confirming' | 'running' | 'done' | 'error'>('idle')
  const [reingestInfo, setReingestInfo] = useState<{ count: number; files: string[] } | null>(null)
  const [reingestResult, setReingestResult] = useState<string | null>(null)
  const [showProviderOverrides, setShowProviderOverrides] = useState(false)
  const [syncingRepos, setSyncingRepos] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  useEffect(() => {
    window.api.settings.load().then(setForm)
  }, [])

  function set(field: keyof AppSettings, value: unknown) {
    setForm((f) => f ? ({ ...f, [field]: value }) : f)
    setSaved(false)
  }

  function setOperationProvider(op: IngestionOperation, patch: Partial<OperationProviderConfig>) {
    setForm((f) => {
      if (!f) return f
      const existing = f.providers?.[op] ?? {}
      return { ...f, providers: { ...f.providers, [op]: { ...existing, ...patch } } }
    })
    setSaved(false)
  }

  function clearOperationProvider(op: IngestionOperation) {
    setForm((f) => {
      if (!f) return f
      const { [op]: _removed, ...rest } = f.providers ?? {}
      return { ...f, providers: Object.keys(rest).length ? rest : undefined }
    })
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

  async function handleSyncTeamRepos() {
    setSyncingRepos(true)
    setSyncError(null)
    const result = await window.api.github.syncTeamRepos()
    setSyncingRepos(false)
    if (result.success) {
      set('githubRepos', result.repos ?? [])
      set('githubReposCachedAt', new Date().toISOString())
      setSaved(false)
    } else {
      setSyncError(result.error ?? 'Erro ao sincronizar repositórios')
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

          {/* Pré-processamento Gemini */}
          <Section
            icon={<Sparkles size={14} />}
            title="Pré-processamento Gemini"
            desc="Limpa transcrições antes de enviar ao Claude — reduz consumo de tokens em ~60%"
          >
            <Field
              label="Google AI API Key"
              hint={<>Obtenha em <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener" style={{ color: 'var(--accent)' }}>aistudio.google.com/app/apikey</a> — armazenada localmente</>}
            >
              <input
                style={styles.input}
                type="password"
                value={form.googleAiApiKey ?? ''}
                onChange={(e) => set('googleAiApiKey', e.target.value || undefined)}
                placeholder="AIza..."
              />
            </Field>
            <Field
              label="Ativar pré-processamento"
              hint={!form.googleAiApiKey ? 'Configure a API Key acima para ativar' : 'Remove ruído, preenchedores e estrutura o conteúdo antes da análise pelo Claude'}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: form.googleAiApiKey ? 'pointer' : 'default' }}>
                <input
                  type="checkbox"
                  checked={form.useGeminiPreprocessing ?? false}
                  disabled={!form.googleAiApiKey}
                  onChange={(e) => set('useGeminiPreprocessing', e.target.checked)}
                />
                <span style={{ fontSize: 12, color: form.googleAiApiKey ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  Usar Gemini Flash para pré-processar transcrições
                </span>
              </label>
            </Field>
          </Section>

          {/* Providers */}
          <Section
            icon={<Zap size={14} />}
            title="Providers de IA"
            desc="Configure qual provider usar globalmente e por operação — suporta Claude CLI e OpenRouter"
          >
            <Field
              label="Provider padrão"
              hint="Usado em todas as operações que não têm override configurado abaixo"
            >
              <select
                style={{ ...styles.input, cursor: 'pointer' }}
                value={form.defaultProvider ?? 'claude-cli'}
                onChange={(e) => set('defaultProvider', e.target.value as 'claude-cli' | 'openrouter')}
              >
                <option value="claude-cli">Claude Code CLI</option>
                <option value="openrouter" disabled={!form.openRouterApiKey}>OpenRouter{!form.openRouterApiKey ? ' (sem API key)' : ''}</option>
              </select>
            </Field>
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
              label="Modelo OpenRouter padrão"
              hint="Usado quando o provider é OpenRouter e nenhum override de modelo está configurado"
            >
              <input
                style={styles.input}
                type="text"
                value={form.openRouterModel ?? ''}
                onChange={(e) => set('openRouterModel', e.target.value || undefined)}
                placeholder="google/gemma-3-27b-it"
                disabled={!form.openRouterApiKey}
              />
            </Field>

            {/* Overrides por operação */}
            <div>
              <button
                onClick={() => setShowProviderOverrides((v) => !v)}
                style={{ ...styles.btnSecondary, width: '100%', justifyContent: 'space-between' }}
              >
                <span>Overrides por operação</span>
                {showProviderOverrides ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>

              {showProviderOverrides && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                    "padrão" herda o provider global acima. Overrides permitem testar modelos diferentes por operação.
                  </div>
                  <ProviderOverridesTable
                    providers={form.providers}
                    hasOpenRouterKey={!!form.openRouterApiKey}
                    defaultOpenRouterModel={form.openRouterModel ?? 'google/gemma-3-27b-it'}
                    onSet={setOperationProvider}
                    onClear={clearOperationProvider}
                  />
                </div>
              )}
            </div>
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

          {/* Jira */}
          <Section
            icon={<ExternalLink size={14} />}
            title="Jira"
            desc="Integração com Jira — busca métricas por pessoa"
          >
            <Field
              label="Ativar integração Jira"
              hint={!form.jiraEmail ? 'Configure os campos abaixo para ativar' : 'Busca métricas automaticamente no pipeline'}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: form.jiraEmail ? 'pointer' : 'default' }}>
                <input
                  type="checkbox"
                  checked={form.jiraEnabled ?? false}
                  disabled={!form.jiraEmail}
                  onChange={(e) => set('jiraEnabled', e.target.checked)}
                />
                <span style={{ fontSize: 12, color: form.jiraEmail ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  Usar Jira para métricas externas
                </span>
              </label>
            </Field>
            <Field
              label="URL do Jira"
              hint="Ex: https://seu-projeto.atlassian.net"
            >
              <input
                style={styles.input}
                type="text"
                value={form.jiraBaseUrl ?? ''}
                onChange={(e) => set('jiraBaseUrl', e.target.value || undefined)}
                placeholder="https://..."
              />
            </Field>
            <Field
              label="Email do Jira"
              hint="Email usado para autenticar no Jira"
            >
              <input
                style={styles.input}
                type="text"
                value={form.jiraEmail ?? ''}
                onChange={(e) => set('jiraEmail', e.target.value || undefined)}
                placeholder="seu@email.com"
              />
            </Field>
            <Field
              label="API Token"
              hint={<>Obtenha em <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener" style={{ color: 'var(--accent)' }}>id.atlassian.com</a></>}
            >
              <input
                style={styles.input}
                type="password"
                value={form.jiraApiToken ?? ''}
                onChange={(e) => set('jiraApiToken', e.target.value || undefined)}
                placeholder="••••••••"
              />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field
                label="Project Key"
                hint="Ex: TEAM"
              >
                <input
                  style={styles.input}
                  type="text"
                  value={form.jiraProjectKey ?? ''}
                  onChange={(e) => set('jiraProjectKey', e.target.value || undefined)}
                  placeholder="TEAM"
                />
              </Field>
              <Field
                label="Board ID"
                hint="ID do quadro Scrum"
              >
                <input
                  style={styles.input}
                  type="number"
                  value={form.jiraBoardId ?? ''}
                  onChange={(e) => set('jiraBoardId', e.target.value ? parseInt(e.target.value, 10) : undefined)}
                  placeholder="123"
                />
              </Field>
            </div>
            {form.jiraEnabled && !form.jiraBaseUrl && (
              <StatusLine ok={false}>
                <AlertCircle size={12} /> Configure a URL do Jira para ativar
              </StatusLine>
            )}
          </Section>

          {/* GitHub */}
          <Section
            icon={<Github size={14} />}
            title="GitHub"
            desc="Integração com GitHub — busca PRs, commits e reviews"
          >
            <Field
              label="Ativar integração GitHub"
              hint={!form.githubToken ? 'Configure os campos abaixo para ativar' : 'Busca métricas automaticamente no pipeline'}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: form.githubToken ? 'pointer' : 'default' }}>
                <input
                  type="checkbox"
                  checked={form.githubEnabled ?? false}
                  disabled={!form.githubToken}
                  onChange={(e) => set('githubEnabled', e.target.checked)}
                />
                <span style={{ fontSize: 12, color: form.githubToken ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  Usar GitHub para métricas externas
                </span>
              </label>
            </Field>
            <Field
              label="Personal Access Token"
              hint={<>Fine-grained PAT com permissões: Pull requests (Read), Contents (Read), Teams (Read). Gerar em <a href="https://github.com/settings/tokens" target="_blank" rel="noopener" style={{ color: 'var(--accent)' }}>github.com/settings/tokens</a></>}
            >
              <input
                style={styles.input}
                type="password"
                value={form.githubToken ?? ''}
                onChange={(e) => set('githubToken', e.target.value || undefined)}
                placeholder="ghp_..."
              />
            </Field>
            <Field
              label="Organização"
              hint="Nome da organização GitHub"
            >
              <input
                style={styles.input}
                type="text"
                value={form.githubOrg ?? ''}
                onChange={(e) => set('githubOrg', e.target.value || undefined)}
                placeholder="minha-empresa"
              />
            </Field>
            <Field
              label="Team Slug"
              hint={<>Slug do time no GitHub (ex: <code>conta-digital</code>). Deixe vazio se não usar teams.</>}
            >
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  style={styles.input}
                  type="text"
                  value={form.githubTeamSlug ?? ''}
                  onChange={(e) => set('githubTeamSlug', e.target.value || undefined)}
                  placeholder="conta-digital"
                />
                <button
                  onClick={handleSyncTeamRepos}
                  disabled={!form.githubTeamSlug || !form.githubToken || syncingRepos}
                  title={!form.githubTeamSlug ? 'Configure o team slug primeiro' : 'Sincronizar repositórios do time'}
                  style={{
                    ...styles.btnSecondary,
                    opacity: (!form.githubTeamSlug || !form.githubToken || syncingRepos) ? 0.6 : 1,
                  }}
                >
                  <RefreshCw size={12} style={syncingRepos ? { animation: 'spin 1s linear infinite' } : {}} />
                  {syncingRepos ? 'Sincronizando...' : 'Sincronizar'}
                </button>
              </div>
              {syncError && (
                <StatusLine ok={false}>{syncError}</StatusLine>
              )}
            </Field>
            <Field
              label="Repositórios"
              hint={form.githubReposCachedAt 
                ? `Sincronizado em ${new Date(form.githubReposCachedAt).toLocaleString('pt-BR')}. Deixe vazio para monitorar todos do team.`
                : 'Separe por vírgula. Deixe vazio se usar team slug acima.'
              }
            >
              <textarea
                style={{
                  ...styles.input,
                  width: '100%', height: 60,
                  resize: 'vertical', lineHeight: 1.6,
                }}
                value={(form.githubRepos ?? []).join(', ')}
                onChange={(e) => set('githubRepos', e.target.value.split(',').map(r => r.trim()).filter(Boolean) || undefined)}
                placeholder="repo1, repo2, repo3"
              />
            </Field>
          </Section>

        </div>
      </div>
    </div>
  )
}

const OPERATION_LABELS: Record<IngestionOperation, string> = {
  ingestionPass1:    'Ingestão Pass 1 (identificação)',
  ingestionPass2:    'Ingestão Pass 2 (enriquecimento)',
  ceremonySinals:    'Sinais de Cerimônia',
  ingestionDeep1on1: 'Deep 1:1',
  profileCompression:'Compressão de Perfil',
  agendaGeneration:  'Geração de Pauta',
  cycleReport:       'Relatório de Ciclo',
  autoAvaliacao:     'Auto-avaliação / Ciclo Gestor',
}

const ALL_OPERATIONS = Object.keys(OPERATION_LABELS) as IngestionOperation[]

function ProviderOverridesTable({
  providers, hasOpenRouterKey, defaultOpenRouterModel, onSet, onClear,
}: {
  providers: AppSettings['providers']
  hasOpenRouterKey: boolean
  defaultOpenRouterModel: string
  onSet: (op: IngestionOperation, patch: Partial<OperationProviderConfig>) => void
  onClear: (op: IngestionOperation) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
      {ALL_OPERATIONS.map((op, i) => {
        const override = providers?.[op]
        const isLast = i === ALL_OPERATIONS.length - 1
        return (
          <div key={op} style={{
            display: 'grid', gridTemplateColumns: '1fr auto auto',
            gap: 8, alignItems: 'center',
            padding: '8px 12px',
            borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
            background: override ? 'var(--surface-2)' : 'transparent',
          }}>
            <div style={{ fontSize: 12, color: override ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              {OPERATION_LABELS[op]}
            </div>
            <select
              style={{
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '4px 8px', fontSize: 11,
                color: 'var(--text-primary)', cursor: 'pointer',
                fontFamily: 'var(--font)',
              }}
              value={override?.provider ?? ''}
              onChange={(e) => {
                const val = e.target.value
                if (!val) { onClear(op); return }
                onSet(op, { provider: val as 'claude-cli' | 'openrouter', model: undefined, fallbackToClaude: val === 'openrouter' })
              }}
            >
              <option value="">padrão</option>
              <option value="claude-cli">Claude CLI</option>
              <option value="openrouter" disabled={!hasOpenRouterKey}>OpenRouter{!hasOpenRouterKey ? ' (sem key)' : ''}</option>
            </select>
            {override && (
              <input
                style={{
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  borderRadius: 4, padding: '4px 8px', fontSize: 11,
                  color: 'var(--text-primary)', width: 180,
                  fontFamily: 'var(--font-mono)',
                }}
                value={override.model ?? ''}
                onChange={(e) => onSet(op, { model: e.target.value || undefined })}
                placeholder={override.provider === 'openrouter' ? defaultOpenRouterModel : 'haiku / sonnet / opus'}
              />
            )}
            {!override && <div />}
          </div>
        )
      })}
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

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
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

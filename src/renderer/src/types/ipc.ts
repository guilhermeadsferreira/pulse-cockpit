// Shared types between main process and renderer.
// Keep this file free of Node.js-only imports.

export type LLMProvider = 'claude-cli' | 'openrouter'

export type IngestionOperation =
  | 'ingestionPass1'
  | 'ingestionPass2'
  | 'ceremonySinals'
  | 'ingestionDeep1on1'
  | 'profileCompression'
  | 'agendaGeneration'
  | 'cycleReport'
  | 'autoAvaliacao'

export interface OperationProviderConfig {
  provider: LLMProvider
  /** Model ID — ex: 'haiku', 'sonnet' para claude-cli; 'google/gemma-3-27b-it' para openrouter */
  model?: string
  /** Se true, faz fallback para claude-cli em caso de falha. Só se aplica quando provider='openrouter'. */
  fallbackToClaude?: boolean
}

export interface AppSettings {
  workspacePath: string
  claudeBinPath: string
  managerName?: string
  managerRole?: string
  /** Modelo Claude padrão para todas as operações via claude-cli. Padrão: 'haiku'. Aceita: 'haiku', 'sonnet', 'opus' */
  claudeDefaultModel?: string
  /** @deprecated Use claudeDefaultModel. Modelo Claude para o Deep 1:1 especificamente. */
  ingestionModel?: string
  /** API key do OpenRouter. Armazenada em plaintext (uso pessoal). */
  openRouterApiKey?: string
  /** @deprecated Use defaultProvider='openrouter' em vez de useHybridModel */
  useHybridModel?: boolean
  /** Modelo OpenRouter padrão. Ex: 'google/gemma-3-27b-it' */
  openRouterModel?: string
  /** API key do Google AI (Gemini) para pré-processamento de transcrições. Armazenada em plaintext. */
  googleAiApiKey?: string
  /** Ativar pré-processamento Gemini (limpa transcrições antes de enviar ao modelo). Só tem efeito se googleAiApiKey presente. */
  useGeminiPreprocessing?: boolean
  /** Provider padrão global. Todas as operações sem override usam este. */
  defaultProvider?: LLMProvider
  /** Override de provider por operação. Operações sem override herdam defaultProvider. */
  providers?: Partial<Record<IngestionOperation, OperationProviderConfig>>
  /** Nível mínimo de log. Padrão: 'info'. */
  logLevel?: 'debug' | 'info' | 'warn' | 'error'

  // Jira
  jiraBaseUrl?: string
  jiraEmail?: string
  jiraApiToken?: string
  jiraProjectKey?: string
  jiraBoardId?: number
  jiraEnabled?: boolean

  // GitHub
  githubToken?: string
  githubOrg?: string
  githubTeamSlug?: string
  githubRepos?: string[]
  githubReposCachedAt?: string
  githubEnabled?: boolean

  // Relatórios
  dailyReportEnabled?: boolean
  dailyReportTime?: string
  sprintReportEnabled?: boolean

  // Sustentação
  jiraSupportBoardId?: number
  jiraSupportProjectKey?: string
  /** Threshold de SLA por tipo de issue (tipo → dias). Padrão: todos os tipos com 5 dias. Ex: { Bug: 3, Task: 7 } */
  jiraSlaThresholds?: Record<string, number>
}

export type PersonLevel   = 'junior' | 'pleno' | 'senior' | 'staff' | 'principal' | 'manager'
export type PersonRelacao = 'liderado' | 'par' | 'gestor' | 'stakeholder'
export type PDIStatus     = 'nao_iniciado' | 'em_andamento' | 'concluido'
export type HealthStatus  = 'verde' | 'amarelo' | 'vermelho'

export interface PDIItem {
  objetivo: string
  status:   PDIStatus
  prazo?:   string
  evidencias?: string[]   // Evidencias cumulativas de multiplos artefatos
}

export interface PersonConfig {
  schema_version:        number
  nome:                  string
  slug:                  string
  cargo:                 string
  nivel:                 PersonLevel
  area?:                 string
  squad?:                string
  relacao:               PersonRelacao
  inicio_na_funcao?:     string
  inicio_na_empresa?:    string
  frequencia_1on1_dias:  number
  em_processo_promocao:  boolean
  objetivo_cargo_alvo?:  string
  pdi:                   PDIItem[]
  notas_manuais?:        string
  alerta_ativo:          boolean
  motivo_alerta?:        string
  criado_em:             string
  atualizado_em:         string
  // Identidade externa (V3)
  jiraEmail?:            string
  githubUsername?:       string
  jiraBoardId?:          number
}

// ─── External Intelligence ───────────────────────────────────────────────────

export interface ExternalJiraSnapshot {
  sprintAtual?: { nome: string; id: number } | null
  issuesAbertas: number
  issuesFechadasSprint: number
  storyPointsSprint: number
  workloadScore: 'alto' | 'medio' | 'baixo'
  bugsAtivos: number
  blockersAtivos: Array<{ key: string; summary: string }>
  tempoMedioCicloDias: number
}

export interface ExternalGitHubSnapshot {
  commits30d: number
  commitsPorSemana: number
  prsMerged30d: number
  prsAbertos: number
  prsRevisados: number
  tempoMedioAbertoDias: number
  tempoMedioReviewDias: number
  tamanhoMedioPR: { additions: number; deletions: number }
}

export interface ExternalCrossInsight {
  tipo: string
  severidade: 'alta' | 'media' | 'baixa'
  descricao: string
  evidencia?: string
  acaoSugerida?: string
}

export interface ExternalDataSnapshot {
  atualizadoEm: string
  jira: ExternalJiraSnapshot | null
  github: ExternalGitHubSnapshot | null
  insights: ExternalCrossInsight[]
}

export interface SupportTicket {
  key: string
  summary: string
  type: string
  labels: string[]
  assignee: string | null
  /** Dias desde criação */
  ageDias: number
  status: string
  /** true se age > threshold configurado para seu tipo */
  slaBreached: boolean
  /** Últimos 3 comentários (body + author) */
  recentComments: Array<{ author: string; body: string; created: string }>
}

export interface SupportBoardSnapshot {
  atualizadoEm: string
  /** Tickets abertos (status != Done) nos últimos 30 dias ou abertos antes disso */
  ticketsAbertos: number
  /** Tickets fechados nos últimos 30 dias */
  ticketsFechadosUltimos30d: number
  /** Top 5 tipos por frequência (abertos + fechados nos últimos 30d) */
  topTipos: Array<{ tipo: string; count: number }>
  /** Top 5 labels por frequência */
  topLabels: Array<{ label: string; count: number }>
  /** Tickets com SLA estourado */
  ticketsEmBreach: SupportTicket[]
  /** Agrupamento por assignee: slug → contagem de tickets abertos */
  porAssignee: Record<string, number>
  /** null = sem tickets resolvidos nos últimos 7 dias */
  complianceRate7d: number | null
  /** null = sem tickets resolvidos nos últimos 30 dias */
  complianceRate30d: number | null
  /** Últimos 30 snapshots diários para deltas e mini charts */
  history: SustentacaoHistoryEntry[]
  /** Vazão semanal: tickets abertos vs resolvidos por semana (últimas 8 semanas) */
  inOutSemanal: InOutSemanalEntry[]
  /** Tipos recorrentes: tipo+label com >2 ocorrências nos últimos 30 dias */
  recorrentesDetectados: RecorrenteDetectado[]
  /** Alertas proativos calculados a cada refresh. Array vazio = sem alertas. */
  alertas: SustentacaoAlerta[]
}

/** Entrada de histórico diário de sustentação (sem ticketsEmBreach completo para manter history.json leve) */
export interface SustentacaoHistoryEntry {
  /** Data no formato YYYY-MM-DD (chave de deduplica diária) */
  date: string
  /** Timestamp Unix ms do fetch */
  fetchedAt: number
  ticketsAbertos: number
  ticketsFechadosUltimos30d: number
  /** Apenas o número, não o array completo de SupportTicket */
  breachCount: number
  /** null = sem tickets resolvidos na janela (não exibir percentual, exibir "—") */
  complianceRate7d: number | null
  /** null = sem tickets resolvidos na janela */
  complianceRate30d: number | null
}

/** Alerta proativo calculado a cada refresh de dados de sustentacao */
export interface SustentacaoAlerta {
  /** Identificador da condicao que gerou o alerta */
  tipo: 'breach_crescente' | 'ticket_envelhecendo' | 'fila_crescendo' | 'spike_incidente'
  /** Mensagem legivel para exibir no banner */
  mensagem: string
  /** Severidade visual */
  severidade: 'critico' | 'atencao'
}

/** Entrada de vazão semanal: tickets abertos (in) vs resolvidos (out) na semana. */
export interface InOutSemanalEntry {
  /** Início da semana no formato YYYY-MM-DD (segunda-feira) */
  semana: string
  /** Tickets criados na semana */
  in: number
  /** Tickets resolvidos na semana */
  out: number
}

/** Tipo de ticket recorrente detectado nos últimos 30 dias (>2 ocorrências). */
export interface RecorrenteDetectado {
  /** Tipo do ticket (ex: "Bug", "Task") */
  tipo: string
  /** Label associado (ex: "auth", "performance") — null se sem label relevante */
  label: string | null
  /** Número de ocorrências nos últimos 30 dias */
  ocorrencias: number
}

export interface ExternalHistoricoEntry {
  jira?:   { issuesAbertas?: number; storyPointsSprint?: number } | null
  github?: { commits30d?: number; prsMerged30d?: number; prsRevisados?: number } | null
}

export interface ArtifactMeta {
  path:      string
  fileName:  string
  tipo:      string
  date:      string
}

export interface ArtifactFeedItem {
  path:       string
  fileName:   string
  titulo:     string
  tipo:       string
  date:       string
  personSlug: string
  personNome: string
  resumo:     string
}

export interface PerfilFrontmatter {
  slug:                  string
  schema_version:        number
  ultima_atualizacao:    string
  ultima_ingestao?:      string        // date YYYY-MM-DD — set on every successful ingestion
  total_artefatos:       number
  ultimo_1on1:           string | null
  acoes_pendentes_count: number        // computed from ActionRegistry (injected in IPC handler)
  alertas_ativos:        string[]
  saude:                 'verde' | 'amarelo' | 'vermelho'
  ultima_confianca?:     'alta' | 'media' | 'baixa'
  necessita_1on1:        boolean
  motivo_1on1:           string | null
  alerta_estagnacao:     boolean
  motivo_estagnacao:     string | null
  sinal_evolucao:        boolean
  evidencia_evolucao:    string | null
  dados_stale?:          boolean       // true if no ingestion in 30+ days
  tendencia_emocional?:  'estavel' | 'melhorando' | 'deteriorando' | 'novo_sinal' | null
  nota_tendencia?:       string | null
}

export type ActionStatus   = 'open' | 'in_progress' | 'done' | 'cancelled'
export type ActionOwner    = 'gestor' | 'liderado' | 'terceiro'
export type ActionPriority = 'baixa' | 'media' | 'alta'

export interface ActionStatusHistoryEntry {
  status: ActionStatus
  date: string        // YYYY-MM-DD
  source: 'manual' | 'ingestion' | '1on1-deep' | 'jira-sync' | 'escalation' | 'system'
}

export interface Action {
  id:               string
  personSlug:       string
  texto:            string           // texto completo legado: "Responsavel: descricao [até prazo]"
  descricao?:       string           // descrição limpa da tarefa (sem prefixo do responsável)
  status:           ActionStatus
  criadoEm:         string
  // Structured fields (populated from T1.3 schema)
  responsavel?:     string           // nome legível do responsável
  responsavel_slug?: string | null   // slug se for pessoa cadastrada
  prazo?:           string | null    // YYYY-MM-DD
  owner?:           ActionOwner      // quem executa a ação
  prioridade?:      ActionPriority
  concluidoEm?:     string | null
  fonteArtefato?:   string
  pdi_objetivo_ref?: string
  contexto?:        string
  statusHistory?:   ActionStatusHistoryEntry[]
}

export interface PerfilData {
  raw:          string
  frontmatter:  Partial<PerfilFrontmatter>
}

export type QueueItemStatus = 'queued' | 'processing' | 'done' | 'pending' | 'error'

export interface QueueItem {
  id:                    string
  filePath:              string
  fileName:              string
  status:                QueueItemStatus
  personSlug?:           string
  tipo?:                 string
  summary?:              string
  error?:                string
  startedAt?:            number
  finishedAt?:           number
  // People detected by AI
  pessoasIdentificadas?: string[]              // all slugs mentioned in the artifact
  naoCadastradas?:       string[]              // slugs that Claude found but aren't in the registry
  novasNomes?:           Record<string, string> // slug → nome for detected people
}

export interface IngestionEvent {
  filePath: string
  fileName: string
}

export interface IngestionResult {
  filePath:     string
  personSlug?:  string
  tipo:         string
  summary:      string
}

export interface IngestionError {
  filePath:    string
  error:       string
  rawOutput?:  string
}

export interface DetectedPerson {
  slug:         string
  nome:         string
  firstSeen:    string
  lastSeen:     string
  mentionCount: number
  sourceFiles:  string[]
}

export interface CycleReportParams {
  personSlug:    string
  periodoInicio: string
  periodoFim:    string
}

export interface PautaMeta {
  fileName: string
  date:     string
  path:     string
}

export interface AgendaResult {
  success:  boolean
  path?:    string
  markdown?: string
  result?: {
    follow_ups:          string[]
    temas:               string[]
    perguntas_sugeridas: string[]
    alertas:             string[]
    reconhecimentos:     string[]
  }
  error?: string
}

export interface CycleReportResult {
  success:  boolean
  path?:    string
  markdown?: string
  result?: {
    linha_do_tempo:            Array<{ data: string; evento: string }>
    entregas_e_conquistas:     string[]
    padroes_de_comportamento:  string[]
    evolucao_frente_ao_cargo:  string
    pontos_de_desenvolvimento:  string[]
    conclusao_para_calibracao: string
    flag_promovibilidade:      'sim' | 'nao' | 'avaliar'
  }
  error?: string
}

// ── Módulo Eu ─────────────────────────────────────────────────

export type DemandaStatus = 'open' | 'done'
export type DemandaOrigem = 'Líder' | 'Liderado' | 'Par' | 'Eu' | 'Sistema'

export interface Demanda {
  id:              string
  descricao:       string
  descricaoLonga?: string | null  // contexto: de onde veio (ex: "1:1 com Luis Fin", "Daily Conta Digital")
  origem:          DemandaOrigem
  pessoaSlug?:     string | null  // slug da pessoa relacionada (para linkar ao perfil)
  prazo?:          string | null  // YYYY-MM-DD
  criadoEm:        string         // YYYY-MM-DD
  atualizadoEm:    string         // YYYY-MM-DD
  status:          DemandaStatus
  concluidoEm?:    string | null
}

export type CicloEntryTipo = 'manual' | 'artifact'

export interface CicloEntry {
  id:        string
  tipo:      CicloEntryTipo
  texto:     string              // manual text or AI resumo
  criadoEm:  string             // YYYY-MM-DD
  titulo?:   string             // for artifact entries
  filePath?: string             // absolute path to .md file
}

export interface AutoavaliacaoParams {
  periodoInicio: string          // YYYY-MM-DD
  periodoFim:    string          // YYYY-MM-DD
}

export interface AutoavaliacaoResult {
  success:   boolean
  path?:     string
  markdown?: string
  result?: {
    o_que_fiz_e_entreguei:    string[]
    como_demonstrei_valores:  string[]
    como_me_vejo_no_futuro:   string
  }
  error?: string
}

export interface CicloIngestResult {
  success:  boolean
  entry?:   CicloEntry
  error?:   string
}

export interface DocItem {
  fileName: string
  filePath: string
  date:     string   // YYYY-MM-DD
}

export interface CerimoniaSinalResult {
  sentimentos: Array<{ valor: 'positivo' | 'neutro' | 'ansioso' | 'frustrado' | 'desengajado'; aspecto: string }>
  /** @deprecated use sentimentos */
  sentimento_detectado?: 'positivo' | 'neutro' | 'ansioso' | 'frustrado' | 'desengajado'
  nivel_engajamento: 1 | 2 | 3 | 4 | 5
  indicador_saude: 'verde' | 'amarelo' | 'vermelho'
  motivo_indicador: string
  soft_skills_observadas: string[]
  hard_skills_observadas: string[]
  pontos_de_desenvolvimento: string[]
  feedbacks_positivos: string[]
  feedbacks_negativos: string[]
  temas_detectados: string[]
  sinal_evolucao: boolean
  evidencia_evolucao: string | null
  necessita_1on1: boolean
  motivo_1on1: string | null
  confianca: 'alta' | 'media' | 'baixa'
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  timestamp: string
  level: LogLevel
  module: string
  message: string
  data?: Record<string, unknown>
}

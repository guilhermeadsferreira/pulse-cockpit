// Shared types between main process and renderer.
// Keep this file free of Node.js-only imports.

export interface AppSettings {
  workspacePath: string
  claudeBinPath: string
  managerName?: string
  managerRole?: string
  /** API key do OpenRouter para modelo híbrido. Armazenada em plaintext (uso pessoal). */
  openRouterApiKey?: string
  /** Ativar modelo híbrido (OpenRouter para passes elegíveis). Só tem efeito se openRouterApiKey presente. */
  useHybridModel?: boolean
}

export type PersonLevel   = 'junior' | 'pleno' | 'senior' | 'staff' | 'principal' | 'manager'
export type PersonRelacao = 'liderado' | 'par' | 'gestor' | 'stakeholder'
export type PDIStatus     = 'nao_iniciado' | 'em_andamento' | 'concluido'
export type HealthStatus  = 'verde' | 'amarelo' | 'vermelho'

export interface PDIItem {
  objetivo: string
  status:   PDIStatus
  prazo?:   string
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
}

export type ActionStatus   = 'open' | 'in_progress' | 'done' | 'cancelled'
export type ActionOwner    = 'gestor' | 'liderado' | 'terceiro'
export type ActionPriority = 'baixa' | 'media' | 'alta'

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
export type DemandaOrigem = 'Líder' | 'Liderado' | 'Par' | 'Eu'

export interface Demanda {
  id:              string
  descricao:       string
  descricaoLonga?: string | null  // descrição detalhada opcional
  origem:          DemandaOrigem
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
  sentimento_detectado: 'positivo' | 'neutro' | 'ansioso' | 'frustrado' | 'desengajado'
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

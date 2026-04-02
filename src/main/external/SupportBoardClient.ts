import { JiraClient, type JiraConfig, type JiraIssue } from './JiraClient'
import { Logger } from '../logging/Logger'
import type { SupportBoardSnapshot, SupportTicket, InOutSemanalEntry, RecorrenteDetectado, SustentacaoAlerta, SustentacaoHistoryEntry } from '../../renderer/src/types/ipc'
import type { AppSettings } from '../registry/SettingsManager'

const log = Logger.getInstance().child('SupportBoardClient')

const DEFAULT_SLA_DIAS = 5
const BREACH_COMMENTS_MAX = 3
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const TOP_N = 5
const IN_OUT_SEMANAS = 8

export interface SupportBoardInput {
  config: JiraConfig
  projectKey: string
  slaThresholds?: Record<string, number>
}

function ageDias(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24))
}

function topN(counts: Record<string, number>, n: number): Array<{ key: string; count: number }> {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, count }))
}

/**
 * Calcula SLA compliance rate para uma janela de dias.
 * Retorna null quando não há tickets resolvidos na janela (exibir "—" na UI, não 100%).
 * Ticket fechado no mesmo dia que aberto (ageDias = 0) conta como compliant (0 <= threshold).
 */
function calcularCompliance(
  issues: Array<{ statusCategory: string; resolved: string | null; created: string; type: string }>,
  slaThresholds: Record<string, number>,
  windowDias: number
): number | null {
  const cutoff = Date.now() - windowDias * 24 * 60 * 60 * 1000
  const resolved = issues.filter(
    (i) =>
      i.statusCategory === 'done' &&
      i.resolved !== null &&
      new Date(i.resolved).getTime() >= cutoff
  )

  if (resolved.length === 0) return null // sem dados = não exibir percentual

  const compliant = resolved.filter((i) => {
    const threshold = slaThresholds[i.type] ?? DEFAULT_SLA_DIAS
    const ageMs = new Date(i.resolved!).getTime() - new Date(i.created).getTime()
    const ageDiasResolved = Math.floor(ageMs / (1000 * 60 * 60 * 24))
    return ageDiasResolved <= threshold
  })

  return Math.round((compliant.length / resolved.length) * 100)
}

/**
 * Agrupa issues por semana de criação (in) e semana de resolução (out).
 * Retorna últimas N semanas com segunda-feira como chave YYYY-MM-DD.
 */
function calcularInOutSemanal(
  issues: Array<{ created: string; resolved: string | null; statusCategory: string }>,
  semanas: number
): InOutSemanalEntry[] {
  const result: InOutSemanalEntry[] = []
  const now = new Date()
  // Retroceder ao último segunda-feira
  const dayOfWeek = now.getDay() // 0=domingo, 1=segunda...
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const thisMonday = new Date(now)
  thisMonday.setHours(0, 0, 0, 0)
  thisMonday.setDate(now.getDate() - daysToMonday)

  for (let i = semanas - 1; i >= 0; i--) {
    const weekStart = new Date(thisMonday)
    weekStart.setDate(thisMonday.getDate() - i * 7)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 7)

    const semanaKey = weekStart.toISOString().slice(0, 10)

    const inCount = issues.filter((issue) => {
      const t = new Date(issue.created).getTime()
      return t >= weekStart.getTime() && t < weekEnd.getTime()
    }).length

    const outCount = issues.filter((issue) => {
      if (!issue.resolved || issue.statusCategory !== 'done') return false
      const t = new Date(issue.resolved).getTime()
      return t >= weekStart.getTime() && t < weekEnd.getTime()
    }).length

    result.push({ semana: semanaKey, in: inCount, out: outCount })
  }

  return result
}

/**
 * Detecta tipos+labels recorrentes (>2 ocorrências nos últimos 30 dias).
 * Considera todos os tickets (abertos e fechados) criados nos últimos 30d.
 * Combina tipo e primeira label; se sem label, usa null.
 */
function detectarRecorrentes(
  issues: Array<{ type: string; labels: string[]; created: string }>,
  windowDias: number
): RecorrenteDetectado[] {
  const cutoff = Date.now() - windowDias * 24 * 60 * 60 * 1000
  const recent = issues.filter((i) => new Date(i.created).getTime() >= cutoff)

  // Chave: "tipo||label" (usa primeira label ou "__none__")
  const counts: Record<string, { tipo: string; label: string | null; ocorrencias: number }> = {}

  for (const issue of recent) {
    const label = issue.labels.length > 0 ? issue.labels[0] : null
    const chave = `${issue.type}||${label ?? '__none__'}`
    if (!counts[chave]) {
      counts[chave] = { tipo: issue.type, label, ocorrencias: 0 }
    }
    counts[chave].ocorrencias++
  }

  return Object.values(counts)
    .filter((r) => r.ocorrencias > 2)
    .sort((a, b) => b.ocorrencias - a.ocorrencias)
}

/** Variante interna que retorna snapshot + issues raw para calcular spike (D-07) */
export async function fetchSupportBoardMetricsWithIssues(
  input: SupportBoardInput
): Promise<{ snapshot: Omit<SupportBoardSnapshot, 'alertas'>; issues: JiraIssue[] }> {
  const { config, projectKey, slaThresholds = {} } = input
  const client = new JiraClient(config)

  // JQL sem filtro de assignee — busca todos os tickets do projeto
  const jql = `project = "${projectKey}" AND created >= -90d ORDER BY created DESC`

  log.info('SupportBoardClient: buscando tickets', { projectKey })

  const issues = await client.searchIssuesByAssignee('', jql)

  log.info('SupportBoardClient: resultado', { projectKey, totalIssues: issues.length })

  const now = Date.now()
  const thirtyDaysAgo = now - THIRTY_DAYS_MS

  const abertos = issues.filter((i) => i.statusCategory !== 'done')
  const fechados30d = issues.filter(
    (i) => i.statusCategory === 'done' && i.resolved && new Date(i.resolved).getTime() >= thirtyDaysAgo
  )

  // Contagens por tipo — abertos + fechados nos últimos 30d
  const tipoCounts: Record<string, number> = {}
  const labelCounts: Record<string, number> = {}
  const assigneeCounts: Record<string, number> = {}

  const ticketsParaContagem = [...abertos, ...fechados30d]
  for (const issue of ticketsParaContagem) {
    tipoCounts[issue.type] = (tipoCounts[issue.type] ?? 0) + 1
  }

  // labelCounts e assigneeCounts apenas sobre tickets abertos
  for (const issue of abertos) {
    for (const label of issue.labels) {
      labelCounts[label] = (labelCounts[label] ?? 0) + 1
    }

    const key = issue.assignee ?? 'sem_assignee'
    assigneeCounts[key] = (assigneeCounts[key] ?? 0) + 1
  }

  // Detectar tickets em SLA breach
  const breachedIssues = abertos.filter((i) => {
    const threshold = slaThresholds[i.type] ?? DEFAULT_SLA_DIAS
    return ageDias(i.created) > threshold
  })

  // Buscar comentários recentes para cada ticket em breach
  const ticketsEmBreach: SupportTicket[] = []
  for (const issue of breachedIssues) {
    let recentComments: Array<{ author: string; body: string; created: string }> = []
    try {
      const comments = await client.getIssueComments(issue.key, BREACH_COMMENTS_MAX)
      recentComments = comments.map((c) => ({ author: c.author, body: c.body, created: c.created }))
    } catch (err) {
      log.warn('SupportBoardClient: falha ao buscar comentários (graceful)', {
        issueKey: issue.key,
        error: err instanceof Error ? err.message : String(err),
      })
    }

    ticketsEmBreach.push({
      key: issue.key,
      summary: issue.summary,
      type: issue.type,
      labels: issue.labels,
      assignee: issue.assignee,
      ageDias: ageDias(issue.created),
      status: issue.status,
      slaBreached: true,
      recentComments,
    })
  }

  const topTipos = topN(tipoCounts, TOP_N).map(({ key, count }) => ({ tipo: key, count }))
  const topLabels = topN(labelCounts, TOP_N).map(({ key, count }) => ({ label: key, count }))

  // Calcular compliance rates (usa JiraIssue[] completo — não disponível no snapshot)
  const complianceRate7d = calcularCompliance(issues, slaThresholds, 7)
  const complianceRate30d = calcularCompliance(issues, slaThresholds, 30)

  const inOutSemanal = calcularInOutSemanal(issues, IN_OUT_SEMANAS)
  const recorrentesDetectados = detectarRecorrentes(issues, 30)

  const snapshot: Omit<SupportBoardSnapshot, 'alertas'> = {
    atualizadoEm: new Date().toISOString(),
    ticketsAbertos: abertos.length,
    ticketsFechadosUltimos30d: fechados30d.length,
    topTipos,
    topLabels,
    ticketsEmBreach,
    porAssignee: assigneeCounts,
    complianceRate7d,
    complianceRate30d,
    history: [], // preenchido pelo IPC handler após ler history.json
    inOutSemanal,
    recorrentesDetectados,
  }

  return { snapshot, issues }
}

export async function fetchSupportBoardMetrics(input: SupportBoardInput): Promise<SupportBoardSnapshot> {
  const { snapshot, issues: _issues } = await fetchSupportBoardMetricsWithIssues(input)
  return { ...snapshot, alertas: [] }
}

/** Thresholds fixos — nao configuravel nesta fase (per D-08) */
const ALRT_BREACH_DELTA = 2        // breach crescente: +2 vs 7 dias atras
const ALRT_SLA_MULTIPLIER = 2      // ticket envelhecendo: >2x o SLA do tipo
const ALRT_FILA_DAYS = 3           // fila crescendo: 3 dias consecutivos subindo
const ALRT_SPIKE_COUNT = 3         // spike: 3+ tickets do mesmo tipo+label
const ALRT_SPIKE_WINDOW_MS = 2 * 60 * 60 * 1000  // janela spike: 2h

/**
 * Calcula alertas proativos a partir dos dados disponiveis.
 * Retorna array vazio quando sem alertas — nunca lanca excecao.
 *
 * @param snapshot - snapshot atual (sem alertas ainda)
 * @param history  - entradas diarias do history.json (pode ser [])
 * @param issues   - issues raw do Jira (para calculo de spike por created timestamp)
 * @param slaThresholds - mapa tipo → dias (default 5 para tipos nao mapeados)
 */
export function calcularAlertas(
  snapshot: Omit<SupportBoardSnapshot, 'alertas'>,
  history: SustentacaoHistoryEntry[],
  issues: Array<{ created: string; type: string; labels: string[]; statusCategory: string }>,
  slaThresholds: Record<string, number> = {}
): SustentacaoAlerta[] {
  const alertas: SustentacaoAlerta[] = []

  // D-04: Breach crescente — breach atual vs 7 dias atras por +2 ou mais
  if (history.length >= 2) {
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    const ref = history
      .filter((e) => e.fetchedAt <= Date.now() - sevenDaysMs)
      .sort((a, b) => b.fetchedAt - a.fetchedAt)[0]
    if (ref) {
      const delta = snapshot.ticketsEmBreach.length - ref.breachCount
      if (delta >= ALRT_BREACH_DELTA) {
        alertas.push({
          tipo: 'breach_crescente',
          mensagem: `Breach subiu ${delta} tickets em relacao a 7 dias atras (${ref.breachCount} → ${snapshot.ticketsEmBreach.length})`,
          severidade: delta >= 5 ? 'critico' : 'atencao',
        })
      }
    }
  }

  // D-05: Ticket envelhecendo — aberto por mais de 2x o SLA do seu tipo
  for (const ticket of snapshot.ticketsEmBreach) {
    const threshold = slaThresholds[ticket.type] ?? DEFAULT_SLA_DIAS
    if (ticket.ageDias > ALRT_SLA_MULTIPLIER * threshold) {
      alertas.push({
        tipo: 'ticket_envelhecendo',
        mensagem: `${ticket.key}: ${ticket.ageDias}d aberto (limite ${threshold}d, threshold critico ${ALRT_SLA_MULTIPLIER * threshold}d)`,
        severidade: 'critico',
      })
    }
  }

  // D-06: Fila crescendo — ticketsAbertos subiu N dias consecutivos
  if (history.length >= ALRT_FILA_DAYS) {
    const recent = history
      .slice()
      .sort((a, b) => a.fetchedAt - b.fetchedAt)
      .slice(-(ALRT_FILA_DAYS + 1))  // ultimos N+1 para verificar N consecutivos
    let consecutivos = 0
    for (let i = 1; i < recent.length; i++) {
      if (recent[i].ticketsAbertos > recent[i - 1].ticketsAbertos) {
        consecutivos++
      } else {
        consecutivos = 0
      }
    }
    if (consecutivos >= ALRT_FILA_DAYS) {
      alertas.push({
        tipo: 'fila_crescendo',
        mensagem: `Fila crescendo ha ${consecutivos} dias consecutivos (${recent[recent.length - 1].ticketsAbertos} tickets abertos)`,
        severidade: 'atencao',
      })
    }
  }

  // D-07: Spike de incidente — 3+ tickets do mesmo tipo+label criados nas ultimas 2h
  const cutoffSpike = Date.now() - ALRT_SPIKE_WINDOW_MS
  const abertosRecentes = issues.filter(
    (i) => i.statusCategory !== 'done' && new Date(i.created).getTime() >= cutoffSpike
  )
  const spikeCounts: Record<string, number> = {}
  for (const issue of abertosRecentes) {
    for (const label of issue.labels.length > 0 ? issue.labels : ['_sem_label']) {
      const key = `${issue.type}::${label}`
      spikeCounts[key] = (spikeCounts[key] ?? 0) + 1
    }
  }
  for (const [key, count] of Object.entries(spikeCounts)) {
    if (count >= ALRT_SPIKE_COUNT) {
      const [tipo, label] = key.split('::')
      const labelDesc = label === '_sem_label' ? '' : ` / ${label}`
      alertas.push({
        tipo: 'spike_incidente',
        mensagem: `${count} tickets "${tipo}${labelDesc}" criados nas ultimas 2h — possivel incidente`,
        severidade: 'critico',
      })
    }
  }

  return alertas
}

/**
 * Busca snapshot de sustentação para uso direto nos generators (sem IPC).
 * Retorna null quando sustentação não está configurada ou ocorre erro (graceful degradation).
 * NÃO lê nem grava history.json — isso é responsabilidade do IPC handler.
 */
export async function fetchSustentacaoForReport(settings: AppSettings): Promise<SupportBoardSnapshot | null> {
  if (!settings.jiraEnabled || !settings.jiraBaseUrl || !settings.jiraApiToken || !settings.jiraSupportProjectKey) {
    return null
  }
  try {
    const config: JiraConfig = {
      baseUrl: settings.jiraBaseUrl,
      email: settings.jiraEmail ?? '',
      apiToken: settings.jiraApiToken,
    }
    return await fetchSupportBoardMetrics({
      config,
      projectKey: settings.jiraSupportProjectKey,
      slaThresholds: settings.jiraSlaThresholds ?? {},
    })
  } catch (err) {
    log.warn('fetchSustentacaoForReport: falhou (graceful)', { error: err instanceof Error ? err.message : String(err) })
    return null
  }
}

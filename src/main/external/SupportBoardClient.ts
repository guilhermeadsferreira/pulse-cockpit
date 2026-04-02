import { JiraClient, type JiraConfig } from './JiraClient'
import { Logger } from '../logging/Logger'
import type { SupportBoardSnapshot, SupportTicket, InOutSemanalEntry, RecorrenteDetectado } from '../../renderer/src/types/ipc'
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

export async function fetchSupportBoardMetrics(input: SupportBoardInput): Promise<SupportBoardSnapshot> {
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

  return {
    atualizadoEm: new Date().toISOString(),
    ticketsAbertos: abertos.length,
    ticketsFechadosUltimos30d: fechados30d.length,
    topTipos,
    topLabels,
    ticketsEmBreach,
    porAssignee: assigneeCounts,
    complianceRate7d,
    complianceRate30d,
    history: [], // preenchido pelo IPC handler após ler history.json (ver Plan 02)
    inOutSemanal,
    recorrentesDetectados,
  }
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

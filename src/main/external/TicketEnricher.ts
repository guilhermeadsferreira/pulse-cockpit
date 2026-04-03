import type { SupportTicket, BlockerCategory, DeterministicContext, EnrichedSupportTicket } from '../../renderer/src/types/ipc'

/**
 * Regras de inferência de bloqueador a partir do status do ticket.
 * Case-insensitive. Primeira match ganha.
 */
const BLOCKER_STATUS_RULES: Array<{ pattern: RegExp; category: BlockerCategory }> = [
  { pattern: /bankly|parceiro|fornecedor|aguardando externo|vendor/i, category: 'fornecedor_externo' },
  { pattern: /deploy|release|qa|homolog/i, category: 'deploy' },
  { pattern: /produto|po\b|defini[çc][aã]o|backlog produto/i, category: 'produto' },
  { pattern: /refinamento cx|cliente|solicitante|aguardando cliente/i, category: 'cliente' },
  { pattern: /desenvolvimento|em progresso|code review|in progress/i, category: 'dev' },
]

/**
 * Infere a categoria de bloqueador a partir do status e labels do ticket.
 * Retorna null se nenhuma regra casar.
 */
export function inferBlockerFromStatus(status: string, labels: string[]): BlockerCategory | null {
  // Tentar status primeiro
  for (const rule of BLOCKER_STATUS_RULES) {
    if (rule.pattern.test(status)) return rule.category
  }

  // Tentar labels como fallback
  const labelsStr = labels.join(' ')
  for (const rule of BLOCKER_STATUS_RULES) {
    if (rule.pattern.test(labelsStr)) return rule.category
  }

  return null
}

/**
 * Calcula staleness baseado em dias desde o último comentário.
 * - stale: >7 dias sem atividade
 * - active: 3-7 dias
 * - recent: <3 dias
 */
export function computeStaleness(daysSinceLastComment: number | null): 'stale' | 'active' | 'recent' {
  if (daysSinceLastComment === null) return 'stale'
  if (daysSinceLastComment > 7) return 'stale'
  if (daysSinceLastComment >= 3) return 'active'
  return 'recent'
}

/**
 * Enriquece um SupportTicket com contexto determinístico.
 * Função pura, sem side effects.
 */
export function enrichDeterministic(ticket: SupportTicket): DeterministicContext {
  const latestComment = ticket.recentComments.length > 0
    ? ticket.recentComments[0] // recentComments já vem em ordem DESC (mais recente primeiro)
    : null

  const daysSinceLastComment = latestComment
    ? Math.floor((Date.now() - new Date(latestComment.created).getTime()) / (1000 * 60 * 60 * 24))
    : null

  const lastCommentAuthor = latestComment?.author ?? null

  const inferredBlocker = inferBlockerFromStatus(ticket.status, ticket.labels)

  const staleness = computeStaleness(daysSinceLastComment)

  return {
    daysSinceLastComment,
    lastCommentAuthor,
    inferredBlocker,
    staleness,
  }
}

/**
 * Constrói um EnrichedSupportTicket a partir de um SupportTicket.
 * Os fullComments são os recentComments em ordem cronológica (mais antigo primeiro).
 */
export function buildEnrichedTicket(ticket: SupportTicket): EnrichedSupportTicket {
  const deterministicContext = enrichDeterministic(ticket)

  // Inverter para ordem cronológica (mais antigo primeiro) para narrativa
  const fullComments = [...ticket.recentComments].reverse()

  return {
    ...ticket,
    fullComments,
    deterministicContext,
    intelligence: null,
  }
}

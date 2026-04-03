/**
 * Prompt para análise com IA por ticket individual de sustentação.
 * Gera narrativa, bloqueador, ação recomendada e risco por ticket,
 * além de um resumo executivo agrupado.
 */

import type { EnrichedSupportTicket, TicketAnalysisSnapshot } from '../../renderer/src/types/ipc'

const BATCH_SIZE = 5

/**
 * Divide tickets em batches para respeitar limites de token/timeout.
 */
export function batchTickets(tickets: EnrichedSupportTicket[]): EnrichedSupportTicket[][] {
  const batches: EnrichedSupportTicket[][] = []
  for (let i = 0; i < tickets.length; i += BATCH_SIZE) {
    batches.push(tickets.slice(i, i + BATCH_SIZE))
  }
  return batches
}

export interface AssigneeContext {
  nome: string
  nivel: string
  workloadScore: string
  issuesAbertas: number
  blockersAtivos: number
}

/**
 * Constrói o prompt de análise por ticket para um batch.
 *
 * @param tickets - Tickets enriquecidos com comentários completos e contexto determinístico
 * @param previous - Análise anterior para tracking de evolução (null se primeira vez)
 * @param isLastBatch - Se é o último batch (gera executiveSummary apenas no último)
 * @param allTicketKeys - Todas as keys sendo analisadas (para o executiveSummary do último batch)
 * @param assigneeContextMap - Contexto de cada assignee (opcional)
 */
export function buildTicketAnalysisPrompt(
  tickets: EnrichedSupportTicket[],
  previous: TicketAnalysisSnapshot | null,
  isLastBatch: boolean,
  allTicketKeys: string[] = [],
  assigneeContextMap?: Map<string, AssigneeContext>,
): string {
  const previousSection = previous
    ? `## Análise Anterior (${previous.date})
${previous.tickets.map((t) => `- ${t.key}: ${t.intelligence.narrative.slice(0, 200)}`).join('\n')}
`
    : '## Análise Anterior\n(primeira análise — sem histórico)\n'

  const ticketsSection = tickets.map((t) => {
    const blockerHint = t.deterministicContext.inferredBlocker
      ? `Bloqueador pré-computado: ${t.deterministicContext.inferredBlocker}`
      : 'Bloqueador pré-computado: não identificado'

    const stalenessInfo = t.deterministicContext.daysSinceLastComment !== null
      ? `${t.deterministicContext.staleness} (${t.deterministicContext.daysSinceLastComment}d desde último comentário de ${t.deterministicContext.lastCommentAuthor})`
      : 'sem comentários'

    const commentsStr = t.fullComments.length > 0
      ? t.fullComments.map((c) => {
          const date = new Date(c.created).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
          return `  [${c.author}, ${date}]: ${c.body}`
        }).join('\n')
      : '  (sem comentários)'

    const assigneeCtx = assigneeContextMap?.get(t.assignee ?? '')
    const assigneeLine = assigneeCtx
      ? `Assignee: ${assigneeCtx.nome} (${assigneeCtx.nivel}) — workload ${assigneeCtx.workloadScore}, ${assigneeCtx.issuesAbertas} issues abertas, ${assigneeCtx.blockersAtivos} blockers`
      : `Assignee: ${t.assignee ?? 'sem assignee'}`

    return `### ${t.key}: ${t.summary}
- Status: ${t.status} | Idade: ${t.ageDias}d | ${assigneeLine}
- ${blockerHint}
- Atividade: ${stalenessInfo}
- Thread de comentários (cronológico):
${commentsStr}`
  }).join('\n\n')

  const executiveSummaryInstruction = isLastBatch
    ? `
Após analisar os tickets, gere também um "executiveSummary" com:
- "byBlocker": agrupe TODOS os ${allTicketKeys.length} tickets analisados (${allTicketKeys.join(', ')}) por categoria de bloqueador
- "priorityActions": as 3 ações mais urgentes que o gestor deve tomar HOJE
- "overallRisk": risco geral da operação (critical/high/medium/low)`
    : ''

  return `Você é um Engineering Manager sênior revisando tickets de sustentação do seu time. Analise cada ticket como se estivesse preparando um briefing para uma reunião de status.

Para cada ticket, forneça:
1. **narrative**: 2-4 frases explicando o que aconteceu, quem investigou, o que foi encontrado e o que está pendente. Escreva como se estivesse contando para outro EM o que está acontecendo — não repita o título.
2. **blocker**: quem/o que está bloqueando progresso. Use o hint pré-computado como ponto de partida, mas corrija se os comentários contarem uma história diferente. Categorias: fornecedor_externo, dev, cliente, produto, deploy, desconhecido.
3. **recommendedAction**: UMA ação concreta que o gestor deve tomar HOJE para destravar este ticket.
4. **riskLevel**: probabilidade de deterioração (critical = impacto financeiro ou cliente parado, high = SLA muito estourado sem progresso, medium = em andamento mas lento, low = em progresso normal).
5. **evolution**: se a análise anterior menciona este ticket, descreva O QUE MUDOU. Se não menciona ou é primeira análise, retorne null.

${previousSection}

## Tickets para Análise

${ticketsSection}
${executiveSummaryInstruction}

CONTEXTO DO ASSIGNEE:
- Se dados do assignee estiverem presentes (nome, nível, workload), considere a carga atual na avaliação do riskLevel. Um ticket de risco médio com assignee em workload alto deve ser elevado para high.
- Se o assignee é junior e o ticket tem riskLevel high ou critical, adicione na recommendedAction: "Considerar pair com senior".

IMPORTANTE:
- Responda APENAS em JSON válido, sem markdown wrapping
- Formato: { "tickets": [{ "key": "BANKS-XXXX", "narrative": "...", "blocker": { "category": "...", "detail": "...", "deterministic": false }, "recommendedAction": "...", "riskLevel": "...", "evolution": "..." ou null }]${isLastBatch ? ', "executiveSummary": { "byBlocker": { "fornecedor_externo": ["BANKS-..."], ... }, "priorityActions": ["..."], "overallRisk": "..." }' : ''} }
- Escreva em português brasileiro
- Seja direto e específico — o gestor não quer generalidades`
}

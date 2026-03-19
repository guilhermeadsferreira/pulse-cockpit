import type { LideradoSnapshot } from '../registry/PersonRegistry'

export interface AgendaGestorPromptParams {
  configYaml:        string                  // config.yaml do gestor
  perfilMd:          string                  // perfil.md do gestor (histórico de interações)
  today:             string                  // YYYY-MM-DD
  liderados:         LideradoSnapshot[]      // snapshot de saúde do time
  pautasAnteriores?: Array<{ date: string; content: string }>
  openActions?:      Array<{ texto: string; criadoEm: string }>
}

export interface AgendaGestorAIResult {
  status_time:       string[]   // estado geral do time para reportar ao gestor
  escaladas:         string[]   // o que precisa da visibilidade ou decisão do gestor
  conquistas_time:   string[]   // conquistas e evoluções do time que o gestor deve conhecer
  meu_desenvolvimento: string[] // sobre o próprio desenvolvimento do usuário
  preciso_de_voce:   string[]   // desbloqueios, decisões, recursos que dependem do gestor
  follow_ups:        string[]   // ações comprometidas em pautas anteriores
  perguntas:         string[]   // perguntas abertas para o gestor
}

export function buildGestorAgendaPrompt(params: AgendaGestorPromptParams): string {
  const { configYaml, perfilMd, today, liderados, pautasAnteriores = [], openActions = [] } = params

  const today_date = new Date(today)

  const lideradosSection = liderados.length > 0
    ? liderados.map((l) => {
        if (l.dados_stale) {
          return `- **${l.nome}** (${l.cargo})\n  ⚠️ sem dados recentes (última ingestão há mais de 30 dias)`
        }
        const flags: string[] = []
        if (l.saude === 'vermelho') flags.push('🔴 saúde vermelho')
        else if (l.saude === 'amarelo') flags.push('🟡 saúde amarelo')
        if (l.necessita_1on1 && l.motivo_1on1) flags.push(`⚠️ 1:1 urgente: ${l.motivo_1on1}`)
        if (l.alerta_estagnacao && l.motivo_estagnacao) flags.push(`📉 estagnação: ${l.motivo_estagnacao}`)
        if (l.sinal_evolucao && l.evidencia_evolucao) flags.push(`🚀 evolução: ${l.evidencia_evolucao}`)
        if (l.acoes_pendentes_count > 0) flags.push(`${l.acoes_pendentes_count} ação(ões) pendente(s)`)
        const flagStr = flags.length > 0 ? '\n  ' + flags.join('\n  ') : '\n  ✅ sem alertas'
        return `- **${l.nome}** (${l.cargo})${flagStr}`
      }).join('\n')
    : '(nenhum liderado direto cadastrado)'

  const pautasSection = pautasAnteriores.length > 0
    ? `\n## Histórico de pautas anteriores com o gestor\n${pautasAnteriores.map(p => `### Pauta de ${p.date}\n${p.content}`).join('\n\n')}\n`
    : ''

  const acoesSection = openActions.length > 0
    ? `\n## Ações em aberto com o gestor\n${openActions.map(a => {
        const daysOpen = Math.floor((today_date.getTime() - new Date(a.criadoEm).getTime()) / 86_400_000)
        return `- [${daysOpen}d em aberto] ${a.texto}`
      }).join('\n')}\n`
    : ''

  return `Você é o assistente de um gestor de tecnologia que está se preparando para seu próprio 1:1 com seu gestor direto.

Data atual: ${today}

## Configuração do gestor (meu superior)
\`\`\`yaml
${configYaml}
\`\`\`

## Histórico de interações com o gestor
${perfilMd}
${pautasSection}${acoesSection}
## Estado atual do meu time (liderados diretos)
Estes são os liderados diretos do usuário — liderados INDIRETOS do gestor. O gestor deve ter visibilidade sobre o que está acontecendo com eles.

${lideradosSection}

## Sua tarefa

Gere uma pauta estruturada para o próximo 1:1 do usuário com seu gestor. O foco é diferente de um 1:1 com liderado: aqui o usuário está reportando para cima, buscando alinhamento estratégico, visibilidade para seu trabalho e suporte para desbloquear o time.

Retorne APENAS um JSON válido (sem texto antes ou depois):

{
  "status_time": ["string"],
  "escaladas": ["string"],
  "conquistas_time": ["string"],
  "meu_desenvolvimento": ["string"],
  "preciso_de_voce": ["string"],
  "follow_ups": ["string"],
  "perguntas": ["string"]
}

Regras:
- "status_time": 2 a 4 bullets com o estado geral do time — saúde, ritmo, riscos ativos. Inclua números e nomes quando relevante. É o "dashboard verbal" que o gestor precisa ouvir.
- "escaladas": situações que exigem visibilidade, decisão ou apoio do gestor. Seja direto sobre o risco e o que é necessário. Array vazio se não houver urgências.
- "conquistas_time": evoluções, entregas e reconhecimentos do time que o gestor deve saber — ele é gestor indireto dessas pessoas. Valorize o que foi alcançado. Array vazio se não houver.
- "meu_desenvolvimento": temas sobre o próprio desenvolvimento do usuário que merecem espaço — carreira, habilidades, desafios pessoais, feedback que precisa receber. Baseie-se no perfil histórico com o gestor.
- "preciso_de_voce": pedidos concretos ao gestor — desbloqueios, decisões, recursos, conexões, visibilidade em stakeholders. Seja específico sobre o que é necessário e por quê.
- "follow_ups": compromissos de pautas anteriores que precisam de acompanhamento. Priorize os mais antigos. Seja específico.
- "perguntas": 3 a 5 perguntas abertas e contextualizadas para o gestor — alinhamento estratégico, expectativas, tendências, apoio. NUNCA use perguntas genéricas.`
}

export function renderGestorAgendaMarkdown(nomeGestor: string, date: string, result: AgendaGestorAIResult): string {
  const lines: string[] = [
    `# Pauta 1:1 com ${nomeGestor}`,
    ``,
    `**Data:** ${date}`,
    ``,
  ]

  if (result.escaladas.length > 0) {
    lines.push(`## ⚠️ Escaladas`)
    result.escaladas.forEach(e => lines.push(`- ${e}`))
    lines.push(``)
  }

  if (result.status_time.length > 0) {
    lines.push(`## Status do Time`)
    result.status_time.forEach(s => lines.push(`- ${s}`))
    lines.push(``)
  }

  if (result.conquistas_time.length > 0) {
    lines.push(`## Conquistas do Time`)
    result.conquistas_time.forEach(c => lines.push(`- ${c}`))
    lines.push(``)
  }

  if (result.preciso_de_voce.length > 0) {
    lines.push(`## Preciso de Você`)
    result.preciso_de_voce.forEach(p => lines.push(`- [ ] ${p}`))
    lines.push(``)
  }

  if (result.follow_ups.length > 0) {
    lines.push(`## Follow-ups`)
    result.follow_ups.forEach(f => lines.push(`- [ ] ${f}`))
    lines.push(``)
  }

  if (result.meu_desenvolvimento.length > 0) {
    lines.push(`## Meu Desenvolvimento`)
    result.meu_desenvolvimento.forEach(m => lines.push(`- ${m}`))
    lines.push(``)
  }

  if (result.perguntas.length > 0) {
    lines.push(`## Perguntas para o Gestor`)
    result.perguntas.forEach(p => lines.push(`- ${p}`))
    lines.push(``)
  }

  return lines.join('\n')
}

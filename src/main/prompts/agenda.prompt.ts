export interface AgendaOpenAction {
  texto: string
  descricao?: string
  criadoEm: string
  owner?: string
  tipo?: string
  contexto?: string
  ciclos_sem_mencao?: number
}

export interface AgendaPromptParams {
  configYaml:        string
  perfilMd:          string
  today:             string
  dadosStale?:       boolean
  pautasAnteriores?: Array<{ date: string; content: string }>
  openActions?:      AgendaOpenAction[]
  insightsRecentes?: string
  sinaisTerceiros?:  string
  pdiEstruturado?:   string
  externalData?:     string
  demandasGestor?:   string
}

export function buildAgendaPrompt(params: AgendaPromptParams): string {
  const { configYaml, perfilMd, today, dadosStale = false, pautasAnteriores = [], openActions = [], insightsRecentes = '', sinaisTerceiros = '', pdiEstruturado = '', externalData = '', demandasGestor } = params

  const pautasSection = pautasAnteriores.length > 0
    ? `\n## Histórico de pautas anteriores\n${pautasAnteriores.map(p => `### Pauta de ${p.date}\n${p.content}`).join('\n\n')}\n`
    : ''

  const today_date = new Date(today)

  // Separate actions by risk level
  const riscoAbandono = openActions.filter(a => (a.ciclos_sem_mencao ?? 0) >= 2)
  const acoesGestor = openActions.filter(a => a.owner === 'gestor')
  const acoesNormais = openActions.filter(a => (a.ciclos_sem_mencao ?? 0) < 2 && a.owner !== 'gestor')

  const formatAction = (a: AgendaOpenAction): string => {
    const daysOpen = Math.floor((today_date.getTime() - new Date(a.criadoEm).getTime()) / 86_400_000)
    const desc = a.descricao || a.texto
    const ctx = a.contexto ? ` — contexto: ${a.contexto}` : ''
    const tipo = a.tipo ? ` [${a.tipo}]` : ''
    return `- [${daysOpen}d em aberto]${tipo} ${desc}${ctx}`
  }

  let acoesSection = ''
  if (riscoAbandono.length > 0) {
    acoesSection += `\n## ⚠️ Ações com risco de abandono (2+ ciclos sem menção)\n${riscoAbandono.map(formatAction).join('\n')}\n`
  }
  if (acoesGestor.length > 0) {
    acoesSection += `\n## Prestar contas — ações do gestor pendentes\n${acoesGestor.map(formatAction).join('\n')}\n`
  }
  if (acoesNormais.length > 0) {
    acoesSection += `\n## Ações em aberto (Action Loop)\n${acoesNormais.map(formatAction).join('\n')}\n`
  }

  const demandasSection = demandasGestor
    ? `\n## Demandas do gestor para esta 1:1\n${demandasGestor}\n`
    : ''

  const insightsSection = insightsRecentes
    ? `\n## Insights recentes de 1:1\n${insightsRecentes}\n`
    : ''

  const sinaisSection = sinaisTerceiros
    ? `\n## Sinais de terceiros não explorados\n${sinaisTerceiros}\n`
    : ''

  const pdiSection = pdiEstruturado
    ? `\n## PDI atual\n${pdiEstruturado}\n`
    : ''

  const externalDataSection = externalData
    ? `\n## Dados Externos (métricas objetivas)\n${externalData}\n> Contagens de commits e PRs são contexto de volume — não refletem impacto ou qualidade. Use-as para formular perguntas, não como evidência de desempenho.\n`
    : ''

  const staleWarning = dadosStale
    ? `\n⚠️ ATENÇÃO: O perfil desta pessoa não recebe novos artefatos há mais de 30 dias. Os dados podem estar desatualizados. Não gere alertas baseados em inferências do perfil — retorne "alertas" como array vazio e indique na seção "temas" que o gestor deve atualizar o contexto antes do 1:1.\n`
    : ''

  return `Você é o assistente de um gestor de tecnologia. Gere uma pauta estruturada para o próximo 1:1.

Data atual: ${today}
${staleWarning}

## Configuração da pessoa
\`\`\`yaml
${configYaml}
\`\`\`

## Perfil vivo atual
${perfilMd}
${pautasSection}${acoesSection}${demandasSection}${insightsSection}${sinaisSection}${pdiSection}${externalDataSection}
## Sua tarefa

Com base no perfil acumulado, nas ações em aberto, nos insights de 1:1, sinais de terceiros e PDI, gere uma pauta completa e estruturada para o próximo 1:1. Retorne APENAS um JSON válido (sem texto antes ou depois):

{
  "follow_ups": ["string"],
  "temas": ["string"],
  "perguntas_sugeridas": ["string"],
  "alertas": ["string"],
  "outros_alertas": ["string"],
  "reconhecimentos": ["string"]
}

Regras:
- "follow_ups": use DESCRIÇÃO COMPLETA e CONTEXTO das ações, não só texto resumido. Ações com risco de abandono (2+ ciclos sem menção) são PRIORIDADE MÁXIMA — devem ser os primeiros itens. Ações do gestor pendentes vão em seção separada como "prestar contas". Priorize as mais antigas.
- "temas": assuntos recorrentes, pontos de atenção ou evolução de carreira que merecem discussão aprofundada. Conecte insights de 1:1 sobre carreira/PDI com perguntas sugeridas quando aplicável. Priorize pelo impacto.
- "perguntas_sugeridas": 4 a 6 perguntas abertas, específicas e contextualizadas para esta pessoa. Sinais de terceiros não explorados devem gerar perguntas de validação (ex: "O Antonio mencionou X — como você vê isso?"). Insights de PDI conectam com perguntas de desenvolvimento. NUNCA use perguntas genéricas — baseie-se no perfil real. Use dados externos quantitativos (Jira, GitHub) para gerar perguntas com números concretos — ex: "Você tem ${openActions.length} ações abertas e 5 issues no Jira — como está gerenciando o workload?".
- "alertas": máximo 3 alertas, priorizados por impacto e urgência (bloqueios, conflitos, risco de desengajamento, deadlines críticos, ações com risco de abandono, blockers do Jira). Selecione os 3 mais críticos. Array vazio se não houver urgências.
- "outros_alertas": alertas relevantes que não couberam nos 3 principais — sem limite. Omitir (ou array vazio) se não há excedentes.
- "reconhecimentos": conquistas que merecem ser mencionadas explicitamente na conversa. Priorize os últimos 14 dias; se não houver conquistas nesse período, use os últimos 30 dias; se não houver em 30 dias, retorne array vazio. Reconhecimento oportuno fortalece o vínculo.`
}

export interface AgendaAIResult {
  follow_ups:          string[]
  temas:               string[]
  perguntas_sugeridas: string[]
  alertas:             string[]
  outros_alertas?:     string[]
  reconhecimentos:     string[]
}

export function renderAgendaMarkdown(nome: string, date: string, result: AgendaAIResult): string {
  const lines: string[] = [
    `# Pauta 1:1 — ${nome}`,
    ``,
    `**Data:** ${date}`,
    ``,
  ]

  if (result.alertas.length > 0) {
    lines.push(`## ⚠️ Alertas`)
    result.alertas.forEach(a => lines.push(`- ${a}`))
    lines.push(``)
  }

  if (result.outros_alertas && result.outros_alertas.length > 0) {
    lines.push(`### Outros alertas`)
    result.outros_alertas.forEach(a => lines.push(`- ${a}`))
    lines.push(``)
  }

  if (result.reconhecimentos && result.reconhecimentos.length > 0) {
    lines.push(`## Reconhecimentos`)
    result.reconhecimentos.forEach(r => lines.push(`- ${r}`))
    lines.push(``)
  }

  if (result.follow_ups.length > 0) {
    lines.push(`## Follow-ups`)
    result.follow_ups.forEach(f => lines.push(`- [ ] ${f}`))
    lines.push(``)
  }

  if (result.temas.length > 0) {
    lines.push(`## Temas`)
    result.temas.forEach(t => lines.push(`- ${t}`))
    lines.push(``)
  }

  if (result.perguntas_sugeridas.length > 0) {
    lines.push(`## Perguntas sugeridas`)
    result.perguntas_sugeridas.forEach(p => lines.push(`- ${p}`))
    lines.push(``)
  }

  return lines.join('\n')
}

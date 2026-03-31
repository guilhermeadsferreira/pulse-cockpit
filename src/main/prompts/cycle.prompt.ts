// ~80k chars leaves room for perfil.md, config, prompt structure and Claude's output
const MAX_ARTIFACT_CHARS = 80_000

export interface CyclePromptParams {
  configYaml:    string
  perfilMd:      string
  artifacts:     Array<{ date: string; tipo: string; content: string }>
  periodoInicio: string
  periodoFim:    string
  // V2 enrichments
  insights1on1?:          string
  correlacoes?:           string
  followupHistorico?:     string
  tendenciaEmocional?:    string
  pdiEvolucao?:           string
  // V3 enrichments
  externalData?:          string
}

export interface CyclePromptBuildResult {
  prompt:            string
  truncatedArtifacts: number  // how many older artifacts were excluded
  totalArtifacts:    number
}

export function buildCyclePrompt(params: CyclePromptParams): CyclePromptBuildResult {
  const { configYaml, perfilMd, artifacts, periodoInicio, periodoFim,
    insights1on1 = '', correlacoes = '', followupHistorico = '', tendenciaEmocional = '', pdiEvolucao = '', externalData = '' } = params

  // Budget artifacts from most recent → oldest, stop when limit is reached.
  // Most recent artifacts are most relevant for calibration; perfil.md covers older history.
  let charCount = 0
  const included: typeof artifacts = []
  for (const artifact of [...artifacts].reverse()) {
    if (charCount + artifact.content.length > MAX_ARTIFACT_CHARS) break
    included.unshift(artifact)
    charCount += artifact.content.length
  }
  const truncatedArtifacts = artifacts.length - included.length

  const truncationNote = truncatedArtifacts > 0
    ? `⚠️ Nota: ${truncatedArtifacts} artefato(s) mais antigo(s) não foram incluídos por limite de contexto. O perfil acumulado (seção acima) já sintetiza esse histórico — use-o como base para o período completo.\n\n---\n\n`
    : ''

  const artifactsText = included.length > 0
    ? truncationNote + included.map(a => `### ${a.date} — ${a.tipo}\n\n${a.content}`).join('\n\n---\n\n')
    : '(nenhum artefato encontrado no período selecionado)'

  const prompt = `Você é o assistente de um gestor de tecnologia. Gere um relatório de ciclo de avaliação completo para o fórum de calibração.

Período analisado: ${periodoInicio} a ${periodoFim}

## Configuração da pessoa
\`\`\`yaml
${configYaml}
\`\`\`

## Perfil vivo atual (síntese acumulada pela IA)
${perfilMd}

## Artefatos do período (do mais antigo ao mais recente)
${artifactsText}
${insights1on1 ? `\n## Insights de 1:1 do período\n${insights1on1}\n` : ''}${correlacoes ? `\n## Correlações de terceiros confirmadas\n${correlacoes}\n` : ''}${followupHistorico ? `\n## Histórico de follow-up de ações\n${followupHistorico}\n` : ''}${tendenciaEmocional ? `\n## Tendência emocional no período\n${tendenciaEmocional}\n` : ''}${pdiEvolucao ? `\n## Evolução do PDI\n${pdiEvolucao}\n` : ''}${externalData ? `\n## Dados Externos (métricas objetivas do período)\n${externalData}\n` : ''}
## Sua tarefa

Sintetize o ciclo completo desta pessoa com base nos artefatos e no perfil acumulado. Retorne APENAS um JSON válido (sem texto antes ou depois):

{
  "linha_do_tempo": [{"data": "YYYY-MM-DD", "evento": "string"}],
  "entregas_e_conquistas": ["string"],
  "padroes_de_comportamento": ["string"],
  "evolucao_frente_ao_cargo": "string",
  "pontos_de_desenvolvimento": ["string"],
  "conclusao_para_calibracao": "string",
  "flag_promovibilidade": "sim",
  "evidencias_promovibilidade": ["string"]
}

Regras:
- "linha_do_tempo": até 10 eventos-chave do período em ordem cronológica. Inclua entregas, marcos, mudanças e incidentes relevantes.
- "entregas_e_conquistas": resultados concretos, com contexto (o que foi feito, quando, qual o impacto).
- "padroes_de_comportamento": padrões positivos e negativos observados ao longo do ciclo, com evidências. Use insights de 1:1 como fonte quando disponíveis — cite datas.
- "evolucao_frente_ao_cargo": parágrafo narrativo (3–5 frases) descrevendo a evolução da pessoa frente ao seu nível e cargo esperado. Cite evidências e conecte com evolução do PDI quando disponível.
- "pontos_de_desenvolvimento": áreas concretas de desenvolvimento identificadas, priorizadas por múltiplas fontes (artefatos + sinais de terceiros + insights de 1:1). Convergência de fontes = evidência forte.
- "conclusao_para_calibracao": parágrafo conclusivo (3–5 frases) pronto para ser lido no fórum. Deve incluir recomendação clara: acima das expectativas / dentro das expectativas / abaixo das expectativas. Na accountability, mencione proporção de ações cumpridas vs abandonadas quando dados de follow-up estiverem disponíveis. Inclua evidências quantitativas de dados externos (Jira, GitHub) quando disponíveis — ex: velocity, tempo de ciclo, PRs merged, code reviews.
- "flag_promovibilidade": "sim" se há evidências claras para promoção neste ciclo, "nao" se não há, "avaliar" se há potencial mas requer mais evidências ou mais tempo. Na promovibilidade, cruze: conquistas + feedback de terceiros + PDI + tendência emocional.
- "evidencias_promovibilidade": 3–5 bullets de evidência concreta que sustentam o flag_promovibilidade. Cada bullet deve ser autônomo e citável no fórum: descreva um fato específico (entrega, comportamento, feedback de terceiro) com data ou contexto. Se flag_promovibilidade for "nao", liste as lacunas ou áreas que ainda precisam ser demonstradas para uma futura promoção. Nunca retorne array vazio — sempre há algo a dizer.`

  return {
    prompt,
    truncatedArtifacts,
    totalArtifacts: artifacts.length,
  }
}

export interface CycleAIResult {
  linha_do_tempo:             Array<{ data: string; evento: string }>
  entregas_e_conquistas:      string[]
  padroes_de_comportamento:   string[]
  evolucao_frente_ao_cargo:   string
  pontos_de_desenvolvimento:  string[]
  conclusao_para_calibracao:  string
  flag_promovibilidade:       'sim' | 'nao' | 'avaliar'
  evidencias_promovibilidade: string[]
}

export function renderCycleMarkdown(
  nome:          string,
  periodoInicio: string,
  periodoFim:    string,
  result:        CycleAIResult,
): string {
  const today = new Date().toISOString().slice(0, 10)
  const promoLabel = result.flag_promovibilidade === 'sim' ? 'Sim' : result.flag_promovibilidade === 'nao' ? 'Não' : 'Avaliar'

  const lines: string[] = [
    `# Relatório de Ciclo — ${nome}`,
    ``,
    `**Período:** ${periodoInicio} a ${periodoFim}  `,
    `**Gerado em:** ${today}`,
    ``,
    `---`,
    ``,
    `## Conclusão para o Fórum de Calibração`,
    ``,
    result.conclusao_para_calibracao,
    ``,
    `**Promovibilidade:** ${promoLabel}`,
    ``,
    ...(result.evidencias_promovibilidade?.length > 0
      ? [
          `**Evidências:**`,
          ``,
          ...result.evidencias_promovibilidade.map(e => `- ${e}`),
          ``,
        ]
      : []),
    `---`,
    ``,
    `## Linha do Tempo`,
    ``,
    ...result.linha_do_tempo.map(e => `- **${e.data}:** ${e.evento}`),
    ``,
    `## Entregas e Conquistas`,
    ``,
    ...result.entregas_e_conquistas.map(e => `- ${e}`),
    ``,
    `## Padrões de Comportamento`,
    ``,
    ...result.padroes_de_comportamento.map(p => `- ${p}`),
    ``,
    `## Evolução Frente ao Cargo`,
    ``,
    result.evolucao_frente_ao_cargo,
    ``,
    `## Pontos de Desenvolvimento`,
    ``,
    ...result.pontos_de_desenvolvimento.map(p => `- ${p}`),
    ``,
  ]

  return lines.join('\n')
}

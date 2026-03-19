export interface CyclePromptParams {
  configYaml:    string
  perfilMd:      string
  artifacts:     Array<{ date: string; tipo: string; content: string }>
  periodoInicio: string
  periodoFim:    string
}

export function buildCyclePrompt(params: CyclePromptParams): string {
  const { configYaml, perfilMd, artifacts, periodoInicio, periodoFim } = params

  const artifactsText = artifacts.length > 0
    ? artifacts.map(a => `### ${a.date} — ${a.tipo}\n\n${a.content}`).join('\n\n---\n\n')
    : '(nenhum artefato encontrado no período selecionado)'

  return `Você é o assistente de um gestor de tecnologia. Gere um relatório de ciclo de avaliação completo para o fórum de calibração.

Período analisado: ${periodoInicio} a ${periodoFim}

## Configuração da pessoa
\`\`\`yaml
${configYaml}
\`\`\`

## Perfil vivo atual (síntese acumulada pela IA)
${perfilMd}

## Artefatos do período (do mais antigo ao mais recente)
${artifactsText}

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
- "padroes_de_comportamento": padrões positivos e negativos observados ao longo do ciclo, com evidências.
- "evolucao_frente_ao_cargo": parágrafo narrativo (3–5 frases) descrevendo a evolução da pessoa frente ao seu nível e cargo esperado. Seja específico e cite evidências.
- "pontos_de_desenvolvimento": áreas concretas de desenvolvimento identificadas, com evidências do período.
- "conclusao_para_calibracao": parágrafo conclusivo (3–5 frases) pronto para ser lido no fórum. Deve incluir recomendação clara: acima das expectativas / dentro das expectativas / abaixo das expectativas.
- "flag_promovibilidade": "sim" se há evidências claras para promoção neste ciclo, "nao" se não há, "avaliar" se há potencial mas requer mais evidências ou mais tempo.
- "evidencias_promovibilidade": 3–5 bullets de evidência concreta que sustentam o flag_promovibilidade. Cada bullet deve ser autônomo e citável no fórum: descreva um fato específico (entrega, comportamento, feedback de terceiro) com data ou contexto. Se flag_promovibilidade for "nao", liste as lacunas ou áreas que ainda precisam ser demonstradas para uma futura promoção. Nunca retorne array vazio — sempre há algo a dizer.`
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

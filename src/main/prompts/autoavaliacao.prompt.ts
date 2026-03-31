export interface AutoavaliacaoPromptParams {
  managerName:   string
  managerRole:   string
  artifacts:     Array<{ date: string; tipo: string; titulo: string; content: string }>
  manualEntries: string[]
  periodoInicio: string          // YYYY-MM-DD
  periodoFim:    string          // YYYY-MM-DD
}

export interface AutoavaliacaoAIResult {
  o_que_fiz_e_entreguei:    string[]  // entregas e resultados com evidências
  como_demonstrei_valores:  string[]  // comportamentos e formas de liderar
  desafios_observados:      string[]  // areas de dificuldade, incerteza ou crescimento pendente
  como_me_vejo_no_futuro:   string    // parágrafo reflexivo
}

export function buildAutoavaliacaoPrompt(params: AutoavaliacaoPromptParams): string {
  const { managerName, managerRole, artifacts, manualEntries, periodoInicio, periodoFim } = params
  const role = managerRole ? ` (${managerRole})` : ''

  const artifactsText = artifacts.length > 0
    ? artifacts.map((a, i) => `### Artefato ${i + 1}: ${a.titulo} (${a.date})\n${a.content.slice(0, 3000)}`).join('\n\n---\n\n')
    : '(nenhum artefato registrado no período)'

  const manualText = manualEntries.length > 0
    ? manualEntries.map((e, i) => `${i + 1}. ${e}`).join('\n')
    : '(nenhuma entrada manual)'

  return `Você é o assistente de ${managerName}${role}. Gere uma autoavaliação estruturada com base nas contribuições registradas no período de ${periodoInicio} a ${periodoFim}.

## Registros do período

### Artefatos processados (${artifacts.length})
${artifactsText}

### Entradas manuais
${manualText}

## Sua tarefa

Sintetize as contribuições de ${managerName} nos três eixos de autoavaliação abaixo. Escreva na primeira pessoa (eu fiz, eu decidi, eu contribuí). Retorne APENAS um JSON válido (sem texto antes ou depois):

{
  "o_que_fiz_e_entreguei": ["string — entrega concreta com contexto e impacto"],
  "como_demonstrei_valores": ["string — comportamento ou ação que reflete valores de liderança"],
  "desafios_observados": ["string — área de dificuldade ou crescimento pendente com evidência"],
  "como_me_vejo_no_futuro": "string — parágrafo de 3 a 5 frases sobre aspirações e próximos passos"
}

Regras:
- o_que_fiz_e_entreguei: mínimo 3 itens. Cite datas, projetos e resultados concretos quando disponíveis.
- como_demonstrei_valores: mínimo 2 itens. Inclua evidências específicas (situações reais). CALIBRE pelo tipo de papel:
  - Se managerRole indica GESTÃO (ex: Engineering Manager, Tech Lead, Head of, Director): foque em comportamentos de gestão e liderança organizacional — "como facilitei o crescimento do time", "como tomei decisões sob incerteza", "como alinhei expectativas com stakeholders", "como criei ambiente de segurança psicológica", "como influenciei a direção técnica do produto".
  - Se managerRole indica IC (ex: Software Engineer, Senior Engineer, Staff Engineer, Principal, Arquiteto): foque em comportamentos de impacto técnico e colaboração — "como contribuí para qualidade técnica", "como compartilhei conhecimento", "como elevei o padrão do time com code reviews", "como demonstrei ownership de problemas complexos", "como influenciei decisões de arquitetura".
  - Nunca use os mesmos eixos genéricos para ambos os casos — o valor de um IC e o valor de um manager são fundamentalmente diferentes.
- desafios_observados: OBRIGATÓRIO quando há evidência de dificuldades, incertezas ou areas de crescimento no período. Array vazio APENAS se não há absolutamente nenhum sinal de desafio nos artefatos — caso raro. Cada item descreve: [ÁREA DE DIFICULDADE] + [EVIDÊNCIA observada no período] + [IMPACTO ou consequência]. Exemplos:
  - "Gestão de prioridades sob pressão: em 3 artefatos do período, sinalizei sobrecarga mas não consegui delegar ou escalar antes do prazo — resultado: entregas de menor qualidade em semanas de pico"
  - "Comunicação ascendente: não antecipei riscos de entrega ao meu gestor até a última semana, mesmo com sinais de atraso desde o meio do ciclo"
  Nunca use frases genéricas como "preciso melhorar comunicação" sem evidência comportamental observada.
- como_me_vejo_no_futuro: narrativa reflexiva em parágrafo corrido, não uma lista. Mencione onde quer chegar e o que precisa desenvolver.
- Se não houver dados suficientes para um eixo, escreva um item honesto reconhecendo isso.
- Escreva em português brasileiro claro e profissional.
- Nunca copie texto corrompido ou caracteres estranhos dos artefatos.`
}

export function renderAutoavaliacaoMarkdown(
  managerName: string,
  periodoInicio: string,
  periodoFim: string,
  result: AutoavaliacaoAIResult,
): string {
  const today = new Date().toISOString().slice(0, 10)

  const lines: string[] = [
    `# Autoavaliação — ${managerName}`,
    ``,
    `**Período:** ${periodoInicio} a ${periodoFim}`,
    `**Gerado em:** ${today}`,
    ``,
    `---`,
    ``,
    `## O que fiz e entreguei`,
    ``,
    ...result.o_que_fiz_e_entreguei.map((item) => `- ${item}`),
    ``,
    `## Como demonstrei valores`,
    ``,
    ...result.como_demonstrei_valores.map((item) => `- ${item}`),
    ``,
    ...(result.desafios_observados.length > 0
      ? [
          `## Desafios Observados`,
          ``,
          ...result.desafios_observados.map((item) => `- ${item}`),
          ``,
        ]
      : []),
    `## Como me vejo no futuro`,
    ``,
    result.como_me_vejo_no_futuro,
    ``,
  ]

  return lines.join('\n')
}

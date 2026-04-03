export interface WeeklySynthesisInput {
  nome: string
  perfilResumo: string
  momentoAtual: string
  alertasAtivos: string
  sustentacaoSemanal: string
  acoesResumo: string
  pdiResumo: string
  workloadScore: string
  issuesAbertas: number
  blockersAtivos: number
  commits30d: number
  prsMerged30d: number
  collaborationScore: number
}

export interface WeeklySynthesisResult {
  estado_geral: 'verde' | 'amarelo' | 'vermelho'
  paragrafo: string
  para_proxima_1on1: string
  sinais_convergentes: string | null
  confianca: 'alta' | 'media' | 'baixa'
}

export function buildWeeklySynthesisPrompt(input: WeeklySynthesisInput): string {
  return `Você é um assistente de gestão de pessoas altamente especializado.
Analise os dados abaixo de ${input.nome} e gere uma síntese semanal
concisa e acionável para o gestor.

## Perfil atual
${input.perfilResumo}

## Momento atual (métricas recentes)
${input.momentoAtual}

## Alertas ativos
${input.alertasAtivos || 'Nenhum alerta ativo'}

## Sustentação (última semana)
${input.sustentacaoSemanal || 'Sem dados de sustentação'}

## Ações em aberto
${input.acoesResumo}

## PDI
${input.pdiResumo}

## Dados externos
- Jira: workload ${input.workloadScore}, ${input.issuesAbertas} issues abertas, ${input.blockersAtivos} blockers ativos
- GitHub: ${input.commits30d} commits (30d), ${input.prsMerged30d} PRs merged, collaboration score ${input.collaborationScore}

---

Gere uma síntese semanal com EXATAMENTE esta estrutura JSON:

{
  "estado_geral": "verde" | "amarelo" | "vermelho",
  "paragrafo": "2-4 frases descrevendo o estado real da semana, conectando dados de diferentes fontes. Mencione causa provável quando houver convergência de sinais. Tom direto, sem jargão.",
  "para_proxima_1on1": "1-2 frases sobre o foco mais importante para abordar",
  "sinais_convergentes": "1 frase sobre padrão cross-fonte, ou null se não houver",
  "confianca": "alta" | "media" | "baixa"
}

Regras:
- estado_geral: verde = sem preocupações; amarelo = requer atenção moderada; vermelho = ação urgente necessária.
- confianca = baixa se menos de 2 fontes de dados disponíveis.
- Priorize conexões entre fontes (ex: queda de commits + alertas de sobrecarga = possível burnout).
- Tom direto, sem jargão corporativo. O gestor é um EM técnico de fintech.
- Responda APENAS com o JSON. Sem markdown, sem explicação.`
}

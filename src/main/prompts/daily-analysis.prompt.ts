/**
 * Prompt para análise com Haiku do Daily Report.
 * Recebe dados estruturados e gera observações cruzadas para o gestor.
 */

interface DailyAnalysisInput {
  sprintOverview: string
  perPersonSummary: string
  alerts: string
}

export function buildDailyAnalysisPrompt(input: DailyAnalysisInput): string {
  return `Você é um assistente de Engineering Manager. Analise os dados do daily standup abaixo e gere observações que um gestor não perceberia olhando os números isoladamente.

## Dados do Daily

### Sprint
${input.sprintOverview || 'Sem dados de sprint.'}

### Resumo por pessoa
${input.perPersonSummary}

### Alertas já identificados
${input.alerts || 'Nenhum alerta.'}

## Instruções

Gere observações focadas em:
1. **Padrões cruzados entre pessoas** — ex: uma pessoa só faz review enquanto outra só comita (desbalanceamento de papel no time)
2. **Correlações Jira×GitHub** — ex: muitos commits mas nenhuma issue movendo (trabalho fora do board?), ou issue movendo sem commits (pode ser task administrativa)
3. **Sugestões de perguntas para o standup** — perguntas específicas e acionáveis, não genéricas. Ex: "Perguntar ao Kelvin sobre o bloqueio CNT-858 — está aguardando outro time?"
4. **Destaques positivos** — reconhecer quem entregou, quem ajudou o time via reviews, quem desbloqueou outros

## Regras
- Máximo 6 observações, priorizadas por impacto para o gestor
- Nunca repita informações que já estão nos alertas
- Nunca use contagens brutas (commits, PRs) como métrica de performance individual
- Foque no que é ACIONÁVEL — o gestor vai ler isso antes do standup
- Seja direto, sem introduções ou conclusões

Responda EXCLUSIVAMENTE em JSON válido, sem markdown:
{
  "observacoes": [
    {
      "texto": "descrição da observação",
      "pessoa": "Nome da Pessoa" ou null se for sobre o time,
      "tipo": "padrao" | "risco" | "destaque" | "sugestao"
    }
  ]
}`
}

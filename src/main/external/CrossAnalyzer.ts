import type { JiraPersonMetrics } from './JiraMetrics'
import type { GitHubPersonMetrics } from './GitHubMetrics'

export interface CrossInsight {
  tipo: 'sobrecarga' | 'desalinhamento' | 'gap_comunicacao' | 'crescimento' | 'bloqueio' | 'risco_sprint'
  severidade: 'alta' | 'media' | 'baixa'
  descricao: string
  evidencia: string
  acaoSugerida?: string
  gerarDemanda?: boolean
}

export interface CrossAnalyzerInput {
  jira: JiraPersonMetrics | null
  github: GitHubPersonMetrics | null
  previousJira: Partial<JiraPersonMetrics> | null
  previousGithub: Partial<GitHubPersonMetrics> | null
}

export interface CrossAnalyzerThresholds {
  sobrecarga_issues: number
  prs_acumulando_count: number
  prs_acumulando_dias: number
  queda_atividade_ratio: number
  crescimento_ratio: number
  risco_sprint_nao_iniciadas: number
  risco_sprint_dias_restantes: number
}

const DEFAULT_THRESHOLDS: CrossAnalyzerThresholds = {
  sobrecarga_issues: 5,
  prs_acumulando_count: 2,
  prs_acumulando_dias: 3,
  queda_atividade_ratio: 0.5,
  crescimento_ratio: 1.3,
  risco_sprint_nao_iniciadas: 0.4,
  risco_sprint_dias_restantes: 3,
}

export function analyze(input: CrossAnalyzerInput, thresholds?: Partial<CrossAnalyzerThresholds>): CrossInsight[] {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds }
  const insights: CrossInsight[] = []

  if (input.jira) {
    insights.push(...analyzeOverload(input.jira, t))
    insights.push(...analyzeBlockers(input.jira))
    insights.push(...analyzeSprintRisk(input.jira, t))
  }

  if (input.github) {
    insights.push(...analyzePRAccumulation(input.github, t))
  }

  if (input.jira && input.github) {
    insights.push(...analyzeCommunicationGap(input.jira, input.github))
  }

  if (input.previousGithub && input.github) {
    insights.push(...analyzeGrowth(input.github, input.previousGithub, t))
    insights.push(...analyzeActivityDrop(input.github, input.previousGithub, t))
  }

  return insights
}

function analyzeOverload(jira: JiraPersonMetrics, t: CrossAnalyzerThresholds): CrossInsight[] {
  const insights: CrossInsight[] = []

  if (jira.workloadScore === 'alto') {
    const bugsLabel = jira.bugsAtivos > 0 ? `, ${jira.bugsAtivos} bugs` : ''
    insights.push({
      tipo: 'sobrecarga',
      severidade: 'alta',
      descricao: `${jira.issuesAbertas} issues abertas simultaneamente${bugsLabel}`,
      evidencia: `Jira: ${jira.issuesAbertas} issues abertas, workloadScore="${jira.workloadScore}"`,
      acaoSugerida: 'Verificar distribuição de workload no 1:1 — considerar reagrupar ou escalar pendências',
      gerarDemanda: false,
    })
  } else if (jira.issuesAbertas >= t.sobrecarga_issues && jira.workloadScore === 'medio') {
    insights.push({
      tipo: 'sobrecarga',
      severidade: 'media',
      descricao: `${jira.issuesAbertas} issues abertas — acima do threshold (${t.sobrecarga_issues})`,
      evidencia: `Jira: ${jira.issuesAbertas} issues abertas, distribuição: ${JSON.stringify(jira.distribuicaoPorTipo)}`,
      acaoSugerida: 'Acompanhar no próximo 1:1 — workload está no limite',
    })
  }

  return insights
}

function analyzeBlockers(jira: JiraPersonMetrics): CrossInsight[] {
  const insights: CrossInsight[] = []

  for (const blocker of jira.blockersAtivos) {
    const blockedDays = Math.floor(
      (Date.now() - new Date(blocker.blockedSince).getTime()) / 86_400_000
    )
    const severity: CrossInsight['severidade'] = blockedDays > 5 ? 'alta' : blockedDays > 2 ? 'media' : 'baixa'

    insights.push({
      tipo: 'bloqueio',
      severidade: severity,
      descricao: `${blocker.key} bloqueado há ${blockedDays} dias`,
      evidencia: `Jira: "${blocker.summary}" — bloqueado desde ${blocker.blockedSince}`,
      acaoSugerida: blockedDays > 3
        ? `Escalar ${blocker.key} — parado há ${blockedDays} dias`
        : `Acompanhar ${blocker.key} no próximo 1:1`,
      gerarDemanda: blockedDays > 5,
    })
  }

  return insights
}

function analyzeSprintRisk(jira: JiraPersonMetrics, t: CrossAnalyzerThresholds): CrossInsight[] {
  const insights: CrossInsight[] = []

  if (!jira.sprintAtual) return insights

  const sprint = jira.sprintAtual
  const completionRate = sprint.totalIssues > 0
    ? sprint.issuesConcluidas / sprint.totalIssues
    : 1

  if (sprint.fim) {
    const daysLeft = Math.floor(
      (new Date(sprint.fim).getTime() - Date.now()) / 86_400_000
    )

    if (daysLeft <= t.risco_sprint_dias_restantes) {
      const naoIniciadasRatio = 1 - completionRate
      if (naoIniciadasRatio > t.risco_sprint_nao_iniciadas) {
        insights.push({
          tipo: 'risco_sprint',
          severidade: 'alta',
          descricao: `Sprint "${sprint.nome}": ${Math.round(naoIniciadasRatio * 100)}% não concluído com ${daysLeft} dias restantes`,
          evidencia: `${sprint.issuesConcluidas}/${sprint.totalIssues} issues concluídas, ${sprint.entregue}/${sprint.comprometido} SP entregues`,
          acaoSugerida: 'Priorizar entregáveis críticos — revisar escopo da sprint',
        })
      }
    }
  }

  return insights
}

function analyzePRAccumulation(github: GitHubPersonMetrics, t: CrossAnalyzerThresholds): CrossInsight[] {
  const insights: CrossInsight[] = []

  if (github.prsAbertos >= t.prs_acumulando_count && github.tempoMedioAbertoDias >= t.prs_acumulando_dias) {
    insights.push({
      tipo: 'sobrecarga',
      severidade: github.prsAbertos >= 4 ? 'alta' : 'media',
      descricao: `${github.prsAbertos} PRs abertos há ${github.tempoMedioAbertoDias} dias em média`,
      evidencia: `GitHub: ${github.prsAbertos} PRs abertos, tempo médio aberto: ${github.tempoMedioAbertoDias} dias`,
      acaoSugerida: 'Revisar PRs acumulados — verificar se estão aguardando review ou implementação',
    })
  }

  return insights
}

function analyzeCommunicationGap(jira: JiraPersonMetrics, github: GitHubPersonMetrics): CrossInsight[] {
  const insights: CrossInsight[] = []

  if (jira.workloadScore !== 'baixo' && github.commits30d === 0) {
    insights.push({
      tipo: 'desalinhamento',
      severidade: 'media',
      descricao: 'Issues abertas no Jira mas nenhuma atividade de código em 30 dias',
      evidencia: `Jira: ${jira.issuesAbertas} issues abertas, GitHub: 0 commits nos últimos 30 dias`,
      acaoSugerida: 'Verificar se atividade está em outro repositório ou se há impedimento técnico',
    })
  }

  if (github.prsAbertos > 0 && jira.issuesAbertas === 0) {
    insights.push({
      tipo: 'gap_comunicacao',
      severidade: 'baixa',
      descricao: 'PRs abertos sem issues correspondentes no Jira',
      evidencia: `GitHub: ${github.prsAbertos} PRs abertos, Jira: 0 issues abertas`,
      acaoSugerida: 'Verificar vinculação entre PRs e issues — possível trabalho não rastreado no Jira',
    })
  }

  return insights
}

function analyzeGrowth(
  current: GitHubPersonMetrics,
  previous: Partial<GitHubPersonMetrics>,
  t: CrossAnalyzerThresholds,
): CrossInsight[] {
  const insights: CrossInsight[] = []

  const prevCommits = previous.commits30d ?? 0
  const currCommits = current.commits30d

  if (prevCommits > 0 && currCommits > prevCommits * t.crescimento_ratio) {
    const increase = Math.round(((currCommits - prevCommits) / prevCommits) * 100)
    insights.push({
      tipo: 'crescimento',
      severidade: 'baixa',
      descricao: `Commits aumentaram ${increase}% vs mês anterior`,
      evidencia: `GitHub: ${currCommits} commits (30d) vs ${prevCommits} (mês anterior)`,
      acaoSugerida: 'Reconhecer evolução no próximo 1:1',
    })
  }

  const prevPRs = previous.prsMerged30d ?? 0
  const currPRs = current.prsMerged30d

  if (prevPRs > 0 && currPRs > prevPRs * t.crescimento_ratio) {
    const increase = Math.round(((currPRs - prevPRs) / prevPRs) * 100)
    insights.push({
      tipo: 'crescimento',
      severidade: 'baixa',
      descricao: `PRs merged aumentaram ${increase}% vs mês anterior`,
      evidencia: `GitHub: ${currPRs} PRs merged (30d) vs ${prevPRs} (mês anterior)`,
      acaoSugerida: 'Sinal de aumento de entrega — avaliar impacto na qualidade',
    })
  }

  return insights
}

function analyzeActivityDrop(
  current: GitHubPersonMetrics,
  previous: Partial<GitHubPersonMetrics>,
  t: CrossAnalyzerThresholds,
): CrossInsight[] {
  const insights: CrossInsight[] = []

  const prevCommits = previous.commits30d ?? 0
  const currCommits = current.commits30d

  if (prevCommits >= 5 && currCommits < prevCommits * t.queda_atividade_ratio) {
    const decrease = Math.round(((prevCommits - currCommits) / prevCommits) * 100)
    insights.push({
      tipo: 'desalinhamento',
      severidade: 'media',
      descricao: `Commits caíram ${decrease}% vs mês anterior`,
      evidencia: `GitHub: ${currCommits} commits (30d) vs ${prevCommits} (mês anterior)`,
      acaoSugerida: 'Investigar causa no 1:1 — pode indicar bloqueio, férias ou mudança de foco',
    })
  }

  const prevReviews = previous.prsRevisados ?? 0
  const currReviews = current.prsRevisados

  if (prevReviews >= 3 && currReviews === 0) {
    insights.push({
      tipo: 'gap_comunicacao',
      severidade: 'media',
      descricao: 'Nenhuma code review feita nos últimos 30 dias',
      evidencia: `GitHub: ${currReviews} reviews (30d) vs ${prevReviews} (mês anterior)`,
      acaoSugerida: 'Verificar se revisões estão acontecendo por outro canal ou se a participação caiu',
    })
  }

  return insights
}

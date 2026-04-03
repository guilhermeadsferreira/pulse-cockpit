import type { JiraPersonMetrics } from './JiraMetrics'
import type { GitHubPersonMetrics } from './GitHubMetrics'

export interface CrossInsight {
  tipo: 'sobrecarga' | 'desalinhamento' | 'gap_comunicacao' | 'crescimento' | 'bloqueio' | 'risco_sprint' | 'destaque'
  severidade: 'alta' | 'media' | 'baixa'
  descricao: string
  evidencia: string
  acaoSugerida?: string
  gerarDemanda?: boolean
  causa_raiz?: 'awaiting_review' | 'changes_requested' | 'stale' | 'blocked' | 'overloaded' | 'vacation' | 'leave' | null
}

export interface ProfileContext {
  emFerias: boolean
  emLicenca: boolean
  ausenciaDescricao?: string
}

export interface HistoricoMensalEntry {
  mes: string
  github: { commits30d: number; prsMerged30d: number; collaborationScore: number } | null
  jira: { workloadScore: string | null } | null
}

export interface CrossAnalyzerInput {
  jira: JiraPersonMetrics | null
  github: GitHubPersonMetrics | null
  previousJira: Partial<JiraPersonMetrics> | null
  previousGithub: Partial<GitHubPersonMetrics> | null
  historicoMensal?: HistoricoMensalEntry[]
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

const NIVEL_THRESHOLD_OVERRIDES: Record<string, Partial<CrossAnalyzerThresholds>> = {
  junior:    { sobrecarga_issues: 3, prs_acumulando_count: 2 },
  pleno:     { sobrecarga_issues: 5, prs_acumulando_count: 3 },
  senior:    { sobrecarga_issues: 7, prs_acumulando_count: 4 },
  staff:     { sobrecarga_issues: 10, prs_acumulando_count: 5 },
  principal: { sobrecarga_issues: 10, prs_acumulando_count: 5 },
}

export function analyze(
  input: CrossAnalyzerInput,
  thresholds?: Partial<CrossAnalyzerThresholds>,
  nivel?: string,
  profileContext?: ProfileContext,
): CrossInsight[] {
  const nivelOverrides = nivel ? (NIVEL_THRESHOLD_OVERRIDES[nivel.toLowerCase()] ?? {}) : {}
  const t = { ...DEFAULT_THRESHOLDS, ...nivelOverrides, ...thresholds }
  const insights: CrossInsight[] = []
  const skipActivityAnalysis = !!(profileContext?.emFerias || profileContext?.emLicenca)

  if (input.jira) {
    insights.push(...analyzeOverload(input.jira, t))
    insights.push(...analyzeBlockers(input.jira))
    insights.push(...analyzeSprintRisk(input.jira, t))
  }

  if (input.github) {
    insights.push(...analyzePRAccumulation(input.github, t))
    insights.push(...analyzeHighlights(input.github))
  }

  if (!skipActivityAnalysis && input.jira && input.github) {
    insights.push(...analyzeCommunicationGap(input.jira, input.github))
  }

  if (input.previousGithub && input.github) {
    if (!skipActivityAnalysis) {
      insights.push(...analyzeGrowth(input.github, input.previousGithub, t))
    }
    insights.push(...analyzeActivityDrop(input.github, input.previousGithub, t, profileContext))
  }

  if (!skipActivityAnalysis) {
    insights.push(...analyzeTrends(input))
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
      causa_raiz: 'overloaded',
    })
  } else if (jira.issuesAbertas >= t.sobrecarga_issues && jira.workloadScore === 'medio') {
    insights.push({
      tipo: 'sobrecarga',
      severidade: 'media',
      descricao: `${jira.issuesAbertas} issues abertas — acima do threshold (${t.sobrecarga_issues})`,
      evidencia: `Jira: ${jira.issuesAbertas} issues abertas, distribuição: ${JSON.stringify(jira.distribuicaoPorTipo)}`,
      acaoSugerida: 'Acompanhar no próximo 1:1 — workload está no limite',
      causa_raiz: 'overloaded',
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
      causa_raiz: 'blocked',
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
          causa_raiz: null,
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
      causa_raiz: github.tempoMedioAbertoDias > 7 ? 'stale' : 'awaiting_review',
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
      causa_raiz: 'stale',
    })
  }

  if (github.prsAbertos > 0 && jira.issuesAbertas === 0) {
    insights.push({
      tipo: 'gap_comunicacao',
      severidade: 'baixa',
      descricao: 'PRs abertos sem issues correspondentes no Jira',
      evidencia: `GitHub: ${github.prsAbertos} PRs abertos, Jira: 0 issues abertas`,
      acaoSugerida: 'Verificar vinculação entre PRs e issues — possível trabalho não rastreado no Jira',
      causa_raiz: null,
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
      causa_raiz: null,
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
      causa_raiz: null,
    })
  }

  return insights
}

function analyzeActivityDrop(
  current: GitHubPersonMetrics,
  previous: Partial<GitHubPersonMetrics>,
  t: CrossAnalyzerThresholds,
  profileContext?: ProfileContext,
): CrossInsight[] {
  const insights: CrossInsight[] = []
  const skipActivityAnalysis = !!(profileContext?.emFerias || profileContext?.emLicenca)

  const prevCommits = previous.commits30d ?? 0
  const currCommits = current.commits30d

  if (prevCommits >= 5 && currCommits < prevCommits * t.queda_atividade_ratio) {
    const decrease = Math.round(((prevCommits - currCommits) / prevCommits) * 100)
    const causaRaiz = profileContext?.emFerias ? 'vacation' as const
      : profileContext?.emLicenca ? 'leave' as const
      : 'stale' as const

    // Se pessoa esta ausente, rebaixar severidade e ajustar acao
    if (skipActivityAnalysis) {
      insights.push({
        tipo: 'desalinhamento',
        severidade: 'baixa',
        descricao: `Commits caíram ${decrease}% vs mês anterior (${profileContext?.emFerias ? 'férias' : 'licença'})`,
        evidencia: `GitHub: ${currCommits} commits (30d) vs ${prevCommits} (mês anterior)`,
        acaoSugerida: `Queda esperada — ${profileContext?.ausenciaDescricao ?? 'pessoa ausente'}`,
        causa_raiz: causaRaiz,
      })
    } else {
      insights.push({
        tipo: 'desalinhamento',
        severidade: 'media',
        descricao: `Commits caíram ${decrease}% vs mês anterior`,
        evidencia: `GitHub: ${currCommits} commits (30d) vs ${prevCommits} (mês anterior)`,
        acaoSugerida: 'Investigar causa no 1:1 — pode indicar bloqueio, férias ou mudança de foco',
        causa_raiz: causaRaiz,
      })
    }
  }

  const prevReviews = previous.prsRevisados ?? 0
  const currReviews = current.prsRevisados

  if (!skipActivityAnalysis && prevReviews >= 3 && currReviews === 0) {
    insights.push({
      tipo: 'gap_comunicacao',
      severidade: 'media',
      descricao: 'Nenhuma code review feita nos últimos 30 dias',
      evidencia: `GitHub: ${currReviews} reviews (30d) vs ${prevReviews} (mês anterior)`,
      acaoSugerida: 'Verificar se revisões estão acontecendo por outro canal ou se a participação caiu',
      causa_raiz: 'stale',
    })
  }

  return insights
}

function analyzeHighlights(github: GitHubPersonMetrics): CrossInsight[] {
  const insights: CrossInsight[] = []

  if (github.prsMerged30d > 0 && github.tempoMedioAbertoDias < 1) {
    insights.push({
      tipo: 'destaque',
      severidade: 'baixa',
      descricao: `Ciclo de entrega rápido — ${github.prsMerged30d} PRs integrados em menos de 1 dia em média`,
      evidencia: `GitHub: tempo médio até merge = ${github.tempoMedioAbertoDias} dias, ${github.prsMerged30d} PRs merged (30d)`,
      acaoSugerida: 'Reconhecer agilidade no próximo 1:1',
    })
  }

  if (github.prsRevisados >= 5) {
    insights.push({
      tipo: 'destaque',
      severidade: 'baixa',
      descricao: `Participação ativa em code reviews (${github.prsRevisados} reviews em 30d)`,
      evidencia: `GitHub: ${github.prsRevisados} code reviews realizadas nos últimos 30 dias`,
      acaoSugerida: 'Reconhecer contribuição ao time no próximo 1:1',
    })
  }

  if (github.commitsPorSemana >= 10) {
    insights.push({
      tipo: 'destaque',
      severidade: 'baixa',
      descricao: `Velocity consistente — ${github.commitsPorSemana} commits/semana em média`,
      evidencia: `GitHub: ${github.commits30d} commits (30d), média de ${github.commitsPorSemana}/semana`,
      acaoSugerida: 'Manter ritmo — verificar se qualidade acompanha volume no próximo 1:1',
    })
  }

  return insights
}

// ── Trend Detection (multi-período) ──────────────────────────────

function analyzeTrends(input: CrossAnalyzerInput): CrossInsight[] {
  const insights: CrossInsight[] = []
  const hist = input.historicoMensal

  if (!hist || hist.length < 2) return insights

  // Workload "alto" por 3+ meses consecutivos (mais recentes)
  const recentJira = hist.slice(0, 3).filter(h => h.jira?.workloadScore != null)
  const workloadAltoCount = recentJira.filter(h => h.jira!.workloadScore === 'alto').length
  if (recentJira.length >= 3 && workloadAltoCount >= 3) {
    insights.push({
      tipo: 'sobrecarga',
      severidade: 'alta',
      descricao: `Workload alto por ${workloadAltoCount} meses consecutivos`,
      evidencia: `Histórico: ${recentJira.slice(0, 3).map(h => h.mes).join(', ')} — todos com workload alto`,
      acaoSugerida: 'Revisar distribuição de tarefas e remover itens de baixa prioridade',
      gerarDemanda: true,
      causa_raiz: 'overloaded',
    })
  }

  // Commits em queda consistente por 3+ meses
  const commitsEntries = hist
    .filter(h => h.github?.commits30d != null)
    .slice(0, 4)
  if (commitsEntries.length >= 3) {
    const vals = commitsEntries.map(h => h.github!.commits30d)
    // Cada mês é menor que o anterior (ordem: mais recente primeiro)
    const quedaConsistente = vals.slice(0, -1).every((v, i) => v < vals[i + 1] * 0.85)
    if (quedaConsistente) {
      const display = [...vals].reverse()
      insights.push({
        tipo: 'gap_comunicacao',
        severidade: 'alta',
        descricao: `Commits em queda consistente: ${display.join(' → ')} (últimos ${vals.length} meses)`,
        evidencia: 'Tendência de queda persistente — não é evento pontual',
        acaoSugerida: 'Investigar causa: sobrecarga, desmotivação, ou mudança de responsabilidades',
      })
    }
  }

  // Collaboration score em declínio por 3+ meses
  const collabEntries = hist
    .filter(h => h.github?.collaborationScore != null)
    .slice(0, 4)
  if (collabEntries.length >= 3) {
    const vals = collabEntries.map(h => h.github!.collaborationScore)
    // Cada mês é menor ou igual ao anterior (ordem: mais recente primeiro)
    const emDeclinio = vals.slice(0, -1).every((v, i) => v <= vals[i + 1])
    const quedaTotal = vals[vals.length - 1] - vals[0]
    if (emDeclinio && quedaTotal >= 15) {
      const display = [...vals].reverse()
      insights.push({
        tipo: 'desalinhamento',
        severidade: 'media',
        descricao: `Collaboration score em declínio: ${display.join(' → ')} (últimos ${vals.length} meses)`,
        evidencia: `Queda de ${quedaTotal} pontos — possível isolamento gradual`,
        acaoSugerida: 'Verificar participação em reviews e pair programming na próxima 1:1',
      })
    }
  }

  return insights
}

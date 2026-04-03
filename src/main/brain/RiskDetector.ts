import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import yaml from 'js-yaml'
import { PersonRegistry, type PersonConfig } from '../registry/PersonRegistry'
import { ActionRegistry } from '../registry/ActionRegistry'
import type { ExternalDataHistory } from '../external/ExternalDataPass'
import type { Action } from '../../renderer/src/types/ipc'

// ── Types ──────────────────────────────────────────────────────

export interface RiskSignal {
  fonte: 'saude' | 'tendencia' | 'acoes' | 'jira' | 'github' | 'sustentacao'
  descricao: string
  peso: number
}

export interface PersonRisk {
  slug: string
  nome: string
  score: number
  severidade: 'critica' | 'alta' | 'media'
  sinais: RiskSignal[]
  recomendacao: string
  timestamp: string
}

export interface BrainResult {
  pessoas: PersonRisk[]
  geradoEm: string
}

// ── Helpers ────────────────────────────────────────────────────

function loadPerfilFrontmatter(
  workspacePath: string,
  slug: string,
): Record<string, unknown> | null {
  const perfilPath = join(workspacePath, 'pessoas', slug, 'perfil.md')
  if (!existsSync(perfilPath)) return null
  try {
    const raw = readFileSync(perfilPath, 'utf-8')
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/)
    if (!fmMatch) return null
    return (yaml.load(fmMatch[1]) as Record<string, unknown>) ?? null
  } catch {
    return null
  }
}

function loadExternalData(
  workspacePath: string,
  slug: string,
): ExternalDataHistory | null {
  const extPath = join(workspacePath, 'pessoas', slug, 'external_data.yaml')
  if (!existsSync(extPath)) return null
  try {
    return yaml.load(readFileSync(extPath, 'utf-8')) as ExternalDataHistory
  } catch {
    return null
  }
}

function computeCommitsBaseline(
  historico: ExternalDataHistory['historico'],
): number | null {
  const months = Object.keys(historico).sort().reverse()
  if (months.length < 2) return null

  let total = 0
  let count = 0
  for (const key of months) {
    const commits = historico[key].github?.commits30d
    if (commits != null) {
      total += commits
      count++
    }
  }
  return count >= 2 ? Math.round(total / count) : null
}

// ── Main function ──────────────────────────────────────────────

export async function detectConvergencia(
  workspacePath: string,
): Promise<BrainResult> {
  const registry = new PersonRegistry(workspacePath)
  const actionRegistry = new ActionRegistry(workspacePath)
  const pessoas = registry.list()
  const liderados = pessoas.filter((p: PersonConfig) => p.relacao === 'liderado')
  const results: PersonRisk[] = []
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  for (const pessoa of liderados) {
    const sinais: RiskSignal[] = []

    const perfil = loadPerfilFrontmatter(workspacePath, pessoa.slug)
    const acoes = actionRegistry.list(pessoa.slug)
    const extData = loadExternalData(workspacePath, pessoa.slug)

    // === SINAIS DE SAÚDE E TENDÊNCIA ===

    if (perfil?.saude === 'vermelho') {
      sinais.push({ fonte: 'saude', descricao: 'Saúde vermelha', peso: 40 })
    } else if (perfil?.saude === 'amarelo') {
      sinais.push({ fonte: 'saude', descricao: 'Saúde amarela', peso: 20 })
    }

    if (perfil?.tendencia_emocional === 'deteriorando') {
      sinais.push({ fonte: 'tendencia', descricao: 'Tendência emocional deteriorando', peso: 25 })
    }

    if (perfil?.alerta_estagnacao) {
      sinais.push({ fonte: 'tendencia', descricao: 'Alerta de estagnação ativo', peso: 15 })
    }

    // === SINAIS DE AÇÕES ===

    const acoesVencidas = acoes.filter(
      (a: Action) => a.status === 'open' && a.prazo && new Date(a.prazo) < hoje,
    )
    if (acoesVencidas.length >= 2) {
      sinais.push({
        fonte: 'acoes',
        descricao: `${acoesVencidas.length} ações vencidas`,
        peso: Math.min(acoesVencidas.length * 8, 24),
      })
    }

    const acoesAbandonadas = acoes.filter(
      (a: Action) =>
        a.status === 'open' &&
        ((a as Record<string, unknown>).ciclos_sem_mencao as number ?? 0) >= 2,
    )
    if (acoesAbandonadas.length >= 1) {
      sinais.push({
        fonte: 'acoes',
        descricao: `${acoesAbandonadas.length} ação(ões) sem menção por 2+ ciclos`,
        peso: acoesAbandonadas.length * 10,
      })
    }

    // === SINAIS DE DADOS EXTERNOS (JIRA/GITHUB) ===

    if (extData?.atual?.atualizadoEm) {
      const diasDesdeColeta = Math.floor(
        (Date.now() - new Date(extData.atual.atualizadoEm).getTime()) / 86_400_000,
      )

      if (diasDesdeColeta <= 7) {
        // Queda de commits — compara snapshot atual com média histórica
        if (extData.atual.github?.commits30d != null && extData.historico) {
          const baseline = computeCommitsBaseline(extData.historico)
          if (baseline != null && baseline > 0) {
            const quedaPercent = (baseline - extData.atual.github.commits30d) / baseline
            if (quedaPercent >= 0.4) {
              sinais.push({
                fonte: 'github',
                descricao: `Queda de ${Math.round(quedaPercent * 100)}% em commits vs baseline`,
                peso: 20,
              })
            }
          }
        }

        // Workload alto no Jira
        if (extData.atual.jira?.workloadScore === 'alto') {
          sinais.push({
            fonte: 'jira',
            descricao: `Workload alto no Jira (${extData.atual.jira.issuesAbertas} issues abertas)`,
            peso: 15,
          })
        }

        // Blockers ativos
        if (extData.atual.jira?.blockersAtivos && extData.atual.jira.blockersAtivos.length > 0) {
          sinais.push({
            fonte: 'jira',
            descricao: `${extData.atual.jira.blockersAtivos.length} blocker(s) ativo(s)`,
            peso: 10,
          })
        }
      }
    }

    // === SCORE E CLASSIFICAÇÃO ===

    const score = sinais.reduce((acc, s) => acc + s.peso, 0)
    if (score < 30) continue

    const severidade: PersonRisk['severidade'] =
      score >= 70 ? 'critica' : score >= 50 ? 'alta' : 'media'

    // === RECOMENDAÇÃO DETERMINÍSTICA ===

    let recomendacao = 'Acompanhar na próxima 1:1.'
    if (severidade === 'critica') {
      recomendacao = 'Agendar 1:1 urgente esta semana.'
    } else if (perfil?.tendencia_emocional === 'deteriorando') {
      recomendacao = 'Verificar causas da tendência emocional negativa na próxima 1:1.'
    } else if (acoesAbandonadas.length > 0) {
      recomendacao = 'Revisar ações paradas e remover bloqueios na próxima 1:1.'
    }

    results.push({
      slug: pessoa.slug,
      nome: pessoa.nome,
      score,
      severidade,
      sinais,
      recomendacao,
      timestamp: new Date().toISOString(),
    })
  }

  results.sort((a, b) => b.score - a.score)

  return { pessoas: results, geradoEm: new Date().toISOString() }
}

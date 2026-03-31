/**
 * SystemAuditor — Verificações determinísticas de saúde do sistema.
 *
 * Executa checagens sem IA para garantir que:
 * 1. Loops de retroalimentação estão funcionando (dados fluem entre camadas)
 * 2. Dados não estão stale (perfis, ações, external data)
 * 3. Silos de dados são detectados (informação armazenada mas não usada)
 * 4. Consistência entre camadas (actions vs perfil vs config)
 *
 * Pode ser chamado via IPC ou programaticamente.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import yaml from 'js-yaml'
import type { PersonConfig } from '../registry/PersonRegistry'
import { PersonRegistry } from '../registry/PersonRegistry'
import { ActionRegistry } from '../registry/ActionRegistry'
import { DemandaRegistry } from '../registry/DemandaRegistry'

export type AuditSeverity = 'critical' | 'warning' | 'info' | 'ok'

export interface AuditFinding {
  category: string
  check: string
  severity: AuditSeverity
  message: string
  personSlug?: string
  suggestion?: string
}

export interface AuditReport {
  timestamp: string
  totalPeople: number
  findings: AuditFinding[]
  score: number // 0-100
  summary: {
    critical: number
    warning: number
    info: number
    ok: number
  }
}

export class SystemAuditor {
  private workspacePath: string
  private findings: AuditFinding[] = []

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath
  }

  async run(): Promise<AuditReport> {
    this.findings = []
    const registry = new PersonRegistry(this.workspacePath)
    const people = registry.list()

    // Run all checks
    this.checkFeedbackLoops(people, registry)
    this.checkDataFreshness(people, registry)
    this.checkDataConsistency(people, registry)
    this.checkDataSilos(people, registry)
    this.checkExternalIntegration(people)
    this.checkActionHealth(people)
    this.checkPDIHealth(people, registry)

    const summary = {
      critical: this.findings.filter((f) => f.severity === 'critical').length,
      warning: this.findings.filter((f) => f.severity === 'warning').length,
      info: this.findings.filter((f) => f.severity === 'info').length,
      ok: this.findings.filter((f) => f.severity === 'ok').length,
    }

    // Score: 100 - (criticals * 15 + warnings * 5 + infos * 1), min 0
    const score = Math.max(0, 100 - (summary.critical * 15 + summary.warning * 5 + summary.info * 1))

    return {
      timestamp: new Date().toISOString(),
      totalPeople: people.length,
      findings: this.findings,
      score,
      summary,
    }
  }

  // ── Check 1: Feedback Loops ──────────────────────────────────

  private checkFeedbackLoops(people: PersonConfig[], registry: PersonRegistry): void {
    for (const person of people) {
      const perfil = registry.getPerfil(person.slug)
      if (!perfil) {
        this.add('feedback-loop', 'perfil-exists', 'warning', `${person.nome} não tem perfil.md`, person.slug, 'Ingerir pelo menos um artefato')
        continue
      }

      const raw = perfil.raw

      // Check: Insights de 1:1 section exists and has content
      const hasInsights = raw.includes('## Insights de 1:1') && /## Insights de 1:1[\s\S]*?\*\*\d{4}/.test(raw)
      if (!hasInsights && (perfil.frontmatter.total_artefatos as number) >= 3) {
        this.add('feedback-loop', 'insights-present', 'warning',
          `${person.nome} tem ${perfil.frontmatter.total_artefatos} artefatos mas nenhum insight de 1:1`,
          person.slug, 'Verificar se o 1:1 deep pass está rodando')
      }

      // Check: Tendência emocional is set
      const tendencia = perfil.frontmatter.tendencia_emocional as string | undefined
      if (!tendencia && (perfil.frontmatter.ultimo_1on1 as string)) {
        this.add('feedback-loop', 'tendencia-set', 'info',
          `${person.nome} teve 1:1 mas tendência emocional não definida`,
          person.slug, 'Deep pass pode ter falhado ou não rodado')
      }

      // Check: External data section exists for people with Jira/GitHub
      if (person.jiraEmail || person.githubUsername) {
        const hasExternalData = raw.includes('## Dados Externos')
        if (!hasExternalData) {
          this.add('feedback-loop', 'external-data-present', 'warning',
            `${person.nome} tem identidade externa mas sem dados Jira/GitHub no perfil`,
            person.slug, 'Verificar configuração Jira/GitHub em Settings')
        }
      }

      // Check: Sinais de Terceiros present for people with ceremonies
      const totalArtifacts = perfil.frontmatter.total_artefatos as number ?? 0
      const hasSinais = raw.includes('## Sinais de Terceiros') && /## Sinais de Terceiros[\s\S]*?\*\*\d{4}/.test(raw)
      if (!hasSinais && totalArtifacts >= 5) {
        this.add('feedback-loop', 'sinais-terceiros', 'info',
          `${person.nome} tem ${totalArtifacts} artefatos mas nenhum sinal de terceiro`,
          person.slug, 'Ingerir artefatos de cerimônias coletivas (dailies, retros)')
      }
    }
  }

  // ── Check 2: Data Freshness ──────────────────────────────────

  private checkDataFreshness(people: PersonConfig[], registry: PersonRegistry): void {
    const now = Date.now()
    const DAY = 86_400_000

    for (const person of people) {
      const perfil = registry.getPerfil(person.slug)
      if (!perfil) continue

      // Check: Last ingestion freshness
      const ultimaIngestao = perfil.frontmatter.ultima_ingestao as string
      if (ultimaIngestao) {
        const daysSince = Math.floor((now - new Date(ultimaIngestao).getTime()) / DAY)
        if (daysSince > 30) {
          this.add('freshness', 'ingestion-stale', 'critical',
            `${person.nome}: ${daysSince} dias sem ingestão`,
            person.slug, 'Ingerir artefato recente para atualizar perfil')
        } else if (daysSince > 14) {
          this.add('freshness', 'ingestion-aging', 'warning',
            `${person.nome}: ${daysSince} dias sem ingestão`,
            person.slug, 'Considerar ingerir artefato recente')
        }
      }

      // Check: 1:1 frequency compliance
      const ultimo1on1 = perfil.frontmatter.ultimo_1on1 as string
      if (ultimo1on1 && person.frequencia_1on1_dias) {
        const daysSince = Math.floor((now - new Date(ultimo1on1).getTime()) / DAY)
        const tolerance = person.frequencia_1on1_dias + 3
        if (daysSince > tolerance * 2) {
          this.add('freshness', '1on1-very-overdue', 'critical',
            `${person.nome}: ${daysSince} dias sem 1:1 (frequência: ${person.frequencia_1on1_dias}d)`,
            person.slug, 'Agendar 1:1 urgente')
        } else if (daysSince > tolerance) {
          this.add('freshness', '1on1-overdue', 'warning',
            `${person.nome}: ${daysSince} dias sem 1:1 (frequência: ${person.frequencia_1on1_dias}d)`,
            person.slug, 'Verificar agenda de 1:1')
        }
      }

      // Check: External data freshness
      const externalPath = join(this.workspacePath, 'pessoas', person.slug, 'external_data.yaml')
      if (existsSync(externalPath)) {
        try {
          const stat = statSync(externalPath)
          const daysSinceUpdate = Math.floor((now - stat.mtimeMs) / DAY)
          if (daysSinceUpdate > 7) {
            this.add('freshness', 'external-data-stale', 'warning',
              `${person.nome}: dados externos com ${daysSinceUpdate} dias`,
              person.slug, 'Atualizar dados via Relatórios ou refresh manual')
          }
        } catch { /* ignore */ }
      }
    }
  }

  // ── Check 3: Data Consistency ────────────────────────────────

  private checkDataConsistency(people: PersonConfig[], registry: PersonRegistry): void {
    for (const person of people) {
      const perfil = registry.getPerfil(person.slug)
      if (!perfil) continue

      const actionReg = new ActionRegistry(this.workspacePath)
      const actions = actionReg.list(person.slug)

      // Check: Perfil schema version
      const schemaVersion = perfil.frontmatter.schema_version as number
      if (!schemaVersion || schemaVersion < 5) {
        this.add('consistency', 'schema-outdated', 'warning',
          `${person.nome}: perfil com schema v${schemaVersion ?? '?'} (atual: v5)`,
          person.slug, 'Re-ingerir artefatos para migrar schema')
      }

      // Check: Actions without deadline
      const openWithoutDeadline = actions.filter((a) => a.status === 'open' && !a.prazo)
      if (openWithoutDeadline.length > 3) {
        this.add('consistency', 'actions-no-deadline', 'warning',
          `${person.nome}: ${openWithoutDeadline.length} ações abertas sem prazo`,
          person.slug, 'Definir prazos para ações pendentes')
      }

      // Check: Config PDI vs perfil insights
      if (person.pdi && person.pdi.length > 0) {
        const allNaoIniciado = person.pdi.every((p) => p.status === 'nao_iniciado')
        const totalArtifacts = perfil.frontmatter.total_artefatos as number ?? 0
        if (allNaoIniciado && totalArtifacts >= 5) {
          this.add('consistency', 'pdi-stale', 'info',
            `${person.nome}: ${person.pdi.length} objetivos PDI todos "não iniciado" após ${totalArtifacts} artefatos`,
            person.slug, 'Verificar se PDI está sendo discutido nas 1:1s')
        }
      }
    }
  }

  // ── Check 4: Data Silos ──────────────────────────────────────

  private checkDataSilos(people: PersonConfig[], registry: PersonRegistry): void {
    // Check: People with external identity but no external data
    const withIdentity = people.filter((p) => p.jiraEmail || p.githubUsername)
    const withoutData = withIdentity.filter((p) => {
      const path = join(this.workspacePath, 'pessoas', p.slug, 'external_data.yaml')
      return !existsSync(path)
    })
    if (withoutData.length > 0) {
      this.add('data-silos', 'external-identity-unused', 'warning',
        `${withoutData.length} pessoa(s) com Jira/GitHub configurado mas sem dados coletados: ${withoutData.map((p) => p.nome).join(', ')}`,
        undefined, 'Executar "Atualizar Daily" nos Relatórios')
    }

    // Check: Demandas linked to people but person cockpit not aware
    const demandaReg = new DemandaRegistry(this.workspacePath)
    const allDemandas = demandaReg.list()
    const openDemandasWithPerson = allDemandas.filter((d) => d.status === 'open' && d.pessoaSlug)
    if (openDemandasWithPerson.length > 5) {
      this.add('data-silos', 'demandas-accumulating', 'info',
        `${openDemandasWithPerson.length} demandas abertas vinculadas a pessoas`,
        undefined, 'Revisar demandas pendentes no módulo "Eu"')
    }
  }

  // ── Check 5: External Integration ────────────────────────────

  private checkExternalIntegration(people: PersonConfig[]): void {
    // Check: People registered but no external identity
    const withoutIdentity = people.filter((p) => !p.jiraEmail && !p.githubUsername)
    if (withoutIdentity.length > 0 && withoutIdentity.length < people.length) {
      // Only flag if SOME people have it (mixed setup)
      this.add('external', 'partial-identity', 'info',
        `${withoutIdentity.length} pessoa(s) sem Jira/GitHub configurado: ${withoutIdentity.map((p) => p.nome).join(', ')}`,
        undefined, 'Adicionar jiraEmail/githubUsername no cadastro da pessoa')
    }
  }

  // ── Check 6: Action Health ───────────────────────────────────

  private checkActionHealth(people: PersonConfig[]): void {
    const now = Date.now()
    const DAY = 86_400_000

    for (const person of people) {
      const actionReg = new ActionRegistry(this.workspacePath)
      const actions = actionReg.list(person.slug)
      const open = actions.filter((a) => a.status === 'open')

      // Check: Actions at abandonment risk
      const abandoned = open.filter((a) =>
        ((a as Record<string, unknown>).ciclos_sem_mencao as number ?? 0) >= 2
      )
      if (abandoned.length > 0) {
        this.add('actions', 'abandonment-risk', 'warning',
          `${person.nome}: ${abandoned.length} ação(ões) com risco de abandono (2+ ciclos sem menção)`,
          person.slug, 'Abordar na próxima 1:1 ou encerrar formalmente')
      }

      // Check: Overdue actions
      const today = new Date().toISOString().slice(0, 10)
      const overdue = open.filter((a) => a.prazo && a.prazo < today)
      if (overdue.length > 3) {
        this.add('actions', 'overdue-accumulating', 'critical',
          `${person.nome}: ${overdue.length} ações vencidas`,
          person.slug, 'Priorizar e resolver ou cancelar ações vencidas')
      }

      // Check: Gestor promises aging
      const gestorOpen = open.filter((a) => a.owner === 'gestor')
      const gestorAging = gestorOpen.filter((a) => {
        const days = Math.floor((now - new Date(a.criadoEm).getTime()) / DAY)
        return days >= 14
      })
      if (gestorAging.length > 0) {
        this.add('actions', 'gestor-promises-aging', 'warning',
          `${person.nome}: ${gestorAging.length} promessa(s) do gestor pendente(s) há 14+ dias`,
          person.slug, 'Cumprir ou comunicar atraso ao liderado')
      }
    }
  }

  // ── Check 7: PDI Health ──────────────────────────────────────

  private checkPDIHealth(people: PersonConfig[], registry: PersonRegistry): void {
    for (const person of people) {
      // Check: People without PDI
      if (!person.pdi || person.pdi.length === 0) {
        if (person.relacao === 'liderado') {
          this.add('pdi', 'no-pdi', 'info',
            `${person.nome}: liderado sem PDI definido`,
            person.slug, 'Definir pelo menos 1 objetivo de desenvolvimento')
        }
        continue
      }

      // Check: PDI objectives stuck
      const stuck = person.pdi.filter((p) => p.status === 'em_andamento' && p.prazo)
      const overdue = stuck.filter((p) => p.prazo! < new Date().toISOString().slice(0, 10))
      if (overdue.length > 0) {
        this.add('pdi', 'pdi-overdue', 'warning',
          `${person.nome}: ${overdue.length} objetivo(s) PDI vencido(s)`,
          person.slug, 'Revisar PDI — extender prazo ou ajustar objetivo')
      }

      // Check: All PDI complete
      const allComplete = person.pdi.every((p) => p.status === 'concluido')
      if (allComplete && person.pdi.length > 0) {
        this.add('pdi', 'pdi-all-complete', 'info',
          `${person.nome}: todos os ${person.pdi.length} objetivos PDI concluídos`,
          person.slug, 'Definir novos objetivos de desenvolvimento')
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────

  private add(category: string, check: string, severity: AuditSeverity, message: string, personSlug?: string, suggestion?: string): void {
    this.findings.push({ category, check, severity, message, personSlug, suggestion })
  }
}

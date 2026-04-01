import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import yaml from 'js-yaml'
import type { Action, ActionStatus, ActionStatusHistoryEntry } from '../../renderer/src/types/ipc'
import type { AcaoComprometida } from '../prompts/ingestion.prompt'
import type { OneOnOneResult, OneOnOneFollowup, OneOnOneAcaoLiderado } from '../prompts/1on1-deep.prompt'

export class ActionRegistry {
  private pessoasDir: string

  constructor(workspacePath: string) {
    this.pessoasDir = join(workspacePath, 'pessoas')
  }

  list(slug: string): Action[] {
    const filePath = this.actionsPath(slug)
    if (!existsSync(filePath)) return []
    try {
      const raw = readFileSync(filePath, 'utf-8')
      const data = yaml.load(raw) as { actions?: Action[] }
      const actions = data?.actions ?? []
      // Dedup defensivo: remove duplicatas por ID preservando a primeira ocorrência
      const seenIds = new Set<string>()
      return actions.filter((a) => {
        if (seenIds.has(a.id)) return false
        seenIds.add(a.id)
        return true
      })
    } catch {
      return []
    }
  }

  save(action: Action): void {
    const actions = this.list(action.personSlug)
    const idx = actions.findIndex((a) => a.id === action.id)
    if (idx >= 0) {
      actions[idx] = action
    } else {
      actions.unshift(action)
    }
    this.write(action.personSlug, actions)
  }

  delete(slug: string, id: string): void {
    const actions = this.list(slug)
    // Remove todas as cópias com o mesmo ID (dedup defensivo)
    const filtered = actions.filter((a) => a.id !== id)
    if (filtered.length !== actions.length) {
      this.write(slug, filtered)
    }
  }

  updateStatus(slug: string, id: string, status: ActionStatus): void {
    const actions = this.list(slug)
    let changed = false
    for (const action of actions) {
      if (action.id === id) {
        this.appendHistory(action, status, 'manual')
        action.status = status
        if (status === 'done') action.concluidoEm = new Date().toISOString().slice(0, 10)
        changed = true
      }
    }
    if (changed) this.write(slug, actions)
  }

  updateStatusWithSource(slug: string, id: string, status: ActionStatus, source: ActionStatusHistoryEntry['source']): void {
    const actions = this.list(slug)
    let changed = false
    for (const action of actions) {
      if (action.id === id) {
        this.appendHistory(action, status, source)
        action.status = status
        if (status === 'done') action.concluidoEm = new Date().toISOString().slice(0, 10)
        changed = true
      }
    }
    if (changed) this.write(slug, actions)
  }

  /**
   * Returns open actions for a person, optionally filtered by owner.
   * Used by Pass de 1:1 to serialize context for follow-up analysis.
   */
  getOpenByOwner(slug: string, owner?: 'gestor' | 'liderado' | 'terceiro'): Action[] {
    const actions = this.list(slug).filter((a) => a.status === 'open')
    if (!owner) return actions
    return actions.filter((a) => a.owner === owner)
  }

  createFromArtifact(
    slug: string,
    acoes: AcaoComprometida[],
    artifactFileName: string,
    date: string,
    registeredSlugs?: Set<string>,
  ): void {
    const existing = this.list(slug)
    const newActions: Action[] = acoes.map((acao, i) => {
      const texto = `${acao.responsavel}: ${acao.descricao}${acao.prazo_iso ? ` até ${acao.prazo_iso}` : ''}`
      // Infer owner: if responsavel matches the person's slug or "gestor", it's 'gestor'
      const responsavelSlug = registeredSlugs
        ? this.inferSlug(acao.responsavel, registeredSlugs)
        : null
      const owner = responsavelSlug === slug ? 'liderado' : 'gestor'
      return {
        id:               `${date}-${slug}-${i}`,
        personSlug:       slug,
        texto,
        descricao:        acao.descricao,
        responsavel:      acao.responsavel,
        responsavel_slug: responsavelSlug,
        prazo:            acao.prazo_iso ?? null,
        owner,
        prioridade:       'media',
        status:           'open' as ActionStatus,
        criadoEm:         date,
        fonteArtefato:    artifactFileName,
        statusHistory:    [{ status: 'open' as ActionStatus, date, source: 'ingestion' as const }],
      }
    })

    // Deduplicate by ID and texto to avoid creating the same action twice on re-ingest
    const existingIds    = new Set(existing.map((a) => a.id))
    const existingTextos = new Set(existing.map((a) => a.texto.trim().toLowerCase()))
    const toAdd = newActions.filter(
      (a) => !existingIds.has(a.id) && !existingTextos.has(a.texto.trim().toLowerCase()),
    )

    if (toAdd.length > 0) {
      this.write(slug, [...toAdd, ...existing])
    }
  }

  /**
   * Batch-updates action statuses based on 1:1 follow-up results.
   * Increments ciclos_sem_mencao for actions not mentioned.
   */
  updateFromFollowup(slug: string, followups: OneOnOneFollowup[]): void {
    const actions = this.list(slug)
    let changed = false

    for (const fu of followups) {
      const action = actions.find((a) => a.id === fu.acao_id)
      if (!action) continue

      if (fu.status === 'cumprida') {
        this.appendHistory(action, 'done', '1on1-deep')
        action.status = 'done'
        action.concluidoEm = new Date().toISOString().slice(0, 10)
        changed = true
      } else if (fu.status === 'em_andamento' && action.status === 'open') {
        this.appendHistory(action, 'in_progress', '1on1-deep')
        action.status = 'in_progress'
        changed = true
      } else if (fu.status === 'abandonada') {
        this.appendHistory(action, 'cancelled', '1on1-deep')
        action.status = 'cancelled'
        action.concluidoEm = new Date().toISOString().slice(0, 10)
        changed = true
      } else if (fu.status === 'nao_mencionada') {
        // Increment ciclos_sem_mencao (backward compat — field may not exist)
        const current = (action as Record<string, unknown>).ciclos_sem_mencao as number ?? 0
        ;(action as Record<string, unknown>).ciclos_sem_mencao = current + 1
        changed = true
      }
    }

    if (changed) this.write(slug, actions)
  }

  /**
   * Creates new actions from 1:1 deep pass results.
   * Handles acoes_liderado + sugestoes_gestor that generated actions.
   * Also returns acoes_gestor for DemandaRegistry routing.
   */
  createFrom1on1Result(
    slug: string,
    result: OneOnOneResult,
    date: string,
    artifactFileName: string,
  ): void {
    const existing = this.list(slug)
    const existingIds    = new Set(existing.map((a) => a.id))
    const existingTextos = new Set(existing.map((a) => a.texto.trim().toLowerCase()))

    const newActions: Action[] = []

    // Actions from acoes_liderado
    for (let i = 0; i < result.acoes_liderado.length; i++) {
      const acao = result.acoes_liderado[i]
      const texto = `${slug}: ${acao.descricao}${acao.prazo_iso ? ` até ${acao.prazo_iso}` : ''}`
      const candidateId = `${date}-1on1-${slug}-${i}`
      if (existingIds.has(candidateId) || existingTextos.has(texto.trim().toLowerCase())) continue

      newActions.push({
        id:               `${date}-1on1-${slug}-${i}`,
        personSlug:       slug,
        texto,
        descricao:        acao.descricao,
        responsavel:      slug,
        responsavel_slug: slug,
        prazo:            acao.prazo_iso ?? null,
        owner:            'liderado',
        prioridade:       'media',
        status:           'open' as ActionStatus,
        criadoEm:         date,
        fonteArtefato:    artifactFileName,
        statusHistory:    [{ status: 'open' as ActionStatus, date, source: '1on1-deep' as const }],
        // Extended v2 fields (backward compat — optional)
        ...({
          tipo:          acao.tipo,
          origem_pauta:  acao.origem_pauta,
          contexto:      acao.contexto,
          ciclos_sem_mencao: 0,
        } as Record<string, unknown>),
      } as Action)
    }

    if (newActions.length > 0) {
      this.write(slug, [...newActions, ...existing])
    }
  }

  private appendHistory(action: Action, newStatus: ActionStatus, source: ActionStatusHistoryEntry['source']): void {
    if (!action.statusHistory) action.statusHistory = []
    action.statusHistory.push({
      status: newStatus,
      date: new Date().toISOString().slice(0, 10),
      source,
    })
  }

  private inferSlug(nome: string, registeredSlugs: Set<string>): string | null {
    const candidate = nome.toLowerCase().replace(/\s+/g, '-')
    if (registeredSlugs.has(candidate)) return candidate
    // Try matching by first word (first name)
    const firstName = candidate.split('-')[0]
    for (const slug of registeredSlugs) {
      if (slug.startsWith(firstName)) return slug
    }
    return null
  }

  private actionsPath(slug: string): string {
    return join(this.pessoasDir, slug, 'actions.yaml')
  }

  private write(slug: string, actions: Action[]): void {
    const dir = join(this.pessoasDir, slug)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(this.actionsPath(slug), yaml.dump({ actions }), 'utf-8')
  }
}

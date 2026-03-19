import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import yaml from 'js-yaml'
import type { Action, ActionStatus } from '../../renderer/src/types/ipc'
import type { AcaoComprometida } from '../prompts/ingestion.prompt'

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
      return data?.actions ?? []
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

  updateStatus(slug: string, id: string, status: ActionStatus): void {
    const actions = this.list(slug)
    const action = actions.find((a) => a.id === id)
    if (!action) return
    action.status = status
    if (status === 'done') action.concluidoEm = new Date().toISOString().slice(0, 10)
    this.write(slug, actions)
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
        responsavel:      acao.responsavel,
        responsavel_slug: responsavelSlug,
        prazo:            acao.prazo_iso ?? null,
        owner,
        prioridade:       'media',
        status:           'open' as ActionStatus,
        criadoEm:         date,
        fonteArtefato:    artifactFileName,
      }
    })

    // Deduplicate by texto to avoid creating the same action twice on re-ingest
    const existingTextos = new Set(existing.map((a) => a.texto.trim().toLowerCase()))
    const toAdd = newActions.filter((a) => !existingTextos.has(a.texto.trim().toLowerCase()))

    if (toAdd.length > 0) {
      this.write(slug, [...toAdd, ...existing])
    }
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

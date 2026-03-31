import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, statSync } from 'fs'
import { join, extname } from 'path'
import yaml from 'js-yaml'
import { migrateProfileContent } from '../migration/ProfileMigration'
import { ActionRegistry } from './ActionRegistry'

export interface PersonConfig {
  schema_version: number
  nome: string
  slug: string
  cargo: string
  nivel: string
  area?: string
  squad?: string
  relacao: string
  inicio_na_funcao?: string
  inicio_na_empresa?: string
  frequencia_1on1_dias: number
  em_processo_promocao: boolean
  objetivo_cargo_alvo?: string
  pdi: Array<{ objetivo: string; status: string; prazo?: string }>
  notas_manuais?: string
  alerta_ativo: boolean
  motivo_alerta?: string
  criado_em: string
  atualizado_em: string
  // Identidade externa (V3)
  jiraEmail?: string
  githubUsername?: string
}

export interface LideradoSnapshot {
  slug:                   string
  nome:                   string
  cargo:                  string
  saude:                  'verde' | 'amarelo' | 'vermelho'
  necessita_1on1:         boolean
  motivo_1on1:            string | null
  alerta_estagnacao:      boolean
  motivo_estagnacao:      string | null
  sinal_evolucao:         boolean
  evidencia_evolucao:     string | null
  acoes_pendentes_count:  number
  acoes_vencidas_count:   number        // open actions past their deadline
  precisa_1on1_frequencia: boolean      // overdue by frequency config (no AI needed)
  dias_sem_1on1:          number | null // days since last 1:1
  dados_stale:            boolean       // true if no ingestion in 30+ days
}

const PERSON_SUBDIRS = ['historico', 'pautas']

export class PersonRegistry {
  private workspacePath: string
  private pessoasDir: string

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath
    this.pessoasDir = join(workspacePath, 'pessoas')
  }

  list(): PersonConfig[] {
    if (!existsSync(this.pessoasDir)) return []
    try {
      return readdirSync(this.pessoasDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => this.get(d.name))
        .filter((p): p is PersonConfig => p !== null)
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    } catch {
      return []
    }
  }

  get(slug: string): PersonConfig | null {
    const configPath = join(this.pessoasDir, slug, 'config.yaml')
    if (!existsSync(configPath)) return null
    try {
      const parsed = yaml.load(readFileSync(configPath, 'utf-8'))
      if (!parsed || typeof parsed !== 'object') return null
      return parsed as PersonConfig
    } catch {
      return null
    }
  }

  save(config: PersonConfig): void {
    const dir = join(this.pessoasDir, config.slug)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
      for (const sub of PERSON_SUBDIRS) {
        mkdirSync(join(dir, sub), { recursive: true })
      }
    }
    const now = new Date().toISOString()
    const toSave: PersonConfig = {
      schema_version: 1,
      pdi: [],
      alerta_ativo: false,
      em_processo_promocao: false,
      frequencia_1on1_dias: 14,
      ...config,
      criado_em: config.criado_em || now,
      atualizado_em: now,
    }
    writeFileSync(
      join(dir, 'config.yaml'),
      yaml.dump(toSave, { lineWidth: 120, quotingType: '"' }),
      'utf-8',
    )
  }

  delete(slug: string): void {
    const dir = join(this.pessoasDir, slug)
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }

  getPerfil(slug: string): { raw: string; frontmatter: Record<string, unknown> } | null {
    const perfilPath = join(this.pessoasDir, slug, 'perfil.md')
    if (!existsSync(perfilPath)) return null
    const rawOriginal = readFileSync(perfilPath, 'utf-8')
    const raw = migrateProfileContent(rawOriginal)
    // Persist migration if content changed
    if (raw !== rawOriginal) writeFileSync(perfilPath, raw, 'utf-8')
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/)
    if (!fmMatch) return { raw, frontmatter: {} }
    try {
      const frontmatter = yaml.load(fmMatch[1]) as Record<string, unknown>
      return { raw, frontmatter }
    } catch {
      return { raw, frontmatter: {} }
    }
  }

  listArtifacts(slug: string): Array<{ fileName: string; titulo: string; tipo: string; date: string; path: string }> {
    const historicoDir = join(this.pessoasDir, slug, 'historico')
    if (!existsSync(historicoDir)) return []
    try {
      return readdirSync(historicoDir)
        .filter((f) => extname(f) === '.md')
        .map((fileName) => {
          const filePath = join(historicoDir, fileName)
          const content = readFileSync(filePath, 'utf-8')
          const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
          let tipo = 'outro'
          let date = ''
          if (fmMatch) {
            try {
              const fm = yaml.load(fmMatch[1]) as Record<string, unknown>
              tipo = (fm.tipo as string) || 'outro'
              const rawDate = fm.data
              if (rawDate instanceof Date) date = rawDate.toISOString().slice(0, 10)
              else if (rawDate) date = String(rawDate)
            } catch { /* skip */ }
          }
          const stat = statSync(filePath)
          if (!date) date = stat.mtime.toISOString().slice(0, 10)
          const h1Match = content.match(/^# (.+)$/m)
          const titulo = h1Match ? h1Match[1].trim() : fileName
          return { fileName, titulo, tipo, date, path: filePath }
        })
        .sort((a, b) => b.date.localeCompare(a.date)) // newest first
    } catch {
      return []
    }
  }

  getConfigRaw(slug: string): string {
    const configPath = join(this.pessoasDir, slug, 'config.yaml')
    if (!existsSync(configPath)) return ''
    return readFileSync(configPath, 'utf-8')
  }

  listPautas(slug: string): Array<{ fileName: string; date: string; path: string }> {
    const pautasDir = join(this.pessoasDir, slug, 'pautas')
    if (!existsSync(pautasDir)) return []
    try {
      return readdirSync(pautasDir)
        .filter((f) => extname(f) === '.md')
        .map((fileName) => {
          const filePath = join(pautasDir, fileName)
          const dateMatch = fileName.match(/^(\d{4}-\d{2}-\d{2})/)
          const date = dateMatch ? dateMatch[1] : statSync(filePath).mtime.toISOString().slice(0, 10)
          return { fileName, date, path: filePath }
        })
        .sort((a, b) => b.date.localeCompare(a.date))
    } catch {
      return []
    }
  }

  savePauta(slug: string, date: string, content: string): void {
    const pautasDir = join(this.pessoasDir, slug, 'pautas')
    if (!existsSync(pautasDir)) mkdirSync(pautasDir, { recursive: true })
    writeFileSync(join(pautasDir, `${date}-pauta.md`), content, 'utf-8')
  }

  getLastPautas(slug: string, count: number): Array<{ date: string; content: string }> {
    const recent = this.listPautas(slug).slice(0, count)
    return recent.map((p) => {
      try {
        return { date: p.date, content: readFileSync(p.path, 'utf-8') }
      } catch {
        return { date: p.date, content: '' }
      }
    }).filter((p) => p.content.length > 0)
  }

  listArtifactsWithContent(
    slug: string,
    from: string,
    to: string,
  ): Array<{ date: string; tipo: string; content: string }> {
    const historicoDir = join(this.pessoasDir, slug, 'historico')
    if (!existsSync(historicoDir)) return []
    try {
      return readdirSync(historicoDir)
        .filter((f) => extname(f) === '.md')
        .map((fileName) => {
          const filePath = join(historicoDir, fileName)
          const raw = readFileSync(filePath, 'utf-8')
          const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/)
          let tipo = 'outro'
          let date = ''
          if (fmMatch) {
            try {
              const fm = yaml.load(fmMatch[1]) as Record<string, unknown>
              tipo = (fm.tipo as string) || 'outro'
              const rawDate = fm.data
              if (rawDate instanceof Date) date = rawDate.toISOString().slice(0, 10)
              else if (rawDate) date = String(rawDate)
            } catch { /* skip */ }
          }
          if (!date) date = statSync(filePath).mtime.toISOString().slice(0, 10)
          const body = raw.replace(/^---\n[\s\S]*?\n---\n\n?/, '')
          return { date, tipo, content: body }
        })
        .filter((a) => a.date >= from && a.date <= to)
        .sort((a, b) => a.date.localeCompare(b.date))
    } catch {
      return []
    }
  }

  listAllArtifacts(): Array<{ fileName: string; titulo: string; tipo: string; date: string; path: string; personSlug: string; personNome: string; resumo: string }> {
    const people = this.list()
    const all: Array<{ fileName: string; titulo: string; tipo: string; date: string; path: string; personSlug: string; personNome: string; resumo: string }> = []
    for (const person of people) {
      const artifacts = this.listArtifacts(person.slug).map((a) => ({
        ...a,
        personSlug: person.slug,
        personNome: person.nome,
        resumo: this.extractResumo(a.path),
      }))
      all.push(...artifacts)
    }
    // Include collective artifacts (_coletivo)
    const collectiveArtifacts = this.listArtifacts('_coletivo').map((a) => ({
      ...a,
      personSlug: '_coletivo',
      personNome: 'Reunião Coletiva',
      resumo: this.extractResumo(a.path),
    }))
    all.push(...collectiveArtifacts)

    return all.sort((a, b) => b.date.localeCompare(a.date))
  }

  /**
   * Snapshot de saúde de todos os liderados diretos.
   * Usado para gerar a pauta de 1:1 com o gestor (roll-up de time).
   */
  getTeamRollup(): LideradoSnapshot[] {
    const actionRegistry = new ActionRegistry(this.workspacePath)
    return this.list()
      .filter((p) => p.relacao === 'liderado')
      .map((p) => {
        const perfil = this.getPerfil(p.slug)
        const fm = perfil?.frontmatter ?? {}
        const hoje = new Date().toISOString().slice(0, 10)

        const ultimaIngestao = (fm.ultima_ingestao as string) || (fm.ultima_atualizacao as string)?.slice(0, 10) || null
        const dadosStale = ultimaIngestao
          ? (Date.now() - new Date(ultimaIngestao).getTime()) > 30 * 24 * 60 * 60 * 1000
          : false

        const ultimo1on1 = (fm.ultimo_1on1 as string) || null
        const diasSem1on1 = ultimo1on1
          ? Math.floor((Date.now() - new Date(ultimo1on1).getTime()) / 86_400_000)
          : null
        const frequencia = p.frequencia_1on1_dias ?? 14
        const precisa1on1Frequencia = diasSem1on1 !== null && diasSem1on1 > (frequencia + 3)

        const todasAcoes = actionRegistry.list(p.slug)
        const acoesPendentes = todasAcoes.filter((a) => a.status === 'open').length
        const acoesVencidas  = todasAcoes.filter((a) => a.status === 'open' && a.prazo != null && a.prazo < hoje).length

        return {
          slug:                   p.slug,
          nome:                   p.nome,
          cargo:                  p.cargo,
          saude:                  (fm.saude as LideradoSnapshot['saude']) ?? 'verde',
          necessita_1on1:         Boolean(fm.necessita_1on1),
          motivo_1on1:            (fm.motivo_1on1 as string) || null,
          alerta_estagnacao:      Boolean(fm.alerta_estagnacao),
          motivo_estagnacao:      (fm.motivo_estagnacao as string) || null,
          sinal_evolucao:         Boolean(fm.sinal_evolucao),
          evidencia_evolucao:     (fm.evidencia_evolucao as string) || null,
          acoes_pendentes_count:  acoesPendentes,
          acoes_vencidas_count:   acoesVencidas,
          precisa_1on1_frequencia: precisa1on1Frequencia,
          dias_sem_1on1:          diasSem1on1,
          dados_stale:            dadosStale,
        }
      })
  }

  private extractResumo(filePath: string): string {
    try {
      const content = readFileSync(filePath, 'utf-8')
      const body = content.replace(/^---\n[\s\S]*?\n---\n\n?/, '')
      const match = body.match(/## Resumo\n([\s\S]*?)(?:\n##|$)/)
      if (match) return match[1].trim().slice(0, 200)
    } catch { /* skip */ }
    return ''
  }

  serializeForPrompt(): string {
    const people = this.list()
    if (people.length === 0) return 'Nenhuma pessoa cadastrada no time.'
    return people
      .map((p) => `- ${p.nome} | ${p.cargo} | ${p.nivel} | ${p.relacao} | slug: ${p.slug}`)
      .join('\n')
  }
}

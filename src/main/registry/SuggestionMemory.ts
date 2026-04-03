import { existsSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { join } from 'path'
import yaml from 'js-yaml'
import { Logger } from '../logging/Logger'
import type { OneOnOneSugestao } from '../prompts/1on1-deep.prompt'

const log = Logger.getInstance().child('SuggestionMemory')

export interface SuggestionPadrao {
  tipo: string
  aceitas: number
  rejeitadas: number
  ultima_aceite?: string
  ultima_rejeicao?: string
  nota?: string
}

export interface SuggestionMemoryData {
  ultima_atualizacao: string
  padroes: SuggestionPadrao[]
  taxa_geral: { util: number; precisa_melhorar: number }
}

const ACEITA = new Set(['aceitou_explicito', 'aceitou_tacito'])
const REJEITADA = new Set(['resistiu'])

export class SuggestionMemory {
  private pessoasDir: string

  constructor(workspacePath: string) {
    this.pessoasDir = join(workspacePath, 'pessoas')
  }

  load(slug: string): SuggestionMemoryData | null {
    const filePath = join(this.pessoasDir, slug, 'suggestion_memory.yaml')
    if (!existsSync(filePath)) return null
    try {
      const raw = readFileSync(filePath, 'utf-8')
      return yaml.load(raw) as SuggestionMemoryData
    } catch {
      return null
    }
  }

  /**
   * Updates suggestion memory after a 1:1 deep pass.
   * Classifies each sugestao by tipo (from the action it generated, or 'geral')
   * and tracks acceptance/rejection patterns.
   */
  updateFromSugestoes(
    slug: string,
    sugestoes: OneOnOneSugestao[],
    acoesTipos: Map<string, string>,
  ): void {
    if (sugestoes.length === 0) return

    const memory = this.load(slug) ?? {
      ultima_atualizacao: '',
      padroes: [],
      taxa_geral: { util: 0, precisa_melhorar: 0 },
    }

    const today = new Date().toISOString().slice(0, 10)

    for (const s of sugestoes) {
      const aceita = ACEITA.has(s.resposta_liderado)
      const rejeitada = REJEITADA.has(s.resposta_liderado)
      if (!aceita && !rejeitada) continue

      // Determine tipo: look up from acoes_liderado tipo if available, else 'geral'
      const tipo = acoesTipos.get(s.descricao) ?? 'geral'

      let padrao = memory.padroes.find(p => p.tipo === tipo)
      if (!padrao) {
        padrao = { tipo, aceitas: 0, rejeitadas: 0 }
        memory.padroes.push(padrao)
      }

      if (aceita) {
        padrao.aceitas++
        padrao.ultima_aceite = today
      } else {
        padrao.rejeitadas++
        padrao.ultima_rejeicao = today
      }
    }

    memory.ultima_atualizacao = today

    const filePath = join(this.pessoasDir, slug, 'suggestion_memory.yaml')
    const tmpPath = filePath + '.tmp'
    writeFileSync(tmpPath, yaml.dump(memory, { lineWidth: 120 }), 'utf-8')
    renameSync(tmpPath, filePath)
    log.debug('suggestion memory atualizada', { slug, padroes: memory.padroes.length })
  }

  /**
   * Builds a summary string for injection into the agenda prompt.
   * Returns null if no meaningful patterns exist.
   */
  buildSummary(slug: string): string | null {
    const memory = this.load(slug)
    if (!memory || memory.padroes.length === 0) return null

    const linhas: string[] = []

    const resistencias = memory.padroes.filter(p => {
      const total = p.aceitas + p.rejeitadas
      return total >= 3 && p.rejeitadas / total > 0.6
    })
    if (resistencias.length > 0) {
      linhas.push(
        `Este liderado tende a RESISTIR a sugestões do tipo: ${resistencias.map(r => r.tipo).join(', ')}. Evite sugestões nessas áreas ou aborde com muito contexto.`,
      )
    }

    const receptivos = memory.padroes.filter(p => {
      const total = p.aceitas + p.rejeitadas
      return total >= 2 && p.aceitas / total > 0.7
    })
    if (receptivos.length > 0) {
      linhas.push(
        `Este liderado é receptivo a sugestões do tipo: ${receptivos.map(r => r.tipo).join(', ')}. Sugestões nessas áreas têm boa aceitação.`,
      )
    }

    return linhas.length > 0 ? linhas.join('\n') : null
  }
}

import { existsSync, readFileSync, writeFileSync, copyFileSync, renameSync } from 'fs'
import { join } from 'path'
import { runWithProvider } from './ClaudeRunner'
import type { AppSettings } from '../registry/SettingsManager'
import { buildCompressionPrompt, type CompressionAIResult } from '../prompts/compression.prompt'

const SECTION_PATTERNS = {
  resumo:              { open: '<!-- BLOCO GERENCIADO PELA IA — reescrito a cada ingestão -->',                    close: '<!-- FIM BLOCO RESUMO -->' },
  resumos_anteriores:  { open: '<!-- BLOCO GERENCIADO PELA IA — histórico de resumos (max 3) -->',                close: '<!-- FIM BLOCO RESUMOS_ANTERIORES -->' },
  atencao:             { open: '<!-- BLOCO GERENCIADO PELA IA — append apenas -->',                                close: '<!-- FIM BLOCO ATENCAO -->' },
  conquistas:          { open: '<!-- BLOCO GERENCIADO PELA IA — append apenas (conquistas) -->',                   close: '<!-- FIM BLOCO CONQUISTAS -->' },
  temas:               { open: '<!-- BLOCO GERENCIADO PELA IA — lista deduplicada, substituída a cada ingestão -->', close: '<!-- FIM BLOCO TEMAS -->' },
}

export class ProfileCompressor {
  private pessoasDir: string
  private claudeBin: string

  constructor(private workspacePath: string, private settings: AppSettings) {
    this.pessoasDir = join(workspacePath, 'pessoas')
    this.claudeBin = settings.claudeBinPath
  }

  /**
   * Compresses the perfil.md for a given slug.
   * Frontmatter and historico blocks are NEVER modified — only body sections.
   * A .bak backup is created before writing.
   * Safe to call: any error is caught and logged, original file is never lost.
   */
  async compress(slug: string, totalArtefatos: number): Promise<void> {
    const perfilPath = join(this.pessoasDir, slug, 'perfil.md')
    if (!existsSync(perfilPath)) return

    const original = readFileSync(perfilPath, 'utf-8')

    const resumoEvolutivo    = this.extractBlock(original, 'resumo')
    const resumosAnteriores  = this.extractBlock(original, 'resumos_anteriores')
    const pontosAtencao      = this.extractBlock(original, 'atencao')
    const conquistas         = this.extractBlock(original, 'conquistas')
    const temas              = this.extractBlock(original, 'temas')

    const prompt = buildCompressionPrompt({
      slug, totalArtefatos, resumoEvolutivo, pontosAtencao, conquistas, temas,
      resumosAnteriores: resumosAnteriores || undefined,
    })

    const result = await runWithProvider('profileCompression', this.settings, prompt, {
      claudeBinPath: this.claudeBin,
      claudeTimeoutMs: 120_000,
    })
    if (!result.success || !result.data) {
      console.warn(`[ProfileCompressor] falhou para "${slug}": ${result.error ?? 'sem dados'}`)
      return
    }

    const compressed = result.data as CompressionAIResult

    // Validate: active attention points must be preserved
    const activePoints = pontosAtencao
      .split('\n')
      .filter((l) => l.trim() && !l.trim().startsWith('~~'))
    const compressedPoints = compressed.pontos_ativos ?? []
    if (activePoints.length > 0 && compressedPoints.length < activePoints.length) {
      console.warn(
        `[ProfileCompressor] validação falhou para "${slug}": ${activePoints.length} pontos ativos → ${compressedPoints.length} após compressão. Abortando.`
      )
      return
    }

    // Apply compressed sections — frontmatter and historico blocks are untouched
    let updated = original
    updated = this.replaceBlock(updated, 'resumo',     compressed.resumo_evolutivo ?? resumoEvolutivo)
    updated = this.replaceBlock(updated, 'atencao',    compressedPoints.map((p) => `- ${p}`).join('\n'))
    updated = this.replaceBlock(updated, 'conquistas', (compressed.conquistas ?? []).map((c) => `- ${c}`).join('\n'))
    updated = this.replaceBlock(updated, 'temas',      (compressed.temas ?? []).map((t) => `- ${t}`).join('\n'))

    // Atomic write with backup
    const bakPath = perfilPath + '.bak'
    const tmpPath = perfilPath + '.tmp'
    copyFileSync(perfilPath, bakPath)
    writeFileSync(tmpPath, updated, 'utf-8')
    renameSync(tmpPath, perfilPath)

    console.log(`[ProfileCompressor] "${slug}" comprimido em ${totalArtefatos} artefatos`)
  }

  private extractBlock(content: string, key: keyof typeof SECTION_PATTERNS): string {
    const { open, close } = SECTION_PATTERNS[key]
    const escapedOpen  = open.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const escapedClose = close.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`${escapedOpen}\n([\\s\\S]*?)\n${escapedClose}`)
    const m = content.match(re)
    return m ? m[1] : ''
  }

  private replaceBlock(content: string, key: keyof typeof SECTION_PATTERNS, newBody: string): string {
    const { open, close } = SECTION_PATTERNS[key]
    const escapedOpen  = open.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const escapedClose = close.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(${escapedOpen}\n)[\\s\\S]*?(\n${escapedClose})`)
    return content.replace(re, `$1${newBody}$2`)
  }
}

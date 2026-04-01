import { existsSync, readFileSync, writeFileSync, renameSync, copyFileSync } from 'fs'
import { join } from 'path'
import type { IngestionAIResult } from '../prompts/ingestion.prompt'
import type { CerimoniaSinalResult } from '../prompts/cerimonia-sinal.prompt'
import type { OneOnOneResult } from '../prompts/1on1-deep.prompt'
import { ActionRegistry } from '../registry/ActionRegistry'
import { CURRENT_SCHEMA_VERSION } from '../migration/ProfileMigration'
import { Logger } from '../logging/Logger'

const log = Logger.getInstance().child('ArtifactWriter')

const SECTION = {
  resumo:              { open: '<!-- BLOCO GERENCIADO PELA IA — reescrito a cada ingestão -->',                    close: '<!-- FIM BLOCO RESUMO -->' },
  resumos_anteriores:  { open: '<!-- BLOCO GERENCIADO PELA IA — histórico de resumos (max 3) -->',                close: '<!-- FIM BLOCO RESUMOS_ANTERIORES -->' },
  acoes:               { open: '<!-- BLOCO GERENCIADO PELA IA — append de novos itens -->',                        close: '<!-- FIM BLOCO ACOES -->' },
  atencao:             { open: '<!-- BLOCO GERENCIADO PELA IA — append apenas -->',                                close: '<!-- FIM BLOCO ATENCAO -->' },
  conquistas:          { open: '<!-- BLOCO GERENCIADO PELA IA — append apenas (conquistas) -->',                   close: '<!-- FIM BLOCO CONQUISTAS -->' },
  temas:               { open: '<!-- BLOCO GERENCIADO PELA IA — lista deduplicada, substituída a cada ingestão -->', close: '<!-- FIM BLOCO TEMAS -->' },
  historico:           { open: '<!-- BLOCO GERENCIADO PELA IA — append apenas, nunca reescrito -->',               close: '<!-- FIM BLOCO HISTORICO -->' },
  saude_historico:     { open: '<!-- BLOCO GERENCIADO PELA IA — append apenas (histórico de saúde) -->',           close: '<!-- FIM BLOCO SAUDE -->' },
  insights_1on1:       { open: '<!-- BLOCO GERENCIADO PELA IA — append apenas (insights 1on1) -->',                close: '<!-- FIM BLOCO INSIGHTS_1ON1 -->' },
  sinais_terceiros:    { open: '<!-- BLOCO GERENCIADO PELA IA — append apenas (sinais terceiros) -->',             close: '<!-- FIM BLOCO SINAIS_TERCEIROS -->' },
}

/**
 * Writes the processed artifact .md file and updates perfil.md atomically.
 */
export class ArtifactWriter {
  private pessoasDir: string
  private actionRegistry: ActionRegistry

  constructor(workspacePath: string) {
    this.pessoasDir = join(workspacePath, 'pessoas')
    this.actionRegistry = new ActionRegistry(workspacePath)
  }

  /**
   * Saves the artifact to pessoas/{slug}/historico/{date}-{slug}.md
   * with a formatted template (AI analysis + original content) and returns the file name.
   */
  writeArtifact(slug: string, result: IngestionAIResult, rawContent: string, fileNameOverride?: string): string {
    const { tipo, data_artefato: date, resumo, acoes_comprometidas, pontos_de_atencao,
            elogios_e_conquistas, temas_detectados, motivo_indicador, indicador_saude } = result

    const fileName = fileNameOverride ?? `${date}-${slug}.md`
    const dest = join(this.pessoasDir, slug, 'historico', fileName)

    const titulo = result.titulo ?? `${tipoLabel(tipo)} — ${slug} · ${date}`
    const participantes = result.participantes_nomes ?? []

    const confianca = result.confianca
    const sentimentosStr = serializeSentimentos(result)
    const lines: string[] = [
      `---`,
      `tipo: ${tipo}`,
      `data: ${date}`,
      `pessoa: ${slug}`,
      `saude: ${indicador_saude}`,
      `confianca: ${confianca}`,
      ...(sentimentosStr ? [`sentimentos: ${sentimentosStr}`] : []),
      `---`,
      ``,
      `# ${titulo}`,
      ``,
    ]

    if (participantes.length > 0) {
      lines.push(`**Participantes:** ${participantes.join(', ')}`)
      lines.push(``)
    }

    lines.push(`## Resumo`)
    lines.push(resumo)
    lines.push(``)

    if (acoes_comprometidas.length > 0) {
      lines.push(`## Ações Comprometidas`)
      acoes_comprometidas.forEach((a) => {
        const prazo = a.prazo_iso ? ` até ${a.prazo_iso}` : ''
        lines.push(`- [ ] **${a.responsavel}:** ${a.descricao}${prazo}`)
      })
      lines.push(``)
    }

    if (pontos_de_atencao.length > 0) {
      lines.push(`## Pontos de Atenção`)
      pontos_de_atencao.forEach((p) => lines.push(`- ${formatPontoAtencao(p)}`))
      lines.push(``)
    }

    if (elogios_e_conquistas.length > 0) {
      lines.push(`## Elogios e Conquistas`)
      elogios_e_conquistas.forEach((e) => lines.push(`- ${e}`))
      lines.push(``)
    }

    if (temas_detectados.length > 0) {
      lines.push(`## Temas`)
      temas_detectados.forEach((t) => lines.push(`- ${t}`))
      lines.push(``)
    }

    if (motivo_indicador) {
      lines.push(`## Indicador de Saúde`)
      lines.push(`**${indicador_saude}** — ${motivo_indicador}`)
      lines.push(``)
    }

    lines.push(`---`)
    lines.push(``)
    lines.push(`## Conteúdo Original`)
    lines.push(``)
    lines.push(rawContent.trim())

    writeFileSync(dest, lines.join('\n'), 'utf-8')

    // Create action entities from acoes_comprometidas
    if (result.acoes_comprometidas.length > 0) {
      this.actionRegistry.createFromArtifact(slug, result.acoes_comprometidas, fileName, result.data_artefato)
    }


    return fileName
  }

  /**
   * Updates perfil.md for the given slug using the AI analysis result.
   * Atomic write: writes to perfil.md.tmp then renames.
   * Returns the updated total_artefatos count so callers can decide whether to compress.
   */
  updatePerfil(slug: string, result: IngestionAIResult, artifactFileName: string): { totalArtefatos: number } {
    const perfilPath = join(this.pessoasDir, slug, 'perfil.md')
    const tmpPath    = perfilPath + '.tmp'
    const bakPath    = perfilPath + '.bak'

    // Backup existing
    if (existsSync(perfilPath)) copyFileSync(perfilPath, bakPath)

    const existing = existsSync(perfilPath) ? readFileSync(perfilPath, 'utf-8') : null
    const now = new Date().toISOString()
    const today = now.slice(0, 10)

    let updated: string

    if (!existing) {
      updated = this.createPerfil(slug, result, artifactFileName, now, today)
    } else {
      updated = this.updateExistingPerfil(existing, result, artifactFileName, now, today)
    }

    writeFileSync(tmpPath, updated, 'utf-8')
    renameSync(tmpPath, perfilPath)

    const totalMatch = updated.match(/total_artefatos:\s*(\d+)/)
    const totalArtefatos = totalMatch ? parseInt(totalMatch[1]) : 0
    return { totalArtefatos }
  }

  // ── Private helpers ───────────────────────────────────────────

  private createPerfil(
    slug: string,
    result: IngestionAIResult,
    artifactFileName: string,
    now: string,
    today: string,
  ): string {
    const acoesLines   = result.acoes_comprometidas.map((a) => {
      const prazo = a.prazo_iso ? ` até ${a.prazo_iso}` : ''
      return `- [ ] **${a.responsavel}:** ${a.descricao}${prazo}`
    }).join('\n') || '- [ ] (sem ações comprometidas)'
    const atencaoLines = result.pontos_de_atencao.map((p) => `- **${today}:** ${formatPontoAtencao(p)}`).join('\n') || ''
    const elogioLines  = result.elogios_e_conquistas.map((e) => `- **${today}:** ${e}`).join('\n') || ''
    const dedupedTemasNew = this.deduplicateThemes(result.temas_atualizados)
    const temasLines   = dedupedTemasNew.map((t) => `- ${t}`).join('\n') || ''

    const sentimentosStr = serializeSentimentos(result)
    return `---
slug: "${slug}"
schema_version: ${CURRENT_SCHEMA_VERSION}
ultima_atualizacao: "${now}"
ultima_ingestao: "${today}"
total_artefatos: 1
ultimo_1on1: ${['1on1', 'feedback'].includes(result.tipo) && result.necessita_1on1 === false ? `"${result.data_artefato}"` : 'null'}
alertas_ativos: []
saude: "${result.indicador_saude}"
ultima_confianca: "${result.confianca ?? 'media'}"
necessita_1on1: ${result.necessita_1on1 ?? false}
motivo_1on1: ${result.motivo_1on1 ? `"${result.motivo_1on1}"` : 'null'}
alerta_estagnacao: ${result.alerta_estagnacao ?? false}
motivo_estagnacao: ${result.motivo_estagnacao ? `"${result.motivo_estagnacao}"` : 'null'}
sinal_evolucao: ${result.sinal_evolucao ?? false}
evidencia_evolucao: ${result.evidencia_evolucao ? `"${result.evidencia_evolucao}"` : 'null'}
tendencia_emocional: null
nota_tendencia: null
ultimo_followup_acoes: null
---

# Perfil Vivo — ${slug}

## Resumo Evolutivo
${SECTION.resumo.open}
${result.resumo_evolutivo}
${SECTION.resumo.close}

## Resumos Anteriores
${SECTION.resumos_anteriores.open}
${SECTION.resumos_anteriores.close}

## Ações Pendentes
${SECTION.acoes.open}
${acoesLines}
${SECTION.acoes.close}

## Pontos de Atenção Ativos
${SECTION.atencao.open}
${atencaoLines}
${SECTION.atencao.close}

## Conquistas e Elogios
${SECTION.conquistas.open}
${elogioLines}
${SECTION.conquistas.close}

## Temas Recorrentes
${SECTION.temas.open}
${temasLines}
${SECTION.temas.close}

## Histórico de Artefatos
${SECTION.historico.open}
- ${result.data_artefato} | ${result.tipo} | [${artifactFileName}](../historico/${artifactFileName})
${SECTION.historico.close}

## Histórico de Saúde
${SECTION.saude_historico.open}
- ${result.data_artefato} | ${result.indicador_saude} | ${result.motivo_indicador}${sentimentosStr ? ` | [${sentimentosStr}]` : ''}
${SECTION.saude_historico.close}

## Insights de 1:1
${SECTION.insights_1on1.open}
${SECTION.insights_1on1.close}

## Sinais de Terceiros
${SECTION.sinais_terceiros.open}
${SECTION.sinais_terceiros.close}
`
  }

  private updateExistingPerfil(
    existing: string,
    result: IngestionAIResult,
    artifactFileName: string,
    now: string,
    today: string,
  ): string {
    // 1. Update frontmatter
    let updated = this.updateFrontmatter(existing, result, now)

    // 1.5. Archive current resumo before overwriting it
    updated = this.archiveCurrentResumo(updated, today)

    // 2. Replace Resumo Evolutivo (full replace)
    updated = this.replaceBlock(updated, 'resumo', result.resumo_evolutivo)

    // 3. Append Ações Pendentes
    if (result.acoes_comprometidas.length > 0) {
      const newLines = result.acoes_comprometidas.map((a) => {
        const prazo = a.prazo_iso ? ` até ${a.prazo_iso}` : ''
        return `- [ ] **${a.responsavel}:** ${a.descricao}${prazo}`
      }).join('\n')
      updated = this.appendToBlock(updated, 'acoes', newLines)
    }

    // 4. Mark resolved attention points, then append new ones
    const resolvidos = result.pontos_resolvidos ?? []
    if (resolvidos.length > 0) {
      updated = this.markResolvedPoints(updated, resolvidos, today)
    }
    if (result.pontos_de_atencao.length > 0) {
      const newLines = result.pontos_de_atencao.map((p) => `- **${today}:** ${formatPontoAtencao(p)}`).join('\n')
      updated = this.appendToBlock(updated, 'atencao', newLines)
    }

    // 5. Append Conquistas e Elogios
    if (result.elogios_e_conquistas.length > 0) {
      const newLines = result.elogios_e_conquistas.map((e) => `- **${today}:** ${e}`).join('\n')
      updated = this.appendToBlock(updated, 'conquistas', newLines)
    }

    // 6. Replace Temas Recorrentes (fuzzy deduped list)
    const dedupedTemas = this.deduplicateThemes(result.temas_atualizados)
    const temasLines = dedupedTemas.map((t) => `- ${t}`).join('\n')
    updated = this.replaceBlock(updated, 'temas', temasLines)

    // 7. Append Histórico de Artefatos
    const histLine = `- ${result.data_artefato} | ${result.tipo} | [${artifactFileName}](../historico/${artifactFileName})`
    updated = this.appendToBlock(updated, 'historico', histLine)

    // 8. Append Histórico de Saúde — adds section if not present (e.g. older perfis)
    const sentimentosStr = serializeSentimentos(result)
    const saudeLine = `- ${result.data_artefato} | ${result.indicador_saude} | ${result.motivo_indicador}${sentimentosStr ? ` | [${sentimentosStr}]` : ''}`
    if (updated.includes(SECTION.saude_historico.open)) {
      updated = this.appendToBlock(updated, 'saude_historico', saudeLine)
    } else {
      updated = updated.trimEnd() + `\n\n## Histórico de Saúde\n${SECTION.saude_historico.open}\n${saudeLine}\n${SECTION.saude_historico.close}\n`
    }

    // Auto-compress health history when exceeding 50 active entries
    updated = this.compressHealthHistory(updated)

    return updated
  }

  /**
   * Archives the current Resumo Evolutivo into the resumos_anteriores block (max 3 entries)
   * before it gets overwritten by the next ingestion pass.
   *
   * - If the block already exists: prepend new dated entry, keep latest 3.
   * - If the block doesn't exist (older perfis): inject it right after FIM BLOCO RESUMO.
   * - If the current resumo is empty: no-op (nothing to archive).
   */
  private archiveCurrentResumo(content: string, today: string): string {
    const { open: rOpen, close: rClose } = SECTION.resumo
    const { open: hOpen, close: hClose } = SECTION.resumos_anteriores

    // Extract current resumo text
    const escapedROpen  = rOpen.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const escapedRClose = rClose.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const resumoRe = new RegExp(`${escapedROpen}\n([\\s\\S]*?)\n${escapedRClose}`)
    const resumoMatch = content.match(resumoRe)
    if (!resumoMatch || !resumoMatch[1].trim()) return content

    const currentResumo = resumoMatch[1].trim()
    const newEntry = `### ${today}\n${currentResumo}`

    if (content.includes(hOpen)) {
      // Block exists — prepend entry and keep max 3
      const escapedHOpen  = hOpen.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const escapedHClose = hClose.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(`(${escapedHOpen}\n)([\\s\\S]*?)(${escapedHClose})`)
      return content.replace(re, (_match, open, body, close) => {
        const existing = body.trim()
        const entries = existing
          ? existing.split(/(?=### \d{4}-\d{2}-\d{2})/).map((e) => e.trim()).filter(Boolean)
          : []
        const allEntries = [newEntry, ...entries].slice(0, 3)
        return `${open}${allEntries.join('\n\n')}\n${close}`
      })
    } else {
      // Block doesn't exist — inject after FIM BLOCO RESUMO
      return content.replace(
        `${rClose}\n`,
        `${rClose}\n\n## Resumos Anteriores\n${hOpen}\n${newEntry}\n${hClose}\n`,
      )
    }
  }

  private updateFrontmatter(content: string, result: IngestionAIResult, now: string): string {
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
    if (!fmMatch) return content

    let fm = fmMatch[1]

    // ultima_atualizacao + ultima_ingestao
    fm = fm.replace(/ultima_atualizacao:.*/, `ultima_atualizacao: "${now}"`)
    const today = now.slice(0, 10)
    if (/ultima_ingestao:/.test(fm)) {
      fm = fm.replace(/ultima_ingestao:.*/, `ultima_ingestao: "${today}"`)
    } else {
      fm = fm.replace(/ultima_atualizacao:.*/, `ultima_atualizacao: "${now}"\nultima_ingestao: "${today}"`)
    }

    // total_artefatos: increment
    fm = fm.replace(/total_artefatos:\s*(\d+)/, (_, n) => `total_artefatos: ${parseInt(n) + 1}`)

    // ultimo_1on1: only update for genuinely bilateral encounters.
    // Group meetings (daily, planning, retro, reuniao) never count as a 1:1 —
    // they would reset the counter incorrectly even without a real bilateral meeting.
    const BILATERAL_TIPOS = ['1on1', 'feedback']
    if (BILATERAL_TIPOS.includes(result.tipo) && result.necessita_1on1 === false) {
      fm = fm.replace(/ultimo_1on1:.*/, `ultimo_1on1: "${result.data_artefato}"`)
    }

    // saude + ultima_confianca + saude_anterior (audit trail de transições)
    const currentSaudeMatch = /saude:\s*"(\w+)"/.exec(fm)
    const currentSaude = currentSaudeMatch?.[1] ?? null
    const novaSaude = result.indicador_saude
    if (currentSaude && currentSaude !== novaSaude) {
      // Saúde mudou — registrar saude_anterior para contexto do deep pass
      if (/saude_anterior:/.test(fm)) {
        fm = fm.replace(/saude_anterior:.*/, `saude_anterior: "${currentSaude}"`)
      } else {
        fm = fm.replace(/saude:.*/, `saude: "${novaSaude}"\nsaude_anterior: "${currentSaude}"`)
      }
    }
    fm = fm.replace(/saude:.*/, `saude: "${novaSaude}"`)
    const confianca = result.confianca
    if (/ultima_confianca:/.test(fm)) {
      fm = fm.replace(/ultima_confianca:.*/, `ultima_confianca: "${confianca}"`)
    } else {
      fm = fm.replace(/saude:.*/, `saude: "${novaSaude}"\nultima_confianca: "${confianca}"`)
    }

    // necessita_1on1 + motivo_1on1
    const necessita = result.necessita_1on1 ?? false
    const motivo    = result.motivo_1on1 ? `"${result.motivo_1on1}"` : 'null'
    if (/necessita_1on1:/.test(fm)) {
      fm = fm.replace(/necessita_1on1:.*/, `necessita_1on1: ${necessita}`)
      fm = fm.replace(/motivo_1on1:.*/, `motivo_1on1: ${motivo}`)
    } else {
      fm += `\nnecessita_1on1: ${necessita}\nmotivo_1on1: ${motivo}`
    }

    // alerta_estagnacao + motivo_estagnacao
    const estagnacao       = result.alerta_estagnacao ?? false
    const motivoEstagnacao = result.motivo_estagnacao ? `"${result.motivo_estagnacao}"` : 'null'
    if (/alerta_estagnacao:/.test(fm)) {
      fm = fm.replace(/alerta_estagnacao:.*/, `alerta_estagnacao: ${estagnacao}`)
      fm = fm.replace(/motivo_estagnacao:.*/, `motivo_estagnacao: ${motivoEstagnacao}`)
    } else {
      fm += `\nalerta_estagnacao: ${estagnacao}\nmotivo_estagnacao: ${motivoEstagnacao}`
    }

    // sinal_evolucao + evidencia_evolucao
    const evolucao         = result.sinal_evolucao ?? false
    const evidencia        = result.evidencia_evolucao ? `"${result.evidencia_evolucao}"` : 'null'
    if (/sinal_evolucao:/.test(fm)) {
      fm = fm.replace(/sinal_evolucao:.*/, `sinal_evolucao: ${evolucao}`)
      fm = fm.replace(/evidencia_evolucao:.*/, `evidencia_evolucao: ${evidencia}`)
    } else {
      fm += `\nsinal_evolucao: ${evolucao}\nevidencia_evolucao: ${evidencia}`
    }

    return content.replace(/^---\n[\s\S]*?\n---/, `---\n${fm}\n---`)
  }

  private replaceBlock(content: string, blockKey: keyof typeof SECTION, newBody: string): string {
    const { open, close } = SECTION[blockKey]
    const escaped = {
      open:  open.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      close: close.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    }

    const re = new RegExp(`(${escaped.open}\n)[\\s\\S]*?(${escaped.close})`)
    if (re.test(content)) {
      return content.replace(re, `$1${newBody}\n$2`)
    }
    return content
  }

  private appendToBlock(content: string, blockKey: keyof typeof SECTION, newLines: string): string {
    const { open, close } = SECTION[blockKey]
    const escapedOpen  = open.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const escapedClose = close.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Anchor to the specific block using its unique open marker, then find the first close after it
    const re = new RegExp(`(${escapedOpen}\n)([\\s\\S]*?)(${escapedClose})`)
    if (re.test(content)) {
      return content.replace(re, `$1$2${newLines}\n$3`)
    }
    return content
  }

  /**
   * Marks resolved attention points with strikethrough in the atencao block.
   *
   * Uses bidirectional normalized match to handle two failure modes:
   * - False negative: Claude omits the "**YYYY-MM-DD:**" date prefix stored in the perfil
   * - False positive: 40-char prefix overlap between similar points
   *
   * A match is valid only when both normalized strings are >= 15 chars
   * (prevents accidental matches on very short fragments).
   */
  private markResolvedPoints(content: string, resolvidos: string[], today: string): string {
    const { open, close } = SECTION.atencao
    const escapedOpen  = open.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const escapedClose = close.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(${escapedOpen}\n)([\\s\\S]*?)(\n${escapedClose})`)
    const normalizedResolvidos = resolvidos.map(normalizePointText).filter((r) => r.length >= 15)
    return content.replace(re, (_match, blockOpen, body, blockClose) => {
      const lines = body.split('\n')
      const marked = lines.map((line: string) => {
        if (line.startsWith('~~')) return line // already resolved
        const normalizedLine = normalizePointText(line)
        if (normalizedLine.length < 15) return line
        const isResolved = normalizedResolvidos.some((r) =>
          normalizedLine.includes(r) || r.includes(normalizedLine)
        )
        if (isResolved) return `~~${line}~~ ✓ *(resolvido em ${today})*`
        return line
      })
      return `${blockOpen}${marked.join('\n')}${blockClose}`
    })
  }

  /**
   * Applies 1:1 deep pass results to an existing perfil.md.
   * Updates: frontmatter (tendencia, followup date), "Insights de 1:1", "Sinais de Terceiros".
   * Also appends resumo_executivo_rh to the artifact file in historico/.
   * Atomic write: .tmp → rename.
   */
  update1on1Results(slug: string, result: OneOnOneResult, artifactFileName: string): void {
    const perfilPath = join(this.pessoasDir, slug, 'perfil.md')
    if (!existsSync(perfilPath)) return

    const bakPath = perfilPath + '.bak'
    const tmpPath = perfilPath + '.tmp'
    copyFileSync(perfilPath, bakPath)

    let updated = readFileSync(perfilPath, 'utf-8')
    const now = new Date().toISOString()
    const today = now.slice(0, 10)

    // 1. Update frontmatter: tendencia_emocional, nota_tendencia, ultimo_followup_acoes
    const fmMatch = updated.match(/^---\n([\s\S]*?)\n---/)
    if (fmMatch) {
      let fm = fmMatch[1]
      fm = fm.replace(/ultima_atualizacao:.*/, `ultima_atualizacao: "${now}"`)

      const tendencia = result.tendencia_emocional
      const notaTendencia = result.nota_tendencia ? `"${result.nota_tendencia.replace(/"/g, '\\"')}"` : 'null'
      if (/tendencia_emocional:/.test(fm)) {
        fm = fm.replace(/tendencia_emocional:.*/, `tendencia_emocional: "${tendencia}"`)
        fm = fm.replace(/nota_tendencia:.*/, `nota_tendencia: ${notaTendencia}`)
      } else {
        fm += `\ntendencia_emocional: "${tendencia}"\nnota_tendencia: ${notaTendencia}`
      }

      if (/ultimo_followup_acoes:/.test(fm)) {
        fm = fm.replace(/ultimo_followup_acoes:.*/, `ultimo_followup_acoes: "${today}"`)
      } else {
        fm += `\nultimo_followup_acoes: "${today}"`
      }

      updated = updated.replace(/^---\n[\s\S]*?\n---/, `---\n${fm}\n---`)
    }

    // 2. Append insights de 1:1
    if (result.insights_1on1.length > 0) {
      const insightLines = result.insights_1on1.map((i) => {
        return `**${today}:** [${i.categoria}] ${i.conteudo} *(${i.relevancia})*`
      }).join('\n')
      if (updated.includes(SECTION.insights_1on1.open)) {
        updated = this.appendToBlock(updated, 'insights_1on1', insightLines)
      } else {
        updated = updated.trimEnd() + `\n\n## Insights de 1:1\n${SECTION.insights_1on1.open}\n${insightLines}\n${SECTION.insights_1on1.close}\n`
      }
    }

    // 3. Append sinais de terceiros (correlações confirmadas)
    if (result.correlacoes_terceiros.length > 0) {
      const sinaisLines = result.correlacoes_terceiros.map((c) => {
        const confirmacao = c.confirmado_pelo_liderado
          ? `→ **Confirmado pelo liderado em 1:1 de ${today}**`
          : `→ Não confirmado em 1:1 de ${today}`
        const contexto = c.contexto_confirmacao ? ` (${c.contexto_confirmacao})` : ''
        return `**${today} (${c.fonte}):** ${c.sinal_original}\n  ${confirmacao}${contexto}`
      }).join('\n')
      if (updated.includes(SECTION.sinais_terceiros.open)) {
        updated = this.appendToBlock(updated, 'sinais_terceiros', sinaisLines)
      } else {
        updated = updated.trimEnd() + `\n\n## Sinais de Terceiros\n${SECTION.sinais_terceiros.open}\n${sinaisLines}\n${SECTION.sinais_terceiros.close}\n`
      }
    }

    // 4. Append auto_percepcao to insights when present
    if (result.auto_percepcao) {
      const autoPercLine = `**${today}:** [auto_percepcao] ${result.auto_percepcao} *(alta)*`
      if (updated.includes(SECTION.insights_1on1.open)) {
        updated = this.appendToBlock(updated, 'insights_1on1', autoPercLine)
      }
    }

    // 5. Append PDI progress to insights when observed
    if (result.pdi_update?.progresso_observado) {
      const pdiLine = `**${today}:** [pdi] ${result.pdi_update.progresso_observado} *(alta)*`
      if (updated.includes(SECTION.insights_1on1.open)) {
        updated = this.appendToBlock(updated, 'insights_1on1', pdiLine)
      }
    }

    writeFileSync(tmpPath, updated, 'utf-8')
    renameSync(tmpPath, perfilPath)

    // 5. Append resumo_executivo_rh to the artifact file
    if (result.resumo_executivo_rh) {
      const artifactPath = join(this.pessoasDir, slug, 'historico', artifactFileName)
      if (existsSync(artifactPath)) {
        let artifactContent = readFileSync(artifactPath, 'utf-8')
        if (!artifactContent.includes('## Resumo Executivo (Qulture Rocks)')) {
          artifactContent += `\n\n---\n\n## Resumo Executivo (Qulture Rocks)\n\n${result.resumo_executivo_rh}\n`
          writeFileSync(artifactPath, artifactContent, 'utf-8')
        }
      }
    }
  }

  /**
   * Applies per-person ceremony signals to an existing perfil.md.
   * Unlike updatePerfil(), this method:
   *   - Does NOT rewrite Resumo Evolutivo (no full narrative context for group ceremonies)
   *   - Does NOT add to Histórico de Artefatos (collective artifact already captured in _coletivo)
   *   - Does NOT increment total_artefatos or update ultima_ingestao
   *   - DOES update frontmatter health/signal fields
   *   - DOES append to Pontos de Atenção, Conquistas, Temas
   *   - DOES append to Histórico de Saúde
   * Atomic write: .tmp → rename.
   */
  updatePerfilDeCerimonia(
    slug: string,
    sinal: CerimoniaSinalResult,
    ceremonyFileName: string,
    ceremonyTipo: string,
    ceremonyData: string,
  ): void {
    const perfilPath = join(this.pessoasDir, slug, 'perfil.md')

    const now = new Date().toISOString()
    const today = now.slice(0, 10)
    const tipoLabel = ceremonyTipo  // e.g. 'daily', 'planning', 'retro'

    let updated: string

    const tmpPath = perfilPath + '.tmp'

    if (!existsSync(perfilPath)) {
      // No perfil.md yet — scaffold a minimal profile from ceremony signals
      updated = this.createPerfilFromCerimonia(slug, sinal, now, today)
    } else {
      const bakPath = perfilPath + '.bak'
      copyFileSync(perfilPath, bakPath)

      const existing = readFileSync(perfilPath, 'utf-8')
      updated = this.updateFrontmatterFromCerimonia(existing, sinal, now)
    }

    // Pontos de desenvolvimento + feedbacks negativos → Pontos de Atenção Ativos
    const atencaoItems = [...sinal.pontos_de_desenvolvimento, ...sinal.feedbacks_negativos]
    if (atencaoItems.length > 0) {
      const newLines = atencaoItems
        .map((p) => `- **${today} (${tipoLabel}):** ${p}`)
        .join('\n')
      updated = this.appendToBlock(updated, 'atencao', newLines)
    }

    // Hard skills positivas + feedbacks positivos → Conquistas e Elogios
    const conquistaItems = [...sinal.hard_skills_observadas, ...sinal.feedbacks_positivos]
    if (conquistaItems.length > 0) {
      const newLines = conquistaItems
        .map((e) => `- **${today} (${tipoLabel}):** ${e}`)
        .join('\n')
      updated = this.appendToBlock(updated, 'conquistas', newLines)
    }

    // Soft skills + temas → merge into Temas Recorrentes (deduplication)
    const newTemas = [...sinal.soft_skills_observadas, ...sinal.temas_detectados]
    if (newTemas.length > 0) {
      const currentTemasBody = this.extractBlock(updated, 'temas')
      const currentTemas = currentTemasBody
        .split('\n')
        .map((l) => l.replace(/^-\s*/, '').trim())
        .filter(Boolean)
      const merged = this.deduplicateThemes([...currentTemas, ...newTemas])
      const temasLines = merged.map((t) => `- ${t}`).join('\n')
      updated = this.replaceBlock(updated, 'temas', temasLines)
    }

    // Histórico de Saúde — append ceremony signal (nota de baixa confiança quando aplicável)
    const confiancaLabel = sinal.confianca === 'baixa' ? ' (baixa confiança)' : ''
    const saudeLine = `- ${ceremonyData} | ${sinal.indicador_saude}${confiancaLabel} | (${tipoLabel}) ${sinal.motivo_indicador}`
    if (updated.includes(SECTION.saude_historico.open)) {
      updated = this.appendToBlock(updated, 'saude_historico', saudeLine)
    } else {
      log.warn('saude_historico section missing in perfil — auto-creating', { perfilPath: tmpPath })
      updated = updated.trimEnd() + `\n\n## Histórico de Saúde\n${SECTION.saude_historico.open}\n${saudeLine}\n${SECTION.saude_historico.close}\n`
    }

    // Auto-compress health history when exceeding 50 active entries
    updated = this.compressHealthHistory(updated)

    writeFileSync(tmpPath, updated, 'utf-8')
    renameSync(tmpPath, perfilPath)
  }

  /**
   * Creates a minimal perfil.md from ceremony signals when no profile exists yet.
   * This ensures people who are registered but never had an individual ingestion
   * still accumulate signals from collective ceremonies.
   */
  private createPerfilFromCerimonia(
    slug: string,
    sinal: CerimoniaSinalResult,
    now: string,
    today: string,
  ): string {
    return `---
slug: "${slug}"
schema_version: ${CURRENT_SCHEMA_VERSION}
ultima_atualizacao: "${now}"
ultima_ingestao: null
total_artefatos: 0
ultimo_1on1: null
alertas_ativos: []
saude: "${sinal.indicador_saude}"
ultima_confianca: "${sinal.confianca}"
necessita_1on1: ${sinal.necessita_1on1 ?? false}
motivo_1on1: ${sinal.motivo_1on1 ? `"${sinal.motivo_1on1}"` : 'null'}
alerta_estagnacao: false
motivo_estagnacao: null
sinal_evolucao: ${sinal.confianca !== 'baixa' && sinal.sinal_evolucao ? 'true' : 'false'}
evidencia_evolucao: ${sinal.confianca !== 'baixa' && sinal.evidencia_evolucao ? `"${sinal.evidencia_evolucao}"` : 'null'}
tendencia_emocional: null
nota_tendencia: null
ultimo_followup_acoes: null
---

# Perfil Vivo — ${slug}

## Resumo Evolutivo
${SECTION.resumo.open}
${sinal.resumo_evolutivo ?? `Perfil criado a partir de sinais de cerimônia coletiva (${today}). Aguardando primeira ingestão individual para narrativa completa.`}
${SECTION.resumo.close}

## Ações Pendentes
${SECTION.acoes.open}
${SECTION.acoes.close}

## Pontos de Atenção Ativos
${SECTION.atencao.open}
${SECTION.atencao.close}

## Conquistas e Elogios
${SECTION.conquistas.open}
${SECTION.conquistas.close}

## Temas Recorrentes
${SECTION.temas.open}
${SECTION.temas.close}

## Histórico de Artefatos
${SECTION.historico.open}
${SECTION.historico.close}

## Histórico de Saúde
${SECTION.saude_historico.open}
${SECTION.saude_historico.close}

## Insights de 1:1
${SECTION.insights_1on1.open}
${SECTION.insights_1on1.close}

## Sinais de Terceiros
${SECTION.sinais_terceiros.open}
${SECTION.sinais_terceiros.close}
`
  }

  private updateFrontmatterFromCerimonia(content: string, sinal: CerimoniaSinalResult, now: string): string {
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
    if (!fmMatch) return content

    let fm = fmMatch[1]

    // ultima_atualizacao — always update
    fm = fm.replace(/ultima_atualizacao:.*/, `ultima_atualizacao: "${now}"`)

    // saude + ultima_confianca + saude_anterior (audit trail de transições)
    // Sinal de baixa confiança nunca piora o indicador atual — apenas melhora ou mantém.
    const saudeOrder: Record<string, number> = { verde: 0, amarelo: 1, vermelho: 2 }
    const currentSaude = /saude:\s*"(\w+)"/.exec(fm)?.[1] ?? 'verde'
    const shouldUpdateSaude = sinal.confianca !== 'baixa' ||
      (saudeOrder[sinal.indicador_saude] ?? 0) < (saudeOrder[currentSaude] ?? 0)
    if (shouldUpdateSaude) {
      const novaSaudeCerimonia = sinal.indicador_saude
      if (currentSaude !== novaSaudeCerimonia) {
        if (/saude_anterior:/.test(fm)) {
          fm = fm.replace(/saude_anterior:.*/, `saude_anterior: "${currentSaude}"`)
        } else {
          fm = fm.replace(/saude:.*/, `saude: "${currentSaude}"\nsaude_anterior: "${currentSaude}"`)
        }
      }
      if (/ultima_confianca:/.test(fm)) {
        fm = fm.replace(/saude:.*/, `saude: "${novaSaudeCerimonia}"`)
        fm = fm.replace(/ultima_confianca:.*/, `ultima_confianca: "${sinal.confianca}"`)
      } else {
        fm = fm.replace(/saude:.*/, `saude: "${novaSaudeCerimonia}"\nultima_confianca: "${sinal.confianca}"`)
      }
    }

    // necessita_1on1 — only set to true, never clear an existing true
    const currentNecessita = /necessita_1on1:\s*true/.test(fm)
    if (!currentNecessita && sinal.necessita_1on1) {
      const motivo = sinal.motivo_1on1 ? `"${sinal.motivo_1on1}"` : 'null'
      if (/necessita_1on1:/.test(fm)) {
        fm = fm.replace(/necessita_1on1:.*/, `necessita_1on1: true`)
        fm = fm.replace(/motivo_1on1:.*/, `motivo_1on1: ${motivo}`)
      } else {
        fm += `\nnecessita_1on1: true\nmotivo_1on1: ${motivo}`
      }
    }

    // sinal_evolucao — only set to true, never clear an existing true.
    // Sinal de baixa confiança nunca constitui evidência suficiente de evolução.
    const currentEvolucao = /sinal_evolucao:\s*true/.test(fm)
    if (sinal.confianca !== 'baixa' && !currentEvolucao && sinal.sinal_evolucao) {
      const evidencia = sinal.evidencia_evolucao ? `"${sinal.evidencia_evolucao}"` : 'null'
      if (/sinal_evolucao:/.test(fm)) {
        fm = fm.replace(/sinal_evolucao:.*/, `sinal_evolucao: true`)
        fm = fm.replace(/evidencia_evolucao:.*/, `evidencia_evolucao: ${evidencia}`)
      } else {
        fm += `\nsinal_evolucao: true\nevidencia_evolucao: ${evidencia}`
      }
    }

    return content.replace(/^---\n[\s\S]*?\n---/, `---\n${fm}\n---`)
  }

  /**
   * Compresses health history when active entries exceed 50.
   * Oldest entries beyond the 50 most recent are grouped by month (YYYY-MM)
   * into summary lines with indicator counts and most frequent motivo.
   * Already-compressed lines (matching "- YYYY-MM:") are preserved as-is.
   */
  private compressHealthHistory(content: string): string {
    const body = this.extractBlock(content, 'saude_historico')
    if (!body.trim()) return content

    const lines = body.split('\n').filter((l) => l.trim())

    // Separate already-compressed summaries from active entries
    const compressed: string[] = []
    const active: { line: string; date: string; month: string; indicador: string; motivo: string }[] = []

    for (const line of lines) {
      const activeMatch = line.match(/^-\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(.+?)\s*\|\s*(.+)$/)
      if (activeMatch) {
        const [, date, indicador, motivo] = activeMatch
        active.push({
          line,
          date,
          month: date.slice(0, 7),
          indicador: indicador.trim().replace(/\s*\(baixa confiança\)/, ''),
          motivo: motivo.trim(),
        })
      } else if (line.match(/^-\s*\d{4}-\d{2}:/)) {
        // Already compressed monthly summary
        compressed.push(line)
      } else {
        // Unknown format — preserve as active to avoid data loss
        active.push({ line, date: '0000-00-00', month: '0000-00', indicador: '', motivo: '' })
      }
    }

    if (active.length <= 50) return content

    // Sort active by date ascending
    active.sort((a, b) => a.date.localeCompare(b.date))

    // Keep the 50 most recent, compress the rest
    const toKeep = active.slice(-50)
    const toCompress = active.slice(0, active.length - 50)

    // Group oldest entries by month
    const monthGroups = new Map<string, typeof toCompress>()
    for (const entry of toCompress) {
      if (!entry.indicador) {
        // Unknown format entries — keep as-is in compressed section
        compressed.push(entry.line)
        continue
      }
      const group = monthGroups.get(entry.month) || []
      group.push(entry)
      monthGroups.set(entry.month, group)
    }

    // Generate monthly summaries
    const newSummaries: string[] = []
    const sortedMonths = [...monthGroups.keys()].sort()
    for (const month of sortedMonths) {
      const entries = monthGroups.get(month)!
      const indicadorCounts = new Map<string, number>()
      const motivoCounts = new Map<string, number>()

      for (const e of entries) {
        indicadorCounts.set(e.indicador, (indicadorCounts.get(e.indicador) || 0) + 1)
        motivoCounts.set(e.motivo, (motivoCounts.get(e.motivo) || 0) + 1)
      }

      const indicadorStr = [...indicadorCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([ind, count]) => `${count}x ${ind}`)
        .join(', ')

      // Most frequent motivo
      let topMotivo = ''
      let topCount = 0
      for (const [m, c] of motivoCounts) {
        if (c > topCount) { topMotivo = m; topCount = c }
      }

      newSummaries.push(`- ${month}: ${indicadorStr} (${topMotivo})`)
    }

    // Rebuild block: old compressed + new summaries + recent 50
    const allCompressed = [...compressed, ...newSummaries].sort()
    const recentLines = toKeep.map((e) => e.line)
    const newBody = [...allCompressed, ...recentLines].join('\n')

    return this.replaceBlock(content, 'saude_historico', newBody)
  }

  /**
   * Normalizes a theme string for comparison: lowercase, no accents, trimmed.
   */
  private normalizeForComparison(tema: string): string {
    return tema
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
  }

  /**
   * Deduplicates themes using normalized substring matching.
   * When two themes overlap (one contains the other after normalization),
   * only the LONGER (more specific) original label survives.
   * Preserves original labels with accents.
   */
  private deduplicateThemes(themes: string[]): string[] {
    const result: { original: string; normalized: string }[] = []

    for (const tema of themes) {
      const normalized = this.normalizeForComparison(tema)
      if (!normalized) continue

      let dominated = false
      let dominatesIndex = -1

      for (let i = 0; i < result.length; i++) {
        const existing = result[i]
        if (existing.normalized.includes(normalized)) {
          // Existing is more specific (longer includes shorter) — skip new
          dominated = true
          break
        }
        if (normalized.includes(existing.normalized)) {
          // New is more specific — will replace existing
          dominatesIndex = i
          break
        }
      }

      if (dominated) continue

      if (dominatesIndex >= 0) {
        // Replace the less specific theme with the more specific one
        result[dominatesIndex] = { original: tema, normalized }
      } else {
        result.push({ original: tema, normalized })
      }
    }

    return result.map((r) => r.original)
  }

  private extractBlock(content: string, blockKey: keyof typeof SECTION): string {
    const { open, close } = SECTION[blockKey]
    const escaped = {
      open:  open.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      close: close.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    }
    const re = new RegExp(`${escaped.open}\n([\\s\\S]*?)\n${escaped.close}`)
    const m = content.match(re)
    return m ? m[1] : ''
  }
}

/**
 * Serializes sentimentos array to a compact string for storage.
 * Handles both new format ({valor, aspecto}) and legacy single-value format.
 * Returns empty string if no sentimentos available.
 */
function serializeSentimentos(result: IngestionAIResult): string {
  if (result.sentimentos?.length) {
    return result.sentimentos.map(s => `${s.valor}/${s.aspecto}`).join(', ')
  }
  if (result.sentimento_detectado) {
    return `${result.sentimento_detectado}/geral`
  }
  return ''
}

/**
 * Formats a PontoAtencao for markdown output.
 * Appends [recorrente] badge when frequencia is 'recorrente'.
 * Accepts legacy string format for backward compat.
 */
function formatPontoAtencao(p: import('../prompts/ingestion.prompt').PontoAtencao | string): string {
  if (typeof p === 'string') return p
  return p.frequencia === 'recorrente' ? `[recorrente] ${p.texto}` : p.texto
}

/**
 * Strips date prefix, markdown markers and normalizes whitespace for point matching.
 * Input:  "- **2026-03-10:** Dificuldade com comunicação no time A"
 * Output: "dificuldade com comunicação no time a"
 *
 * Also handles already-resolved lines:
 * Input:  "~~- **2026-03-10:** Ponto antigo~~ ✓ *(resolvido em 2026-03-20)*"
 * Output: "" (empty — will be skipped by length guard)
 */
function normalizePointText(text: string): string {
  return text
    .replace(/^\s*~~.*?~~\s*✓.*$/i, '')             // full strikethrough line → empty
    .replace(/^\s*-\s*/, '')                         // leading "- "
    .replace(/\*\*\d{4}-\d{2}-\d{2}:\*\*\s*/i, '')  // "**YYYY-MM-DD:** "
    .replace(/\*\*/g, '')                             // bold markers
    .replace(/\[recorrente\]\s*/gi, '')               // frequency badge
    .toLowerCase()
    .trim()
}

function tipoLabel(tipo: string): string {
  const map: Record<string, string> = {
    '1on1':     '1:1',
    'reuniao':  'Reunião',
    'daily':    'Daily',
    'planning': 'Planning',
    'retro':    'Retro',
    'feedback': 'Feedback',
    'outro':    'Artefato',
  }
  return map[tipo] ?? tipo
}

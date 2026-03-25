/**
 * Migrates perfil.md frontmatter between schema versions.
 * Apply whenever reading a perfil.md — always write CURRENT_SCHEMA_VERSION on new perfis.
 *
 * Versions:
 *   1 → 2: removed acoes_pendentes_count (now computed from ActionRegistry)
 *   2 → 3: unique open marker for conquistas block (was identical to atencao, breaking appendToBlock)
 *   3 → 4: unique close markers per block (all blocks shared '<!-- FIM DO BLOCO GERENCIADO -->')
 */
export const CURRENT_SCHEMA_VERSION = 4

export function migrateProfileContent(content: string): string {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (!fmMatch) return content

  let fm = fmMatch[1]
  let body = content

  const versionMatch = fm.match(/schema_version:\s*(\d+)/)
  const version = versionMatch ? parseInt(versionMatch[1]) : 1

  if (version >= CURRENT_SCHEMA_VERSION) return content

  // v1 → v2: drop acoes_pendentes_count — now computed from ActionRegistry
  if (version < 2) {
    fm = fm.replace(/acoes_pendentes_count:.*\n/, '')
  }

  // v2 → v3: give conquistas block a unique open marker so appendToBlock targets it correctly.
  // The old marker was identical to atencao's, causing all appended content to land in the
  // atencao block. We identify conquistas by its section header (## Conquistas e Elogios).
  if (version < 3) {
    body = body.replace(
      /(## Conquistas e Elogios\n)<!-- BLOCO GERENCIADO PELA IA — append apenas -->/,
      '$1<!-- BLOCO GERENCIADO PELA IA — append apenas (conquistas) -->',
    )
  }

  // v3 → v4: replace shared close marker '<!-- FIM DO BLOCO GERENCIADO -->' with unique
  // close markers per block. Each open marker is unique, so we process blocks top-to-bottom:
  // find the open, replace the FIRST shared close after it with the unique close for that block.
  if (version < 4) {
    body = migrateToUniqueCloseMarkers(body)
  }

  fm = fm.replace(/schema_version:\s*\d+/, `schema_version: ${CURRENT_SCHEMA_VERSION}`)
  return body.replace(/^---\n[\s\S]*?\n---/, `---\n${fm}\n---`)
}

/** Maps each block's unique open marker to its new unique close marker. Order matches file layout. */
const BLOCK_CLOSE_MAP: Array<{ open: string; newClose: string }> = [
  { open: '<!-- BLOCO GERENCIADO PELA IA — reescrito a cada ingestão -->',                    newClose: '<!-- FIM BLOCO RESUMO -->' },
  { open: '<!-- BLOCO GERENCIADO PELA IA — append de novos itens -->',                        newClose: '<!-- FIM BLOCO ACOES -->' },
  { open: '<!-- BLOCO GERENCIADO PELA IA — append apenas -->',                                newClose: '<!-- FIM BLOCO ATENCAO -->' },
  { open: '<!-- BLOCO GERENCIADO PELA IA — append apenas (conquistas) -->',                   newClose: '<!-- FIM BLOCO CONQUISTAS -->' },
  { open: '<!-- BLOCO GERENCIADO PELA IA — lista deduplicada, substituída a cada ingestão -->', newClose: '<!-- FIM BLOCO TEMAS -->' },
  { open: '<!-- BLOCO GERENCIADO PELA IA — append apenas, nunca reescrito -->',               newClose: '<!-- FIM BLOCO HISTORICO -->' },
  { open: '<!-- BLOCO GERENCIADO PELA IA — append apenas (histórico de saúde) -->',           newClose: '<!-- FIM BLOCO SAUDE -->' },
]

const OLD_CLOSE = '<!-- FIM DO BLOCO GERENCIADO -->'

/**
 * Replaces the shared close marker with a unique close marker per block.
 * Processes blocks in document order to avoid ambiguity with the repeated OLD_CLOSE string.
 */
function migrateToUniqueCloseMarkers(content: string): string {
  let result = content
  for (const { open, newClose } of BLOCK_CLOSE_MAP) {
    const openIdx = result.indexOf(open)
    if (openIdx === -1) continue
    const closeIdx = result.indexOf(OLD_CLOSE, openIdx)
    if (closeIdx === -1) continue
    result = result.slice(0, closeIdx) + newClose + result.slice(closeIdx + OLD_CLOSE.length)
  }
  return result
}

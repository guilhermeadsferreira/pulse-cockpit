/**
 * Migrates perfil.md frontmatter between schema versions.
 * Apply whenever reading a perfil.md — always write CURRENT_SCHEMA_VERSION on new perfis.
 *
 * Versions:
 *   1 → 2: removed acoes_pendentes_count (now computed from ActionRegistry)
 */
export const CURRENT_SCHEMA_VERSION = 2

export function migrateProfileContent(content: string): string {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (!fmMatch) return content

  let fm = fmMatch[1]

  const versionMatch = fm.match(/schema_version:\s*(\d+)/)
  const version = versionMatch ? parseInt(versionMatch[1]) : 1

  if (version >= CURRENT_SCHEMA_VERSION) return content

  // v1 → v2: drop acoes_pendentes_count — now computed from ActionRegistry
  if (version < 2) {
    fm = fm.replace(/acoes_pendentes_count:.*\n/, '')
    fm = fm.replace(/schema_version:\s*\d+/, `schema_version: ${CURRENT_SCHEMA_VERSION}`)
  }

  return content.replace(/^---\n[\s\S]*?\n---/, `---\n${fm}\n---`)
}
